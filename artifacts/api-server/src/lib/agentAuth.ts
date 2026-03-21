import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { agentKeysTable, agentLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function agentAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer bwk_")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use: Authorization: Bearer bwk_...",
    });
  }

  const token = authHeader.slice(7);

  try {
    const keys = await db
      .select()
      .from(agentKeysTable)
      .where(eq(agentKeysTable.secretKey, token));

    if (keys.length === 0) {
      return res.status(401).json({
        error: "invalid_key",
        message: "API key not found or has been revoked.",
      });
    }

    const key = keys[0]!;

    if (!key.isActive) {
      return res.status(403).json({
        error: "key_disabled",
        message: "This API key has been disabled.",
      });
    }

    if (key.connectionType !== "api") {
      return res.status(403).json({
        error: "wrong_key_type",
        message: "This key is not an API key.",
      });
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
  } catch (err) {
    return res.status(500).json({
      error: "auth_error",
      message: String(err),
    });
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

export async function checkSpendingLimits(
  key: AuthenticatedRequest["agentKey"],
  amountSats: number,
): Promise<string | null> {
  if (!key) return "No key context";

  if (key.spendingLimitSats !== null && amountSats > key.spendingLimitSats) {
    return `Amount ${amountSats} sats exceeds per-transaction limit of ${key.spendingLimitSats} sats.`;
  }

  if (key.maxDailySats !== null) {
    const today = todayStr();
    const spentToday = key.spentDate === today ? key.spentToday : 0;
    if (spentToday + amountSats > key.maxDailySats) {
      return `This payment would exceed the daily spending limit of ${key.maxDailySats} sats. Spent today: ${spentToday} sats.`;
    }
  }

  return null;
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
