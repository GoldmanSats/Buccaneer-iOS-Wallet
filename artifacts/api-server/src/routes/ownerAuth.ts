import { Router, type IRouter, type Response } from "express";
import { db, ownerAuthChallengesTable, ownerDevicesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  assertValidOwnerPublicKey,
  assertValidOwnerSignature,
  createOwnerAuthChallenge,
  createOwnerSession,
  getOwnerChallengeFailure,
  getInitialOwnerDeviceRegistrationFailure,
  revokeOwnerSession,
  verifyOwnerChallengeSignature,
} from "../lib/ownerSession.js";
import { requireOwnerBootstrapAuth, requireOwnerSession, type OwnerAuthenticatedRequest } from "../lib/ownerAuth.js";

const router: IRouter = Router();

async function upsertOwnerDevice(publicKey: string, label: string) {
  const existing = await db.select().from(ownerDevicesTable).where(eq(ownerDevicesTable.publicKey, publicKey)).limit(1);
  const device = existing[0];
  if (device) {
    if (device.revokedAt) {
      return { kind: "revoked" as const };
    }

    const [updated] = await db
      .update(ownerDevicesTable)
      .set({ label })
      .where(eq(ownerDevicesTable.id, device.id))
      .returning();
    return { kind: "updated" as const, device: updated! };
  }

  const [created] = await db.insert(ownerDevicesTable).values({ publicKey, label }).returning();
  return { kind: "created" as const, device: created! };
}

function sendOwnerDeviceResponse(
  res: Response,
  payload: Awaited<ReturnType<typeof upsertOwnerDevice>>,
) {
  if (payload.kind === "revoked") {
    res.status(409).json({ error: "device_revoked", message: "This owner device has been revoked" });
    return;
  }

  const body = {
    id: payload.device.id,
    publicKey: payload.device.publicKey,
    label: payload.device.label,
    createdAt: payload.device.createdAt.toISOString(),
  };

  if (payload.kind === "created") {
    res.status(201).json(body);
    return;
  }

  res.json(body);
}

router.post("/bootstrap/device", requireOwnerBootstrapAuth, async (req, res): Promise<void> => {
  try {
    const body = req.body as { publicKey?: string; label?: string };
    const publicKey = assertValidOwnerPublicKey(body.publicKey ?? "");
    const label = body.label?.trim();
    if (!label) {
      res.status(400).json({ error: "missing_label", message: "Device label is required" });
      return;
    }

    const payload = await upsertOwnerDevice(publicKey, label);
    sendOwnerDeviceResponse(res, payload);
    return;
  } catch (err) {
    res.status(400).json({ error: "invalid_owner_device", message: String(err) });
    return;
  }
});

router.post("/register-initial-device", async (req, res): Promise<void> => {
  try {
    const body = req.body as { publicKey?: string; label?: string };
    const publicKey = assertValidOwnerPublicKey(body.publicKey ?? "");
    const label = body.label?.trim();
    if (!label) {
      res.status(400).json({ error: "missing_label", message: "Device label is required" });
      return;
    }

    const activeOwnerDevices = await db
      .select({ id: ownerDevicesTable.id })
      .from(ownerDevicesTable)
      .where(isNull(ownerDevicesTable.revokedAt))
      .limit(1);

    const failure = getInitialOwnerDeviceRegistrationFailure(activeOwnerDevices.length > 0);
    if (failure) {
      res.status(failure.status).json({ error: failure.error, message: failure.message });
      return;
    }

    const payload = await upsertOwnerDevice(publicKey, label);
    sendOwnerDeviceResponse(res, payload);
    return;
  } catch (err) {
    res.status(400).json({ error: "invalid_owner_device", message: String(err) });
    return;
  }
});

router.post("/challenge", async (req, res): Promise<void> => {
  try {
    const body = req.body as { publicKey?: string };
    const publicKey = assertValidOwnerPublicKey(body.publicKey ?? "");
    const now = new Date();
    const rows = await db
      .select({
        id: ownerDevicesTable.id,
        label: ownerDevicesTable.label,
      })
      .from(ownerDevicesTable)
      .where(and(eq(ownerDevicesTable.publicKey, publicKey), isNull(ownerDevicesTable.revokedAt)))
      .limit(1);

    const device = rows[0];
    if (!device) {
      res.status(404).json({ error: "device_not_registered", message: "This device is not registered for owner access" });
      return;
    }

    const challenge = await createOwnerAuthChallenge(device.id);
    res.json({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
      deviceLabel: device.label,
      serverTime: now.toISOString(),
    });
    return;
  } catch (err) {
    res.status(400).json({ error: "invalid_challenge_request", message: String(err) });
    return;
  }
});

router.post("/verify", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      challengeId?: number;
      publicKey?: string;
      signature?: string;
    };
    const publicKey = assertValidOwnerPublicKey(body.publicKey ?? "");
    const signature = assertValidOwnerSignature(body.signature ?? "");
    const challengeId = Number(body.challengeId ?? 0);
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      res.status(400).json({ error: "invalid_challenge_id", message: "challengeId must be a positive integer" });
      return;
    }

    const rows = await db
      .select({
        challengeId: ownerAuthChallengesTable.id,
        nonce: ownerAuthChallengesTable.nonce,
        expiresAt: ownerAuthChallengesTable.expiresAt,
        usedAt: ownerAuthChallengesTable.usedAt,
        deviceId: ownerDevicesTable.id,
        label: ownerDevicesTable.label,
        publicKey: ownerDevicesTable.publicKey,
        revokedAt: ownerDevicesTable.revokedAt,
      })
      .from(ownerAuthChallengesTable)
      .innerJoin(ownerDevicesTable, eq(ownerAuthChallengesTable.deviceId, ownerDevicesTable.id))
      .where(
        and(
          eq(ownerAuthChallengesTable.id, challengeId),
          eq(ownerDevicesTable.publicKey, publicKey),
        ),
      )
      .limit(1);

    const challenge = rows[0];
    const failure = getOwnerChallengeFailure(challenge, new Date());
    if (failure) {
      res.status(failure.status).json({ error: failure.error, message: failure.message });
      return;
    }
    if (!verifyOwnerChallengeSignature(publicKey, signature, challenge.challengeId, challenge.nonce)) {
      res.status(401).json({ error: "invalid_signature", message: "Challenge signature verification failed" });
      return;
    }

    await db
      .update(ownerAuthChallengesTable)
      .set({ usedAt: new Date() })
      .where(eq(ownerAuthChallengesTable.id, challenge.challengeId));

    const session = await createOwnerSession(challenge.deviceId);
    res.json({
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
      device: {
        id: challenge.deviceId,
        label: challenge.label,
        publicKey,
      },
    });
    return;
  } catch (err) {
    res.status(400).json({ error: "invalid_verify_request", message: String(err) });
    return;
  }
});

router.post("/logout", requireOwnerSession as any, async (req: OwnerAuthenticatedRequest, res): Promise<void> => {
  try {
    await revokeOwnerSession(req.ownerSession!.sessionId);
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ error: "owner_logout_failed", message: String(err) });
    return;
  }
});

router.get("/status", requireOwnerSession as any, async (req: OwnerAuthenticatedRequest, res): Promise<void> => {
  res.json({
    ok: true,
    session: {
      sessionId: req.ownerSession!.sessionId,
      expiresAt: req.ownerSession!.expiresAt.toISOString(),
      deviceId: req.ownerSession!.deviceId,
      label: req.ownerSession!.label,
      publicKey: req.ownerSession!.publicKey,
    },
  });
});

export default router;
