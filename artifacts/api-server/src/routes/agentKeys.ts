import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { agentKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function generateNwcUri(secretKey: string): string {
  const relay = "wss://relay.damus.io";
  const pubkey = crypto.createHash("sha256").update(secretKey).digest("hex");
  return `nostr+walletconnect://${pubkey}?relay=${encodeURIComponent(relay)}&secret=${secretKey}`;
}

// GET /agent-keys
router.get("/", async (_req, res) => {
  try {
    const keys = await db.select().from(agentKeysTable).orderBy(agentKeysTable.createdAt);
    res.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        nwcUri: k.nwcUri,
        spendingLimitSats: k.spendingLimitSats,
        isActive: k.isActive,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

// POST /agent-keys
router.post("/", async (req, res) => {
  try {
    const body = req.body as { name: string; spendingLimitSats?: number };
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
      isActive: true,
    }).returning();

    const k = created[0]!;
    res.status(201).json({
      id: k.id,
      name: k.name,
      nwcUri: k.nwcUri,
      spendingLimitSats: k.spendingLimitSats,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: null,
    });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

// DELETE /agent-keys/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    await db.delete(agentKeysTable).where(eq(agentKeysTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "agent_keys_error", message: String(err) });
  }
});

export default router;
