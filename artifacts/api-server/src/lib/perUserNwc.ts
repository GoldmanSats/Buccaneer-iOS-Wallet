import { WebSocket } from "ws";
import * as secp256k1 from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";
import crypto from "crypto";
import { db } from "@workspace/db";
import { walletAgentPoliciesTable } from "@workspace/db/schema";
import {
  createWalletAgentRequest,
  derivePerUserNwcPubkey,
  getDailySpendFailure,
  getWalletAgentSnapshot,
  incrementWalletAgentSpend,
  touchWalletAgentPolicy,
  waitForWalletAgentRequestResult,
} from "./perUserAgentAccess.js";

const RELAY_URL = "wss://relay.damus.io";
const NWC_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const NWC_INFO_KIND = 13194;
const SUBSCRIPTION_LOOKBACK_SECS = 5 * 60;
const RECONNECT_DELAY_MS = 5000;
const RESUBSCRIBE_DELAY_MS = 1000;
const SUPPORTED_METHODS = "pay_invoice make_invoice get_balance get_info list_transactions lookup_invoice";

let relayWs: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let infoEventInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let currentSubscriptionId: string | null = null;
let subscriptionSequence = 0;
let pendingSubscriptionRefresh = false;

interface NwcRequest {
  method: string;
  params: Record<string, unknown>;
}

interface NwcResponse {
  result_type: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function sha256Hash(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash("sha256").update(data).digest());
}

function serializeEvent(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]));
}

function getEventId(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): string {
  return bytesToHex(sha256Hash(serializeEvent(event)));
}

async function signEvent(event: {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}, secretKeyHex: string): Promise<string> {
  return bytesToHex(schnorr.sign(hexToBytes(event.id), hexToBytes(secretKeyHex)));
}

async function encryptNip04(plaintext: string, senderSecretHex: string, recipientPubHex: string): Promise<string> {
  const sharedPoint = secp256k1.getSharedSecret(hexToBytes(senderSecretHex), hexToBytes(`02${recipientPubHex}`));
  const sharedX = sharedPoint.slice(1, 33);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(sharedX), iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return `${encrypted}?iv=${iv.toString("base64")}`;
}

function decryptNip04(ciphertext: string, receiverSecretHex: string, senderPubHex: string): string {
  const [encryptedData, ivStr] = ciphertext.split("?iv=");
  if (!encryptedData || !ivStr) throw new Error("Invalid NIP-04 ciphertext format");
  const sharedPoint = secp256k1.getSharedSecret(hexToBytes(receiverSecretHex), hexToBytes(`02${senderPubHex}`));
  const sharedX = sharedPoint.slice(1, 33);
  const iv = Buffer.from(ivStr, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(sharedX), iv);
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function verifyEventSignature(event: {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}): boolean {
  try {
    if (getEventId(event) !== event.id) {
      return false;
    }
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    return false;
  }
}

async function getActiveNwcPolicies() {
  const policies = await db.select().from(walletAgentPoliciesTable);
  return policies.filter((policy) => policy.isActive && policy.connectionType === "nwc" && !!policy.nwcSecretKey && !!policy.nwcClientPubkey);
}

async function handlePerUserNwcRequest(
  policy: typeof walletAgentPoliciesTable.$inferSelect,
  request: NwcRequest,
): Promise<NwcResponse> {
  const { method, params } = request;
  await touchWalletAgentPolicy(policy.id);

  try {
    switch (method) {
      case "get_info": {
        return {
          result_type: method,
          result: {
            alias: "Bellamy",
            color: "#c9a24d",
            pubkey: derivePerUserNwcPubkey(policy.nwcSecretKey!),
            network: "mainnet",
            block_height: 0,
            block_hash: "",
            methods: [
              "get_info",
              "get_balance",
              "pay_invoice",
              "make_invoice",
              "list_transactions",
              "lookup_invoice",
            ],
          },
        };
      }

      case "get_balance": {
        const snapshot = await getWalletAgentSnapshot(policy.identityId);
        if (!snapshot?.balance) {
          return { result_type: method, error: { code: "OTHER", message: "Bellamy is waiting for the wallet device to come online." } };
        }
        return {
          result_type: method,
          result: { balance: (Number((snapshot.balance as { balanceSats?: number }).balanceSats ?? 0)) * 1000 },
        };
      }

      case "list_transactions": {
        const snapshot = await getWalletAgentSnapshot(policy.identityId);
        if (!snapshot) {
          return { result_type: method, error: { code: "OTHER", message: "Bellamy is waiting for the wallet device to come online." } };
        }
        const from = typeof params.from === "number" ? params.from : 0;
        const until = typeof params.until === "number" ? params.until : Math.floor(Date.now() / 1000);
        const offset = typeof params.offset === "number" ? params.offset : 0;
        const limit = typeof params.limit === "number" ? params.limit : 20;
        const typeFilter = params.type === "incoming" || params.type === "outgoing" ? params.type : undefined;
        const transactions = Array.isArray(snapshot.transactions) ? snapshot.transactions as Array<Record<string, unknown>> : [];
        const filtered = transactions.filter((tx) => {
          const kind = tx.type === "send" ? "outgoing" : "incoming";
          const createdAt = Math.floor(new Date(String(tx.timestamp ?? new Date().toISOString())).getTime() / 1000);
          if (typeFilter && kind !== typeFilter) return false;
          return createdAt >= from && createdAt <= until;
        });
        return {
          result_type: method,
          result: {
            transactions: filtered.slice(offset, offset + limit).map((tx) => {
              const createdAt = Math.floor(new Date(String(tx.timestamp ?? new Date().toISOString())).getTime() / 1000);
              return {
                type: tx.type === "send" ? "outgoing" : "incoming",
                invoice: String(tx.invoice ?? ""),
                description: String(tx.description ?? ""),
                preimage: tx.preimage ? String(tx.preimage) : undefined,
                amount: Number(tx.amountSats ?? 0) * 1000,
                fees_paid: Number(tx.feeSats ?? 0) * 1000,
                created_at: createdAt,
                settled_at: createdAt,
                payment_hash: String(tx.paymentHash ?? ""),
              };
            }),
          },
        };
      }

      case "lookup_invoice": {
        const paymentHash = typeof params.payment_hash === "string" ? params.payment_hash : null;
        if (!paymentHash) {
          return { result_type: method, error: { code: "OTHER", message: "payment_hash is required" } };
        }
        const snapshot = await getWalletAgentSnapshot(policy.identityId);
        const transactions = Array.isArray(snapshot?.transactions) ? snapshot!.transactions as Array<Record<string, unknown>> : [];
        const tx = transactions.find((item) => item.paymentHash === paymentHash);
        if (!tx) {
          return { result_type: method, error: { code: "NOT_FOUND", message: "Invoice not found" } };
        }
        const createdAt = Math.floor(new Date(String(tx.timestamp ?? new Date().toISOString())).getTime() / 1000);
        return {
          result_type: method,
          result: {
            type: tx.type === "send" ? "outgoing" : "incoming",
            invoice: String(tx.invoice ?? ""),
            description: String(tx.description ?? ""),
            preimage: tx.preimage ? String(tx.preimage) : undefined,
            amount: Number(tx.amountSats ?? 0) * 1000,
            fees_paid: Number(tx.feeSats ?? 0) * 1000,
            created_at: createdAt,
            settled_at: createdAt,
            payment_hash: String(tx.paymentHash ?? ""),
          },
        };
      }

      case "pay_invoice": {
        const invoice = params.invoice as string | undefined;
        if (!invoice) {
          return { result_type: method, error: { code: "OTHER", message: "Missing invoice" } };
        }
        const amountSats = typeof params.amount === "number" ? Math.ceil(params.amount / 1000) : 0;
        const spendFailure = getDailySpendFailure(policy, amountSats);
        if (spendFailure) {
          return { result_type: method, error: { code: "QUOTA_EXCEEDED", message: spendFailure } };
        }
        const requestRow = await createWalletAgentRequest(policy, "send_payment", { bolt11: invoice, amountSats }, {
          amountSats,
          requiresFreshApproval: policy.approvalMode === "per_action",
          expiresInMs: 60_000,
        });
        const result = await waitForWalletAgentRequestResult(requestRow.id);
        if (!result) {
          return { result_type: method, error: { code: "OTHER", message: "Awaiting approval in Bellamy." } };
        }
        if (result.status === "rejected") {
          return { result_type: method, error: { code: "OTHER", message: result.errorMessage ?? "Request rejected in Bellamy." } };
        }
        const payload = result.responsePayload as { amountSats?: number; feeSats?: number } | null;
        if (typeof payload?.amountSats === "number" && payload.amountSats > 0) {
          await incrementWalletAgentSpend(policy.id, payload.amountSats);
        }
        return {
          result_type: method,
          result: {
            preimage: "",
            fees_paid: Number(payload?.feeSats ?? 0) * 1000,
          },
        };
      }

      case "make_invoice": {
        const amountMsat = params.amount as number | undefined;
        if (!amountMsat) {
          return { result_type: method, error: { code: "OTHER", message: "Missing amount" } };
        }
        const description = typeof params.description === "string" ? params.description : "";
        const amountSats = Math.ceil(amountMsat / 1000);
        const requestRow = await createWalletAgentRequest(policy, "create_invoice", { amountSats, description }, {
          amountSats,
          requiresFreshApproval: policy.approvalMode === "per_action",
          expiresInMs: 60_000,
        });
        const result = await waitForWalletAgentRequestResult(requestRow.id);
        if (!result) {
          return { result_type: method, error: { code: "OTHER", message: "Awaiting approval in Bellamy." } };
        }
        if (result.status === "rejected") {
          return { result_type: method, error: { code: "OTHER", message: result.errorMessage ?? "Request rejected in Bellamy." } };
        }
        const payload = result.responsePayload as { bolt11?: string; description?: string } | null;
        const createdAt = Math.floor(Date.now() / 1000);
        return {
          result_type: method,
          result: {
            type: "incoming",
            invoice: payload?.bolt11 ?? "",
            description: payload?.description ?? description,
            payment_hash: "",
            amount: amountMsat,
            fees_paid: 0,
            created_at: createdAt,
            expires_at: createdAt + 3600,
          },
        };
      }

      default:
        return {
          result_type: method,
          error: { code: "NOT_IMPLEMENTED", message: `Method ${method} not supported` },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result_type: method, error: { code: "INTERNAL", message } };
  }
}

async function publishInfoEvents(policies: (typeof walletAgentPoliciesTable.$inferSelect)[]) {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) return;
  for (const policy of policies) {
    try {
      if (!policy.nwcSecretKey) continue;
      const pubkey = derivePerUserNwcPubkey(policy.nwcSecretKey);
      const infoEvent = {
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: NWC_INFO_KIND,
        tags: [["d", pubkey]],
        content: SUPPORTED_METHODS,
      };
      const id = getEventId(infoEvent);
      const sig = await signEvent({ ...infoEvent, id }, policy.nwcSecretKey);
      relayWs.send(JSON.stringify(["EVENT", { ...infoEvent, id, sig }]));
    } catch (error) {
      console.error("[PerUserNWC] Failed to publish info event:", error);
    }
  }
}

async function subscribeToPolicies() {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    pendingSubscriptionRefresh = true;
    return;
  }

  pendingSubscriptionRefresh = false;
  try {
    const policies = await getActiveNwcPolicies();
    const pubkeys = policies.map((policy) => derivePerUserNwcPubkey(policy.nwcSecretKey!));
    if (pubkeys.length === 0) {
      if (currentSubscriptionId) {
        relayWs.send(JSON.stringify(["CLOSE", currentSubscriptionId]));
      }
      currentSubscriptionId = null;
      return;
    }

    if (currentSubscriptionId) {
      relayWs.send(JSON.stringify(["CLOSE", currentSubscriptionId]));
    }

    currentSubscriptionId = `per-user-nwc-${++subscriptionSequence}`;
    relayWs.send(JSON.stringify([
      "REQ",
      currentSubscriptionId,
      {
        kinds: [NWC_KIND],
        "#p": pubkeys,
        since: Math.floor(Date.now() / 1000) - SUBSCRIPTION_LOOKBACK_SECS,
      },
    ]));

    await publishInfoEvents(policies);

    if (infoEventInterval) {
      clearInterval(infoEventInterval);
    }
    infoEventInterval = setInterval(() => {
      void getActiveNwcPolicies().then((freshPolicies) => publishInfoEvents(freshPolicies));
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("[PerUserNWC] Failed to subscribe to policies:", error);
  }
}

async function processEvent(event: {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}) {
  if (event.kind !== NWC_KIND || !verifyEventSignature(event)) {
    return;
  }

  const targetPubkey = event.tags.find((tag) => tag[0] === "p")?.[1];
  if (!targetPubkey) return;

  const policies = await getActiveNwcPolicies();
  const policy = policies.find((candidate) => {
    try {
      return candidate.nwcSecretKey
        && candidate.nwcClientPubkey === event.pubkey
        && derivePerUserNwcPubkey(candidate.nwcSecretKey) === targetPubkey;
    } catch {
      return false;
    }
  });
  if (!policy?.nwcSecretKey) return;

  try {
    const decrypted = decryptNip04(event.content, policy.nwcSecretKey, event.pubkey);
    const request = JSON.parse(decrypted) as NwcRequest;
    const response = await handlePerUserNwcRequest(policy, request);
    const responseContent = await encryptNip04(JSON.stringify(response), policy.nwcSecretKey, event.pubkey);
    const responseEvent = {
      pubkey: derivePerUserNwcPubkey(policy.nwcSecretKey),
      created_at: Math.floor(Date.now() / 1000),
      kind: NWC_RESPONSE_KIND,
      tags: [["p", event.pubkey], ["e", event.id]],
      content: responseContent,
    };
    const id = getEventId(responseEvent);
    const sig = await signEvent({ ...responseEvent, id }, policy.nwcSecretKey);
    if (relayWs && relayWs.readyState === WebSocket.OPEN) {
      relayWs.send(JSON.stringify(["EVENT", { ...responseEvent, id, sig }]));
    }
  } catch (error) {
    console.error("[PerUserNWC] Failed to process event:", error);
  }
}

function scheduleReconnect(delayMs = RECONNECT_DELAY_MS) {
  if (!isRunning || reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (isRunning) {
      connectToRelay();
    }
  }, delayMs);
}

function connectToRelay() {
  if (relayWs) {
    try { relayWs.close(); } catch {}
  }

  relayWs = new WebSocket(RELAY_URL);

  relayWs.on("open", () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    pendingSubscriptionRefresh = true;
    void subscribeToPolicies();
  });

  relayWs.on("message", (data: unknown) => {
    try {
      const message = JSON.parse(String(data));
      if (!Array.isArray(message)) return;
      if (message[0] === "EVENT" && message[2]) {
        void processEvent(message[2]);
      }
      if (message[0] === "CLOSED") {
        const [, subscriptionId] = message;
        if (subscriptionId === currentSubscriptionId) {
          currentSubscriptionId = null;
          pendingSubscriptionRefresh = true;
          setTimeout(() => {
            if (isRunning && relayWs?.readyState === WebSocket.OPEN && pendingSubscriptionRefresh) {
              void subscribeToPolicies();
            }
          }, RESUBSCRIBE_DELAY_MS);
        }
      }
    } catch (error) {
      console.error("[PerUserNWC] Failed to parse relay message:", error);
    }
  });

  relayWs.on("close", () => {
    currentSubscriptionId = null;
    pendingSubscriptionRefresh = true;
    if (infoEventInterval) {
      clearInterval(infoEventInterval);
      infoEventInterval = null;
    }
    scheduleReconnect();
  });

  relayWs.on("error", () => {
    pendingSubscriptionRefresh = true;
    scheduleReconnect();
  });
}

export function startPerUserNwcRelay() {
  if (isRunning) return;
  isRunning = true;
  connectToRelay();
}

export function refreshPerUserNwcSubscriptions() {
  pendingSubscriptionRefresh = true;
  void subscribeToPolicies();
}
