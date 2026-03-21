import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { agentKeysTable, agentLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import * as secp256k1 from "@noble/secp256k1";
import { refreshNwcSubscriptions } from "../lib/nwc.js";

const router: IRouter = Router();

function getSecp256k1Pubkey(secretKeyHex: string): string {
  const privKeyBytes = Buffer.from(secretKeyHex, "hex");
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  return Buffer.from(pubKeyBytes.slice(1)).toString("hex");
}

function generateNwcUri(secretKey: string): string {
  const relay = "wss://relay.damus.io";
  const pubkey = getSecp256k1Pubkey(secretKey);
  return `nostr+walletconnect://${pubkey}?relay=${encodeURIComponent(relay)}&secret=${secretKey}`;
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

router.post("/", async (req, res) => {
  try {
    const body = req.body as {
      name: string;
      spendingLimitSats?: number;
      maxDailySats?: number;
      connectionType?: string;
    };
    if (!body.name) {
      return res.status(400).json({ error: "missing_name", message: "Name is required" });
    }

    const secretKey = crypto.randomBytes(32).toString("hex");
    const nwcUri = generateNwcUri(secretKey);

    const created = await db.insert(agentKeysTable).values({
      name: body.name,
      nwcUri,
      secretKey,
      spendingLimitSats: body.spendingLimitSats ?? null,
      maxDailySats: body.maxDailySats ?? null,
      connectionType: body.connectionType ?? "nwc",
      isActive: true,
    }).returning();

    const k = created[0]!;

    await db.insert(agentLogsTable).values({
      keyId: k.id,
      action: "created",
      status: "success",
      detail: `Key "${k.name}" created`,
    });

    try { refreshNwcSubscriptions(); } catch (_e) {}

    res.status(201).json({
      id: k.id,
      name: k.name,
      nwcUri: k.nwcUri,
      spendingLimitSats: k.spendingLimitSats,
      maxDailySats: k.maxDailySats,
      connectionType: k.connectionType,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: null,
    });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

router.patch("/:id", async (req, res) => {
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
      return res.status(404).json({ error: "not_found" });
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
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
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
