import crypto from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  walletAgentChallengesTable,
  walletAgentIdentitiesTable,
  walletAgentSessionsTable,
} from "@workspace/db/schema";

export const WALLET_AGENT_SESSION_HEADER = "x-wallet-agent-session";
export const WALLET_AGENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface WalletAgentChallengeStateInput {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface WalletAgentSessionStateInput {
  expiresAt: Date;
  revokedAt: Date | null;
  identityRevokedAt: Date | null;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hexToBytes(value: string): Uint8Array {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Expected a hex string");
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

export function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

export function assertValidWalletAgentPublicKey(publicKey: string): string {
  const normalized = normalizeHex(publicKey);
  if (hexToBytes(normalized).length !== 32) {
    throw new Error("Wallet agent public key must be 32 bytes");
  }
  return normalized;
}

export function assertValidWalletAgentSignature(signature: string): string {
  const normalized = normalizeHex(signature);
  if (hexToBytes(normalized).length !== 64) {
    throw new Error("Wallet agent signature must be 64 bytes");
  }
  return normalized;
}

export function createWalletAgentChallengeMessage(challengeId: number, nonce: string): Uint8Array {
  return utf8Bytes(`${challengeId}:${nonce}`);
}

export function verifyWalletAgentChallengeSignature(
  publicKey: string,
  signature: string,
  challengeId: number,
  nonce: string,
): boolean {
  try {
    return ed25519.verify(
      hexToBytes(assertValidWalletAgentSignature(signature)),
      createWalletAgentChallengeMessage(challengeId, nonce),
      hexToBytes(assertValidWalletAgentPublicKey(publicKey)),
    );
  } catch {
    return false;
  }
}

export function hashWalletAgentSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function createWalletAgentSessionToken(): string {
  return `bwa_${crypto.randomBytes(24).toString("hex")}`;
}

export function getWalletAgentChallengeFailure(
  challenge: WalletAgentChallengeStateInput | null,
  now = new Date(),
): { status: number; error: string; message: string } | null {
  if (!challenge || challenge.revokedAt) {
    return { status: 404, error: "challenge_not_found", message: "Challenge not found for this wallet" };
  }
  if (challenge.usedAt) {
    return { status: 409, error: "challenge_used", message: "Challenge has already been used" };
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return { status: 410, error: "challenge_expired", message: "Challenge has expired" };
  }
  return null;
}

export function getWalletAgentSessionFailure(
  session: WalletAgentSessionStateInput | null,
  now = new Date(),
): { status: number; error: string; message: string } | null {
  if (!session || session.revokedAt || session.identityRevokedAt || session.expiresAt.getTime() <= now.getTime()) {
    return { status: 401, error: "invalid_wallet_agent_session", message: "Wallet Agent Access session is invalid or expired" };
  }
  return null;
}

export async function upsertWalletAgentIdentity(
  walletPublicKey: string,
  walletMode: string | null,
  walletLabel: string | null,
) {
  const normalized = assertValidWalletAgentPublicKey(walletPublicKey);
  const existing = await db
    .select()
    .from(walletAgentIdentitiesTable)
    .where(eq(walletAgentIdentitiesTable.walletPublicKey, normalized))
    .limit(1);

  if (existing[0]) {
    const [identity] = await db
      .update(walletAgentIdentitiesTable)
      .set({
        walletMode: walletMode ?? existing[0].walletMode,
        walletLabel: walletLabel ?? existing[0].walletLabel,
        revokedAt: null,
        lastSeenAt: new Date(),
      })
      .where(eq(walletAgentIdentitiesTable.id, existing[0].id))
      .returning();
    return identity!;
  }

  const [identity] = await db.insert(walletAgentIdentitiesTable).values({
    walletPublicKey: normalized,
    walletMode: walletMode ?? "seed",
    walletLabel,
    lastSeenAt: new Date(),
  }).returning();
  return identity!;
}

export async function createWalletAgentChallenge(identityId: number) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const nonce = crypto.randomBytes(24).toString("hex");
  const [challenge] = await db.insert(walletAgentChallengesTable).values({
    identityId,
    nonce,
    expiresAt,
  }).returning();
  return challenge!;
}

export async function createWalletAgentSession(identityId: number) {
  const token = createWalletAgentSessionToken();
  const expiresAt = new Date(Date.now() + WALLET_AGENT_SESSION_TTL_MS);
  await db.insert(walletAgentSessionsTable).values({
    identityId,
    sessionHash: hashWalletAgentSessionToken(token),
    expiresAt,
    lastUsedAt: new Date(),
  });
  await db
    .update(walletAgentIdentitiesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(walletAgentIdentitiesTable.id, identityId));
  return { token, expiresAt };
}

export async function revokeWalletAgentSession(sessionId: number) {
  await db
    .update(walletAgentSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(walletAgentSessionsTable.id, sessionId));
}

export async function lookupWalletAgentSession(token: string) {
  const sessionHash = hashWalletAgentSessionToken(token);
  const rows = await db
    .select({
      sessionId: walletAgentSessionsTable.id,
      identityId: walletAgentIdentitiesTable.id,
      walletPublicKey: walletAgentIdentitiesTable.walletPublicKey,
      walletMode: walletAgentIdentitiesTable.walletMode,
      walletLabel: walletAgentIdentitiesTable.walletLabel,
      expiresAt: walletAgentSessionsTable.expiresAt,
      revokedAt: walletAgentSessionsTable.revokedAt,
      identityRevokedAt: walletAgentIdentitiesTable.revokedAt,
    })
    .from(walletAgentSessionsTable)
    .innerJoin(walletAgentIdentitiesTable, eq(walletAgentSessionsTable.identityId, walletAgentIdentitiesTable.id))
    .where(eq(walletAgentSessionsTable.sessionHash, sessionHash))
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  if (getWalletAgentSessionFailure(session)) {
    return session;
  }

  const touchedAt = new Date();
  await Promise.all([
    db.update(walletAgentSessionsTable).set({ lastUsedAt: touchedAt }).where(eq(walletAgentSessionsTable.id, session.sessionId)),
    db.update(walletAgentIdentitiesTable).set({ lastSeenAt: touchedAt }).where(eq(walletAgentIdentitiesTable.id, session.identityId)),
  ]);

  return session;
}
