import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { agentKeysTable, agentLogsTable } from "@workspace/db";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { hashAgentSecret } from "./agentSecrets.js";

export interface AuthenticatedRequest extends Request {
  agentKey?: {
    id: number;
    name: string;
    spendingLimitSats: number | null;
    maxDailySats: number | null;
    spentToday: number;
    spentDate: string | null;
  };
}

type AgentKeyRow = typeof agentKeysTable.$inferSelect;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function agentAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer bwk_")) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use: Authorization: Bearer bwk_...",
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const tokenHash = hashAgentSecret(token);

    const hashedKeys = await db
      .select()
      .from(agentKeysTable)
      .where(
        and(
          eq(agentKeysTable.connectionType, "api"),
          eq(agentKeysTable.secretHash, tokenHash),
        ),
      );

    let key = hashedKeys[0];

    // Support old plaintext API keys one last time, then upgrade them in place.
    if (!key) {
      const legacyKeys = await db
        .select()
        .from(agentKeysTable)
        .where(
          and(
            eq(agentKeysTable.connectionType, "api"),
            eq(agentKeysTable.secretKey, token),
          ),
        );

      key = legacyKeys[0];

      if (key) {
        await db
          .update(agentKeysTable)
          .set({
            secretHash: tokenHash,
            secretKey: null,
          })
          .where(eq(agentKeysTable.id, key.id));
      }
    }

    if (!key) {
      res.status(401).json({
        error: "invalid_key",
        message: "API key not found or has been revoked.",
      });
      return;
    }

    if (!key.isActive) {
      res.status(403).json({
        error: "key_disabled",
        message: "This API key has been disabled.",
      });
      return;
    }

    if (key.connectionType !== "api") {
      res.status(403).json({
        error: "wrong_key_type",
        message: "This key is not an API key.",
      });
      return;
    }

    const today = todayStr();
    const spentToday = key.spentDate === today ? (key.spentToday ?? 0) : 0;

    req.agentKey = {
      id: key.id,
      name: key.name,
      spendingLimitSats: key.spendingLimitSats,
      maxDailySats: key.maxDailySats,
      spentToday,
      spentDate: key.spentDate,
    };

    await db
      .update(agentKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentKeysTable.id, key.id));

    next();
    return;
  } catch (err) {
    res.status(500).json({
      error: "auth_error",
      message: String(err),
    });
    return;
  }
}

export async function recordAgentSpend(keyId: number, amountSats: number) {
  const today = todayStr();

  const keys = await db
    .select()
    .from(agentKeysTable)
    .where(eq(agentKeysTable.id, keyId));
  const key = keys[0];
  if (!key) return;

  const currentSpent = key.spentDate === today ? (key.spentToday ?? 0) : 0;
  const newSpent = currentSpent + amountSats;

  await db
    .update(agentKeysTable)
    .set({ spentToday: newSpent, spentDate: today })
    .where(eq(agentKeysTable.id, keyId));
}

function getSpendingLimitError(
  key: Pick<AgentKeyRow, "spendingLimitSats" | "maxDailySats" | "spentToday" | "spentDate">,
  amountSats: number,
): string | null {
  if (key.spendingLimitSats !== null && amountSats > key.spendingLimitSats) {
    return `Amount ${amountSats} sats exceeds per-transaction limit of ${key.spendingLimitSats} sats.`;
  }

  if (key.maxDailySats !== null) {
    const today = todayStr();
    const spentToday = key.spentDate === today ? (key.spentToday ?? 0) : 0;
    if (spentToday + amountSats > key.maxDailySats) {
      return `This payment would exceed the daily spending limit of ${key.maxDailySats} sats. Spent today: ${spentToday} sats.`;
    }
  }

  return null;
}

export async function reserveAgentSpend(
  keyId: number,
  amountSats: number,
): Promise<{ ok: true; reservedDate: string } | { ok: false; error: string }> {
  const today = todayStr();
  const nextSpentExpr = sql<number>`CASE
    WHEN ${agentKeysTable.spentDate} = ${today}
      THEN COALESCE(${agentKeysTable.spentToday}, 0) + ${amountSats}
    ELSE ${amountSats}
  END`;

  const updated = await db
    .update(agentKeysTable)
    .set({
      spentToday: nextSpentExpr,
      spentDate: today,
    })
    .where(
      and(
        eq(agentKeysTable.id, keyId),
        or(isNull(agentKeysTable.spendingLimitSats), gte(agentKeysTable.spendingLimitSats, amountSats)),
        or(
          isNull(agentKeysTable.maxDailySats),
          sql`${nextSpentExpr} <= ${agentKeysTable.maxDailySats}`,
        ),
      ),
    )
    .returning({ id: agentKeysTable.id });

  if (updated.length > 0) {
    return { ok: true, reservedDate: today };
  }

  const keys = await db.select().from(agentKeysTable).where(eq(agentKeysTable.id, keyId));
  const key = keys[0];
  if (!key) {
    return { ok: false, error: "API key not found or has been revoked." };
  }

  return {
    ok: false,
    error: getSpendingLimitError(key, amountSats) ?? "Unable to reserve spending allowance for this payment.",
  };
}

export async function releaseAgentSpend(keyId: number, amountSats: number, reservedDate: string) {
  await db
    .update(agentKeysTable)
    .set({
      spentToday: sql<number>`CASE
        WHEN ${agentKeysTable.spentDate} = ${reservedDate}
          THEN GREATEST(COALESCE(${agentKeysTable.spentToday}, 0) - ${amountSats}, 0)
        ELSE COALESCE(${agentKeysTable.spentToday}, 0)
      END`,
    })
    .where(eq(agentKeysTable.id, keyId));
}

export async function checkSpendingLimits(
  key: AuthenticatedRequest["agentKey"],
  amountSats: number,
): Promise<string | null> {
  if (!key) return "No key context";
  return getSpendingLimitError(key, amountSats);
}

export async function logAgentAction(
  keyId: number,
  action: string,
  status: string,
  detail: string,
  amount?: number,
) {
  await db.insert(agentLogsTable).values({
    keyId,
    action,
    status,
    detail,
    amount: amount ?? null,
  });
}
