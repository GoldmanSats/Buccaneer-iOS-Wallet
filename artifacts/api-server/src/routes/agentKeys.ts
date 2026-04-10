import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { agentKeysTable, agentLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { deriveNwcPubkey, refreshNwcSubscriptions } from "../lib/nwc.js";
import { hashAgentSecret } from "../lib/agentSecrets.js";

const router: IRouter = Router();

function walletOwnerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers["x-wallet-owner"];
  const expected = process.env["WALLET_OWNER_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "not_configured", message: "Wallet owner authentication is not configured" });
    return;
  }
  if (!token || token !== expected) {
    res.status(403).json({ error: "forbidden", message: "Wallet owner authentication required" });
    return;
  }
  next();
}

router.use(walletOwnerAuth);

function generateNwcUri(servicePubkey: string, clientSecret: string): string {
  const relay = "wss://relay.damus.io";
  return `nostr+walletconnect://${servicePubkey}?relay=${encodeURIComponent(relay)}&secret=${clientSecret}`;
}

router.get("/", async (_req, res) => {
  try {
    const keys = await db.select().from(agentKeysTable).orderBy(agentKeysTable.createdAt);
    res.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        nwcUri: k.nwcUri,
        spendingLimitSats: k.spendingLimitSats,
        maxDailySats: k.maxDailySats,
        spentToday: k.spentToday,
        connectionType: k.connectionType,
        isActive: k.isActive,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

router.post("/", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      name: string;
      spendingLimitSats?: number;
      maxDailySats?: number;
      connectionType?: string;
    };
    if (!body.name) {
      res.status(400).json({ error: "missing_name", message: "Name is required" });
      return;
    }

    const connType = body.connectionType ?? "nwc";
    const walletSecret = crypto.randomBytes(32).toString("hex");
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const nwcClientPubkey = connType === "nwc" ? deriveNwcPubkey(clientSecret) : null;
    const apiToken = connType === "api" ? `bwk_${crypto.randomBytes(24).toString("hex")}` : null;
    const nwcUri = connType === "nwc" ? generateNwcUri(deriveNwcPubkey(walletSecret), clientSecret) : "";

    const created = await db.insert(agentKeysTable).values({
      name: body.name,
      nwcUri,
      secretKey: connType === "nwc" ? walletSecret : null,
      nwcClientPubkey,
      secretHash: connType === "api" ? hashAgentSecret(apiToken!) : null,
      spendingLimitSats: body.spendingLimitSats ?? null,
      maxDailySats: body.maxDailySats ?? null,
      connectionType: connType,
      isActive: true,
    }).returning();

    const k = created[0]!;

    await db.insert(agentLogsTable).values({
      keyId: k.id,
      action: "created",
      status: "success",
      detail: `Key "${k.name}" created (${connType})`,
    });

    if (connType === "nwc") {
      try { refreshNwcSubscriptions(); } catch (_e) {}
    }

    res.status(201).json({
      id: k.id,
      name: k.name,
      nwcUri: k.nwcUri,
      apiToken,
      spendingLimitSats: k.spendingLimitSats,
      maxDailySats: k.maxDailySats,
      connectionType: k.connectionType,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: null,
    });
    return;
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
    return;
  }
});

router.patch("/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    const body = req.body as Partial<{
      name: string;
      spendingLimitSats: number | null;
      maxDailySats: number | null;
      isActive: boolean;
    }>;

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates["name"] = body.name;
    if (body.spendingLimitSats !== undefined) updates["spendingLimitSats"] = body.spendingLimitSats;
    if (body.maxDailySats !== undefined) updates["maxDailySats"] = body.maxDailySats;
    if (body.isActive !== undefined) updates["isActive"] = body.isActive;

    const updated = await db.update(agentKeysTable)
      .set(updates as any)
      .where(eq(agentKeysTable.id, id))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const k = updated[0]!;

    await db.insert(agentLogsTable).values({
      keyId: k.id,
      action: "updated",
      status: "success",
      detail: `Key "${k.name}" updated`,
    });

    try { refreshNwcSubscriptions(); } catch (_e) {}

    res.json({
      id: k.id,
      name: k.name,
      nwcUri: k.nwcUri,
      spendingLimitSats: k.spendingLimitSats,
      maxDailySats: k.maxDailySats,
      connectionType: k.connectionType,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    });
    return;
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
    return;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");

    await db.insert(agentLogsTable).values({
      keyId: id,
      action: "deleted",
      status: "success",
      detail: "Key revoked",
    });

    await db.delete(agentKeysTable).where(eq(agentKeysTable.id, id));
    try { refreshNwcSubscriptions(); } catch (_e) {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

router.get("/:id/logs", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    const logs = await db.select()
      .from(agentLogsTable)
      .where(eq(agentLogsTable.keyId, id))
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(50);

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        action: l.action,
        amount: l.amount,
        status: l.status,
        detail: l.detail,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "agent_logs_error", message: String(err) });
  }
});

export default router;
