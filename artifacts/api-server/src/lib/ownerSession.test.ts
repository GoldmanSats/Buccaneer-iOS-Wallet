import test from "node:test";
import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519";
import {
  createOwnerChallengeMessage,
  getInitialOwnerDeviceRegistrationFailure,
  getOwnerChallengeFailure,
  getOwnerSessionFailure,
  hashOwnerSessionToken,
  verifyOwnerChallengeSignature,
} from "./ownerSession.js";

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

test("verifyOwnerChallengeSignature accepts a valid signed challenge", () => {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const message = createOwnerChallengeMessage(7, "abc123");
  const signature = ed25519.sign(message, privateKey);

  assert.equal(
    verifyOwnerChallengeSignature(bytesToHex(publicKey), bytesToHex(signature), 7, "abc123"),
    true,
  );
});

test("getOwnerChallengeFailure rejects replayed challenges", () => {
  const result = getOwnerChallengeFailure({
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: new Date(),
    revokedAt: null,
  });

  assert.deepEqual(result, {
    status: 409,
    error: "challenge_used",
    message: "Challenge has already been used",
  });
});

test("getInitialOwnerDeviceRegistrationFailure allows the first device only", () => {
  assert.equal(getInitialOwnerDeviceRegistrationFailure(false), null);
  assert.deepEqual(getInitialOwnerDeviceRegistrationFailure(true), {
    status: 409,
    error: "owner_device_exists",
    message: "Bellamy is already linked to a trusted device. Add this one from an existing trusted device or use recovery tooling.",
  });
});

test("getOwnerChallengeFailure rejects expired challenges", () => {
  const result = getOwnerChallengeFailure({
    expiresAt: new Date(Date.now() - 1_000),
    usedAt: null,
    revokedAt: null,
  });

  assert.deepEqual(result, {
    status: 410,
    error: "challenge_expired",
    message: "Challenge has expired",
  });
});

test("getOwnerSessionFailure rejects revoked or expired sessions", () => {
  const revoked = getOwnerSessionFailure({
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
    deviceRevokedAt: null,
  });
  const expired = getOwnerSessionFailure({
    expiresAt: new Date(Date.now() - 1_000),
    revokedAt: null,
    deviceRevokedAt: null,
  });

  assert.equal(revoked?.error, "invalid_owner_session");
  assert.equal(expired?.error, "invalid_owner_session");
});

test("hashOwnerSessionToken is deterministic", () => {
  assert.equal(
    hashOwnerSessionToken("bws_test_token"),
    hashOwnerSessionToken("bws_test_token"),
  );
});
