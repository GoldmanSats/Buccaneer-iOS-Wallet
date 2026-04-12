import test from "node:test";
import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519";
import {
  createWalletAgentChallengeMessage,
  getWalletAgentChallengeFailure,
  getWalletAgentSessionFailure,
  hashWalletAgentSessionToken,
  verifyWalletAgentChallengeSignature,
} from "./agentAccessSession.js";
import { getDailySpendFailure } from "./perUserAgentAccess.js";

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

test("verifyWalletAgentChallengeSignature accepts a valid signed challenge", () => {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const message = createWalletAgentChallengeMessage(11, "wallet_nonce");
  const signature = ed25519.sign(message, privateKey);

  assert.equal(
    verifyWalletAgentChallengeSignature(bytesToHex(publicKey), bytesToHex(signature), 11, "wallet_nonce"),
    true,
  );
});

test("getWalletAgentChallengeFailure rejects used and expired challenges", () => {
  assert.deepEqual(
    getWalletAgentChallengeFailure({
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      revokedAt: null,
    }),
    {
      status: 409,
      error: "challenge_used",
      message: "Challenge has already been used",
    },
  );

  assert.deepEqual(
    getWalletAgentChallengeFailure({
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      revokedAt: null,
    }),
    {
      status: 410,
      error: "challenge_expired",
      message: "Challenge has expired",
    },
  );
});

test("getWalletAgentSessionFailure rejects revoked and expired sessions", () => {
  const revoked = getWalletAgentSessionFailure({
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
    identityRevokedAt: null,
  });
  const expired = getWalletAgentSessionFailure({
    expiresAt: new Date(Date.now() - 1_000),
    revokedAt: null,
    identityRevokedAt: null,
  });

  assert.equal(revoked?.error, "invalid_wallet_agent_session");
  assert.equal(expired?.error, "invalid_wallet_agent_session");
});

test("hashWalletAgentSessionToken is deterministic", () => {
  assert.equal(
    hashWalletAgentSessionToken("bwa_test_token"),
    hashWalletAgentSessionToken("bwa_test_token"),
  );
});

test("getDailySpendFailure enforces per-tx and daily limits", () => {
  assert.equal(getDailySpendFailure({
    spendingLimitSats: 100,
    maxDailySats: 1_000,
    spentToday: 0,
    spentDate: new Date().toISOString().slice(0, 10),
  }, 200), "This request is over the per-transaction limit of 100 sats.");

  assert.equal(getDailySpendFailure({
    spendingLimitSats: null,
    maxDailySats: 1_000,
    spentToday: 900,
    spentDate: new Date().toISOString().slice(0, 10),
  }, 200), "This request would exceed the daily limit of 1000 sats.");
});
