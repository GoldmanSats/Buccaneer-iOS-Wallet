import crypto from "crypto";
import { schnorr } from "@noble/curves/secp256k1";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  walletAgentPoliciesTable,
  walletAgentRequestsTable,
  walletAgentSnapshotsTable,
} from "@workspace/db/schema";

export function hashAgentAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createAgentAccessToken(): string {
  return `bellamy_${crypto.randomBytes(18).toString("hex")}`;
}

export function createAgentAccessTokenPreview(token: string): string {
  return `${token.slice(0, 12)}...`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function derivePerUserNwcPubkey(secretKeyHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(secretKeyHex)));
}

export function createPerUserNwcSecret(): string {
  return bytesToHex(crypto.randomBytes(32));
}

export function createPerUserNwcUri(servicePubkey: string, clientSecret: string): string {
  const domain = process.env.BELLAMY_DOMAIN ?? "";
  const wsScheme = domain.startsWith("https://") ? "wss://" : "ws://";
  const wsUrl = domain.replace(/^https?:\/\//, wsScheme) + "/nwc";
  return `nostr+walletconnect://${servicePubkey}?relay=${encodeURIComponent(wsUrl)}&secret=${clientSecret}`;
}

export function currentSpendDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getDailySpendFailure(
  policy: {
    spendingLimitSats: number | null;
    maxDailySats: number | null;
    spentToday: number;
    spentDate: string | null;
  },
  amountSats: number,
): string | null {
  if (amountSats <= 0) return null;
  if (policy.spendingLimitSats !== null && amountSats > policy.spendingLimitSats) {
    return `This request is over the per-transaction limit of ${policy.spendingLimitSats} sats.`;
  }
  if (policy.maxDailySats !== null) {
    const today = currentSpendDate();
    const spentToday = policy.spentDate === today ? policy.spentToday : 0;
    if (spentToday + amountSats > policy.maxDailySats) {
      return `This request would exceed the daily limit of ${policy.maxDailySats} sats.`;
    }
  }
  return null;
}

export async function lookupWalletAgentPolicyByToken(token: string) {
  const rows = await db
    .select()
    .from(walletAgentPoliciesTable)
    .where(eq(walletAgentPoliciesTable.tokenHash, hashAgentAccessToken(token)))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchWalletAgentPolicy(policyId: number) {
  await db
    .update(walletAgentPoliciesTable)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(walletAgentPoliciesTable.id, policyId));
}

export async function incrementWalletAgentSpend(policyId: number, amountSats: number) {
  const rows = await db
    .select()
    .from(walletAgentPoliciesTable)
    .where(eq(walletAgentPoliciesTable.id, policyId))
    .limit(1);
  const policy = rows[0];
  if (!policy) return;
  const today = currentSpendDate();
  const spentToday = policy.spentDate === today ? policy.spentToday : 0;
  await db
    .update(walletAgentPoliciesTable)
    .set({
      spentToday: spentToday + Math.max(0, amountSats),
      spentDate: today,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(walletAgentPoliciesTable.id, policyId));
}

export async function upsertWalletAgentSnapshot(
  identityId: number,
  balance: unknown,
  transactions: unknown,
): Promise<void> {
  const existing = await db
    .select()
    .from(walletAgentSnapshotsTable)
    .where(eq(walletAgentSnapshotsTable.identityId, identityId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(walletAgentSnapshotsTable)
      .set({
        balanceJson: JSON.stringify(balance),
        transactionsJson: JSON.stringify(transactions),
        updatedAt: new Date(),
      })
      .where(eq(walletAgentSnapshotsTable.identityId, identityId));
    return;
  }

  await db.insert(walletAgentSnapshotsTable).values({
    identityId,
    balanceJson: JSON.stringify(balance),
    transactionsJson: JSON.stringify(transactions),
    updatedAt: new Date(),
  });
}

export async function getWalletAgentSnapshot(identityId: number) {
  const rows = await db
    .select()
    .from(walletAgentSnapshotsTable)
    .where(eq(walletAgentSnapshotsTable.identityId, identityId))
    .limit(1);
  const snapshot = rows[0];
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    balance: snapshot.balanceJson ? JSON.parse(snapshot.balanceJson) : null,
    transactions: snapshot.transactionsJson ? JSON.parse(snapshot.transactionsJson) : [],
  };
}

export async function createWalletAgentRequest(
  policy: typeof walletAgentPoliciesTable.$inferSelect,
  requestType: string,
  payload: unknown,
  options?: { amountSats?: number | null; requiresFreshApproval?: boolean; expiresInMs?: number; autoApproved?: boolean },
) {
  const status = options?.autoApproved ? "approved" : "pending";
  const [request] = await db.insert(walletAgentRequestsTable).values({
    identityId: policy.identityId,
    policyId: policy.id,
    requestType,
    requestPayload: JSON.stringify(payload),
    amountSats: options?.amountSats ?? null,
    requiresFreshApproval: options?.requiresFreshApproval ?? false,
    status,
    expiresAt: options?.expiresInMs ? new Date(Date.now() + options.expiresInMs) : null,
  }).returning();

  await touchWalletAgentPolicy(policy.id);
  return request!;
}

export async function listPendingWalletAgentRequests(identityId: number) {
  const rows = await db
    .select({
      id: walletAgentRequestsTable.id,
      policyId: walletAgentRequestsTable.policyId,
      requestType: walletAgentRequestsTable.requestType,
      requestPayload: walletAgentRequestsTable.requestPayload,
      amountSats: walletAgentRequestsTable.amountSats,
      requiresFreshApproval: walletAgentRequestsTable.requiresFreshApproval,
      createdAt: walletAgentRequestsTable.createdAt,
      policyName: walletAgentPoliciesTable.name,
      approvalMode: walletAgentPoliciesTable.approvalMode,
      connectionType: walletAgentPoliciesTable.connectionType,
    })
    .from(walletAgentRequestsTable)
    .innerJoin(walletAgentPoliciesTable, eq(walletAgentRequestsTable.policyId, walletAgentPoliciesTable.id))
    .where(and(
      eq(walletAgentRequestsTable.identityId, identityId),
      inArray(walletAgentRequestsTable.status, ["pending", "approved"]),
    ));

  return rows.map((row) => ({
    ...row,
    requestPayload: JSON.parse(row.requestPayload),
  }));
}

export async function completeWalletAgentRequest(requestId: number, responsePayload: unknown) {
  await db
    .update(walletAgentRequestsTable)
    .set({
      status: "completed",
      responsePayload: JSON.stringify(responsePayload),
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(walletAgentRequestsTable.id, requestId));
}

export async function rejectWalletAgentRequest(requestId: number, errorMessage: string) {
  await db
    .update(walletAgentRequestsTable)
    .set({
      status: "rejected",
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(walletAgentRequestsTable.id, requestId));
}

export async function waitForWalletAgentRequestResult(requestId: number, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db
      .select()
      .from(walletAgentRequestsTable)
      .where(eq(walletAgentRequestsTable.id, requestId))
      .limit(1);
    const request = rows[0];
    if (!request) {
      return null;
    }
    if (request.status === "completed" || request.status === "rejected") {
      return {
        ...request,
        responsePayload: request.responsePayload ? JSON.parse(request.responsePayload) : null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return null;
}
