import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  walletAgentChallengesTable,
  walletAgentIdentitiesTable,
  walletAgentPoliciesTable,
  walletAgentRequestsTable,
} from "@workspace/db/schema";
import {
  requireWalletAgentSession,
  type WalletAgentAuthenticatedRequest,
} from "../lib/agentAccessAuth.js";
import {
  assertValidWalletAgentPublicKey,
  assertValidWalletAgentSignature,
  createWalletAgentChallenge,
  createWalletAgentSession,
  getWalletAgentChallengeFailure,
  revokeWalletAgentSession,
  upsertWalletAgentIdentity,
  verifyWalletAgentChallengeSignature,
} from "../lib/agentAccessSession.js";
import {
  completeWalletAgentRequest,
  createPerUserNwcSecret,
  createPerUserNwcUri,
  derivePerUserNwcPubkey,
  incrementWalletAgentSpend,
  listPendingWalletAgentRequests,
  rejectWalletAgentRequest,
  upsertWalletAgentSnapshot,
} from "../lib/perUserAgentAccess.js";

const router = Router();
const PER_USER_AGENT_ACCESS_ENABLED = process.env.ENABLE_PER_USER_AGENT_ACCESS !== "0";

router.use((_req, res, next) => {
  if (!PER_USER_AGENT_ACCESS_ENABLED) {
    res.status(404).json({
      error: "agent_access_disabled",
      message: "Per-user Agent Access is currently turned off on this Bellamy server.",
    });
    return;
  }
  next();
});

function normalizeApprovalMode(value: unknown): "session" | "per_action" {
  return value === "per_action" ? "per_action" : "session";
}

function serializePolicy(policy: typeof walletAgentPoliciesTable.$inferSelect) {
  const servicePubkey = policy.nwcSecretKey ? derivePerUserNwcPubkey(policy.nwcSecretKey) : null;
  return {
    id: policy.id,
    name: policy.name,
    connectionType: policy.connectionType,
    servicePubkey,
    spendingLimitSats: policy.spendingLimitSats,
    maxDailySats: policy.maxDailySats,
    spentToday: policy.spentToday,
    approvalMode: policy.approvalMode,
    isActive: policy.isActive,
    createdAt: policy.createdAt,
    lastUsedAt: policy.lastUsedAt,
  };
}

router.post("/session/challenge", async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      walletPublicKey?: string;
      walletMode?: string;
      walletLabel?: string | null;
    };
    const walletPublicKey = assertValidWalletAgentPublicKey(body.walletPublicKey ?? "");
    const identity = await upsertWalletAgentIdentity(walletPublicKey, body.walletMode ?? null, body.walletLabel ?? null);
    const challenge = await createWalletAgentChallenge(identity.id);
    res.json({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      walletPublicKey: identity.walletPublicKey,
    });
  } catch (error) {
    res.status(400).json({
      error: "invalid_wallet_agent_identity",
      message: error instanceof Error ? error.message : "Bellamy could not start Agent Access for this wallet.",
    });
  }
});

router.post("/session/verify", async (req, res): Promise<void> => {
  const body = req.body as {
    challengeId?: number;
    walletPublicKey?: string;
    signature?: string;
  };

  if (!body.challengeId || !body.walletPublicKey || !body.signature) {
    res.status(400).json({
      error: "invalid_wallet_agent_verification",
      message: "challengeId, walletPublicKey, and signature are required.",
    });
    return;
  }

  try {
    const walletPublicKey = assertValidWalletAgentPublicKey(body.walletPublicKey);
    const signature = assertValidWalletAgentSignature(body.signature);
    const rows = await db
      .select({
        challengeId: walletAgentChallengesTable.id,
        identityId: walletAgentChallengesTable.identityId,
        nonce: walletAgentChallengesTable.nonce,
        expiresAt: walletAgentChallengesTable.expiresAt,
        usedAt: walletAgentChallengesTable.usedAt,
        walletPublicKey: walletAgentIdentitiesTable.walletPublicKey,
        walletMode: walletAgentIdentitiesTable.walletMode,
        walletLabel: walletAgentIdentitiesTable.walletLabel,
        revokedAt: walletAgentIdentitiesTable.revokedAt,
      })
      .from(walletAgentChallengesTable)
      .innerJoin(walletAgentIdentitiesTable, eq(walletAgentChallengesTable.identityId, walletAgentIdentitiesTable.id))
      .where(eq(walletAgentChallengesTable.id, body.challengeId))
      .limit(1);
    const challenge = rows[0];
    if (!challenge) {
      res.status(404).json({ error: "challenge_not_found", message: "Challenge not found for this wallet." });
      return;
    }

    const failure = getWalletAgentChallengeFailure({
      expiresAt: challenge.expiresAt,
      usedAt: challenge.usedAt,
      revokedAt: challenge.revokedAt,
    });
    if (failure) {
      res.status(failure.status).json({ error: failure.error, message: failure.message });
      return;
    }

    if (challenge.walletPublicKey !== walletPublicKey) {
      res.status(401).json({ error: "wallet_identity_mismatch", message: "This challenge does not belong to the supplied wallet." });
      return;
    }

    if (!verifyWalletAgentChallengeSignature(walletPublicKey, signature, challenge.challengeId, challenge.nonce)) {
      res.status(401).json({ error: "invalid_wallet_signature", message: "Bellamy could not verify this wallet signature." });
      return;
    }

    await db
      .update(walletAgentChallengesTable)
      .set({ usedAt: new Date() })
      .where(eq(walletAgentChallengesTable.id, challenge.challengeId));

    const session = await createWalletAgentSession(challenge.identityId);
    res.json({
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      walletPublicKey: challenge.walletPublicKey,
      walletMode: challenge.walletMode,
      walletLabel: challenge.walletLabel,
    });
  } catch (error) {
    res.status(400).json({
      error: "wallet_agent_verification_failed",
      message: error instanceof Error ? error.message : "Bellamy could not verify this wallet.",
    });
  }
});

router.get("/session/status", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  res.json({
    ok: true,
    walletPublicKey: req.walletAgentSession!.walletPublicKey,
    walletMode: req.walletAgentSession!.walletMode,
    walletLabel: req.walletAgentSession!.walletLabel,
    expiresAt: req.walletAgentSession!.expiresAt,
  });
});

router.post("/session/logout", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  await revokeWalletAgentSession(req.walletAgentSession!.sessionId);
  res.status(204).end();
});

router.get("/policies", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const policies = await db
    .select()
    .from(walletAgentPoliciesTable)
    .where(eq(walletAgentPoliciesTable.identityId, req.walletAgentSession!.identityId));
  res.json({ policies: policies.map(serializePolicy) });
});

router.get("/policies/:id/logs", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const policyId = Number(req.params.id);
  if (Number.isNaN(policyId)) {
    res.status(400).json({ error: "invalid_policy_id", message: "Policy id must be a number." });
    return;
  }

  const rows = await db
    .select()
    .from(walletAgentRequestsTable)
    .where(and(
      eq(walletAgentRequestsTable.policyId, policyId),
      eq(walletAgentRequestsTable.identityId, req.walletAgentSession!.identityId),
    ));

  res.json({
    logs: rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row) => ({
        id: row.id,
        action: row.requestType,
        amount: row.amountSats,
        status: row.status,
        detail: row.errorMessage ?? row.responsePayload,
        createdAt: row.createdAt,
      })),
  });
});

router.post("/policies", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const body = req.body as {
    name?: string;
    spendingLimitSats?: number | null;
    maxDailySats?: number | null;
    approvalMode?: string;
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: "missing_name", message: "A connection name is required." });
    return;
  }

  const approvalMode = normalizeApprovalMode(body.approvalMode);
  const nwcClientSecret = createPerUserNwcSecret();
  const nwcServiceSecret = createPerUserNwcSecret();
  const nwcClientPubkey = derivePerUserNwcPubkey(nwcClientSecret);
  const servicePubkey = derivePerUserNwcPubkey(nwcServiceSecret);

  const [policy] = await db.insert(walletAgentPoliciesTable).values({
    identityId: req.walletAgentSession!.identityId,
    name: body.name.trim(),
    connectionType: "nwc",
    nwcSecretKey: nwcServiceSecret,
    nwcClientPubkey,
    spendingLimitSats: body.spendingLimitSats ?? null,
    maxDailySats: body.maxDailySats ?? null,
    approvalMode,
  }).returning();

  res.status(201).json({
    ...serializePolicy(policy!),
    nwcUri: createPerUserNwcUri(servicePubkey, nwcClientSecret),
  });
});

router.patch("/policies/:id", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const policyId = Number(req.params.id);
  if (Number.isNaN(policyId)) {
    res.status(400).json({ error: "invalid_policy_id", message: "Policy id must be a number." });
    return;
  }

  const body = req.body as {
    spendingLimitSats?: number | null;
    maxDailySats?: number | null;
    approvalMode?: string;
    isActive?: boolean;
  };

  const [updated] = await db
    .update(walletAgentPoliciesTable)
    .set({
      spendingLimitSats: body.spendingLimitSats ?? null,
      maxDailySats: body.maxDailySats ?? null,
      approvalMode: body.approvalMode ? normalizeApprovalMode(body.approvalMode) : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      updatedAt: new Date(),
    })
    .where(and(
      eq(walletAgentPoliciesTable.id, policyId),
      eq(walletAgentPoliciesTable.identityId, req.walletAgentSession!.identityId),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "policy_not_found", message: "Bellamy could not find that Agent Access connection." });
    return;
  }

  res.json(serializePolicy(updated));
});

router.delete("/policies/:id", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const policyId = Number(req.params.id);
  if (Number.isNaN(policyId)) {
    res.status(400).json({ error: "invalid_policy_id", message: "Policy id must be a number." });
    return;
  }

  const [updated] = await db
    .update(walletAgentPoliciesTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(walletAgentPoliciesTable.id, policyId),
      eq(walletAgentPoliciesTable.identityId, req.walletAgentSession!.identityId),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "policy_not_found", message: "Bellamy could not find that Agent Access connection." });
    return;
  }

  res.status(204).end();
});

router.get("/requests/pending", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const requests = await listPendingWalletAgentRequests(req.walletAgentSession!.identityId);
  res.json({ requests });
});

router.post("/requests/:id/complete", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const requestId = Number(req.params.id);
  if (Number.isNaN(requestId)) {
    res.status(400).json({ error: "invalid_request_id", message: "Request id must be a number." });
    return;
  }

  const body = req.body as { responsePayload?: unknown; settledAmountSats?: number | null };
  const rows = await db
    .select()
    .from(walletAgentRequestsTable)
    .where(and(
      eq(walletAgentRequestsTable.id, requestId),
      eq(walletAgentRequestsTable.identityId, req.walletAgentSession!.identityId),
    ))
    .limit(1);
  const request = rows[0];
  if (!request) {
    res.status(404).json({ error: "request_not_found", message: "Bellamy could not find that pending request." });
    return;
  }

  await completeWalletAgentRequest(requestId, body.responsePayload ?? null);
  if (typeof body.settledAmountSats === "number" && body.settledAmountSats > 0) {
    await incrementWalletAgentSpend(request.policyId, body.settledAmountSats);
  }
  res.status(204).end();
});

router.post("/requests/:id/reject", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const requestId = Number(req.params.id);
  if (Number.isNaN(requestId)) {
    res.status(400).json({ error: "invalid_request_id", message: "Request id must be a number." });
    return;
  }

  const body = req.body as { message?: string };
  const rows = await db
    .select()
    .from(walletAgentRequestsTable)
    .where(and(
      eq(walletAgentRequestsTable.id, requestId),
      eq(walletAgentRequestsTable.identityId, req.walletAgentSession!.identityId),
    ))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "request_not_found", message: "Bellamy could not find that pending request." });
    return;
  }

  await rejectWalletAgentRequest(requestId, body.message?.trim() || "Request rejected in Bellamy.");
  res.status(204).end();
});

router.post("/snapshots", requireWalletAgentSession as any, async (req: WalletAgentAuthenticatedRequest, res): Promise<void> => {
  const body = req.body as { balance?: unknown; transactions?: unknown };
  await upsertWalletAgentSnapshot(
    req.walletAgentSession!.identityId,
    body.balance ?? null,
    body.transactions ?? [],
  );
  res.status(204).end();
});

export default router;
