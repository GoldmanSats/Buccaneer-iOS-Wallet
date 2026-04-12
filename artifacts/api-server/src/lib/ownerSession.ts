import crypto from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { eq } from "drizzle-orm";
import {
  db,
  ownerAuthChallengesTable,
  ownerDevicesTable,
  ownerSessionsTable,
} from "@workspace/db";

export const OWNER_SESSION_HEADER = "x-owner-session";
export const OWNER_BOOTSTRAP_HEADER = "x-wallet-owner";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

export interface OwnerChallengeStateInput {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface OwnerSessionStateInput {
  expiresAt: Date;
  revokedAt: Date | null;
  deviceRevokedAt: Date | null;
}

export function getInitialOwnerDeviceRegistrationFailure(
  hasActiveOwnerDevice: boolean,
): { status: number; error: string; message: string } | null {
  if (hasActiveOwnerDevice) {
    return {
      status: 409,
      error: "owner_device_exists",
      message: "Bellamy is already linked to a trusted device. Add this one from an existing trusted device or use recovery tooling.",
    };
  }
  return null;
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

export function assertValidOwnerPublicKey(publicKey: string): string {
  const normalized = normalizeHex(publicKey);
  const bytes = hexToBytes(normalized);
  if (bytes.length !== 32) {
    throw new Error("Owner public key must be 32 bytes");
  }
  return normalized;
}

export function assertValidOwnerSignature(signature: string): string {
  const normalized = normalizeHex(signature);
  const bytes = hexToBytes(normalized);
  if (bytes.length !== 64) {
    throw new Error("Owner signature must be 64 bytes");
  }
  return normalized;
}

export function createOwnerChallengeMessage(challengeId: number, nonce: string): Uint8Array {
  return utf8Bytes(`${challengeId}:${nonce}`);
}

export function verifyOwnerChallengeSignature(
  publicKey: string,
  signature: string,
  challengeId: number,
  nonce: string,
): boolean {
  try {
    return ed25519.verify(
      hexToBytes(assertValidOwnerSignature(signature)),
      createOwnerChallengeMessage(challengeId, nonce),
      hexToBytes(assertValidOwnerPublicKey(publicKey)),
    );
  } catch {
    return false;
  }
}

export function hashOwnerSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOwnerSessionToken(): string {
  return `bws_${crypto.randomBytes(24).toString("hex")}`;
}

export async function createOwnerAuthChallenge(deviceId: number) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const nonce = crypto.randomBytes(24).toString("hex");
  const [challenge] = await db.insert(ownerAuthChallengesTable).values({
    deviceId,
    nonce,
    expiresAt,
  }).returning();
  return challenge!;
}

export async function createOwnerSession(deviceId: number) {
  const token = createOwnerSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(ownerSessionsTable).values({
    deviceId,
    sessionHash: hashOwnerSessionToken(token),
    expiresAt,
    lastUsedAt: new Date(),
  });
  await db
    .update(ownerDevicesTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(ownerDevicesTable.id, deviceId));
  return { token, expiresAt };
}

export async function revokeOwnerSession(sessionId: number) {
  await db
    .update(ownerSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(ownerSessionsTable.id, sessionId));
}

export async function lookupOwnerSession(token: string) {
  const sessionHash = hashOwnerSessionToken(token);
  const rows = await db
    .select({
      sessionId: ownerSessionsTable.id,
      deviceId: ownerDevicesTable.id,
      label: ownerDevicesTable.label,
      publicKey: ownerDevicesTable.publicKey,
      expiresAt: ownerSessionsTable.expiresAt,
      revokedAt: ownerSessionsTable.revokedAt,
      deviceRevokedAt: ownerDevicesTable.revokedAt,
    })
    .from(ownerSessionsTable)
    .innerJoin(ownerDevicesTable, eq(ownerSessionsTable.deviceId, ownerDevicesTable.id))
    .where(eq(ownerSessionsTable.sessionHash, sessionHash))
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  if (getOwnerSessionFailure(session)) {
    return session;
  }

  const touchedAt = new Date();
  await Promise.all([
    db.update(ownerSessionsTable).set({ lastUsedAt: touchedAt }).where(eq(ownerSessionsTable.id, session.sessionId)),
    db.update(ownerDevicesTable).set({ lastUsedAt: touchedAt }).where(eq(ownerDevicesTable.id, session.deviceId)),
  ]);

  return session;
}

export function getOwnerChallengeFailure(
  challenge: OwnerChallengeStateInput | null,
  now = new Date(),
): { status: number; error: string; message: string } | null {
  if (!challenge || challenge.revokedAt) {
    return { status: 404, error: "challenge_not_found", message: "Challenge not found for this device" };
  }
  if (challenge.usedAt) {
    return { status: 409, error: "challenge_used", message: "Challenge has already been used" };
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return { status: 410, error: "challenge_expired", message: "Challenge has expired" };
  }
  return null;
}

export function getOwnerSessionFailure(
  session: OwnerSessionStateInput | null,
  now = new Date(),
): { status: number; error: string; message: string } | null {
  if (!session || session.revokedAt || session.deviceRevokedAt || session.expiresAt.getTime() <= now.getTime()) {
    return { status: 401, error: "invalid_owner_session", message: "Owner session is invalid or expired" };
  }
  return null;
}
