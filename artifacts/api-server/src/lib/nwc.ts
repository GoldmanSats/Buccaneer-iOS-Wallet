import { WebSocket } from "ws";
import * as secp256k1 from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";
import crypto from "crypto";
import { db } from "@workspace/db";
import { agentKeysTable, agentLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getBalance, sendPayment, listPayments, decodeInvoice, receivePayment } from "./breez.js";

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function sha256Hash(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash("sha256").update(data).digest());
}

const RELAY_URL = "wss://relay.damus.io";
const NWC_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const NWC_INFO_KIND = 13194;

let relayWs: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

interface NwcRequest {
  method: string;
  params: Record<string, unknown>;
}

interface NwcResponse {
  result_type: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

function getPublicKey(secretKeyHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(secretKeyHex)));
}

function serializeEvent(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): Uint8Array {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return new TextEncoder().encode(serialized);
}

function getEventId(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): string {
  const serialized = serializeEvent(event);
  return bytesToHex(sha256Hash(serialized));
}

async function signEvent(event: {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}, secretKeyHex: string): Promise<string> {
  const sig = schnorr.sign(hexToBytes(event.id), hexToBytes(secretKeyHex));
  return bytesToHex(sig);
}

async function encryptNip04(
  plaintext: string,
  senderSecretHex: string,
  recipientPubHex: string
): Promise<string> {
  const sharedPoint = secp256k1.getSharedSecret(hexToBytes(senderSecretHex), hexToBytes("02" + recipientPubHex));
  const sharedX = sharedPoint.slice(1, 33);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(sharedX), iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return `${encrypted}?iv=${iv.toString("base64")}`;
}

function decryptNip04(
  ciphertext: string,
  receiverSecretHex: string,
  senderPubHex: string
): string {
  const [encryptedData, ivStr] = ciphertext.split("?iv=");
  if (!encryptedData || !ivStr) throw new Error("Invalid NIP-04 ciphertext format");
  const sharedPoint = secp256k1.getSharedSecret(hexToBytes(receiverSecretHex), hexToBytes("02" + senderPubHex));
  const sharedX = sharedPoint.slice(1, 33);
  const iv = Buffer.from(ivStr, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(sharedX), iv);
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

async function handleNwcRequest(
  agentKey: typeof agentKeysTable.$inferSelect,
  request: NwcRequest
): Promise<NwcResponse> {
  const { method, params } = request;

  try {
    await db.insert(agentLogsTable).values({
      keyId: agentKey.id,
      action: method,
      amount: (params.amount as number) ?? null,
      status: "processing",
      detail: JSON.stringify(params),
    });
  } catch (_e) {}

  if (!agentKey.isActive) {
    return {
      result_type: method,
      error: { code: "UNAUTHORIZED", message: "This agent key is disabled" },
    };
  }

  try {
    switch (method) {
      case "get_info": {
        return {
          result_type: method,
          result: {
            alias: "Buccaneer Wallet",
            color: "#c9a24d",
            pubkey: "",
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
        const bal = await getBalance();
        return {
          result_type: method,
          result: { balance: bal.balanceSats * 1000 },
        };
      }

      case "pay_invoice": {
        const invoice = params.invoice as string;
        if (!invoice) {
          return { result_type: method, error: { code: "OTHER", message: "Missing invoice" } };
        }

        const decoded = await decodeInvoice(invoice);
        const amountSats = decoded.amountSats ?? 0;

        if (agentKey.spendingLimitSats && amountSats > agentKey.spendingLimitSats) {
          return {
            result_type: method,
            error: {
              code: "QUOTA_EXCEEDED",
              message: `Amount ${amountSats} exceeds per-transaction limit of ${agentKey.spendingLimitSats} sats`,
            },
          };
        }

        if (agentKey.maxDailySats) {
          const today = new Date().toISOString().split("T")[0]!;
          let spentToday = agentKey.spentToday ?? 0;
          if (agentKey.spentDate !== today) {
            spentToday = 0;
          }
          if (spentToday + amountSats > agentKey.maxDailySats) {
            return {
              result_type: method,
              error: {
                code: "QUOTA_EXCEEDED",
                message: `Daily limit exceeded. Spent: ${spentToday}, limit: ${agentKey.maxDailySats}`,
              },
            };
          }
        }

        const result = await sendPayment(invoice);

        const today = new Date().toISOString().split("T")[0]!;
        let newSpent = (agentKey.spentDate === today ? agentKey.spentToday : 0) + result.amountSats;
        await db.update(agentKeysTable)
          .set({
            spentToday: newSpent,
            spentDate: today,
            lastUsedAt: new Date(),
          })
          .where(eq(agentKeysTable.id, agentKey.id));

        await db.insert(agentLogsTable).values({
          keyId: agentKey.id,
          action: "pay_invoice",
          amount: result.amountSats,
          status: "success",
          detail: `txhash:${result.paymentHash}|Paid ${result.amountSats} sats, fee: ${result.feeSats}`,
        });

        return {
          result_type: method,
          result: { preimage: result.paymentHash },
        };
      }

      case "make_invoice": {
        const amountMsat = params.amount as number;
        const description = (params.description as string) ?? "";
        const amountSats = Math.ceil(amountMsat / 1000);
        const inv = await receivePayment(amountSats, description);

        await db.insert(agentLogsTable).values({
          keyId: agentKey.id,
          action: "make_invoice",
          amount: amountSats,
          status: "success",
          detail: `Created invoice for ${amountSats} sats`,
        });

        return {
          result_type: method,
          result: {
            type: "incoming",
            invoice: inv.bolt11,
            description,
            amount: amountMsat,
            created_at: Math.floor(Date.now() / 1000),
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        };
      }

      case "list_transactions": {
        const payments = await listPayments();
        const transactions = payments.slice(0, 20).map((p) => ({
          type: p.type === "send" ? "outgoing" : "incoming",
          invoice: "",
          description: p.description,
          amount: p.amountSats * 1000,
          fees_paid: p.feeSats * 1000,
          created_at: Math.floor(new Date(p.timestamp).getTime() / 1000),
          settled_at: Math.floor(new Date(p.timestamp).getTime() / 1000),
          payment_hash: p.paymentHash,
        }));
        return {
          result_type: method,
          result: { transactions } as any,
        };
      }

      case "lookup_invoice": {
        const paymentHash = params.payment_hash as string;
        if (!paymentHash) {
          return { result_type: method, error: { code: "OTHER", message: "Missing payment_hash" } };
        }
        const payments = await listPayments();
        const found = payments.find((p) => p.paymentHash === paymentHash);
        if (!found) {
          return { result_type: method, error: { code: "NOT_FOUND", message: "Invoice not found" } };
        }
        return {
          result_type: method,
          result: {
            type: found.type === "send" ? "outgoing" : "incoming",
            invoice: "",
            description: found.description,
            amount: found.amountSats * 1000,
            fees_paid: found.feeSats * 1000,
            created_at: Math.floor(new Date(found.timestamp).getTime() / 1000),
            settled_at: Math.floor(new Date(found.timestamp).getTime() / 1000),
            payment_hash: found.paymentHash,
          },
        };
      }

      default:
        return {
          result_type: method,
          error: { code: "NOT_IMPLEMENTED", message: `Method ${method} not supported` },
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[NWC] Error handling ${method}:`, msg);

    try {
      await db.insert(agentLogsTable).values({
        keyId: agentKey.id,
        action: method,
        status: "error",
        detail: msg,
      });
    } catch (_e) {}

    return {
      result_type: method,
      error: { code: "INTERNAL", message: msg },
    };
  }
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
    const expectedId = getEventId(event);
    if (expectedId !== event.id) {
      console.error("[NWC] Event ID mismatch");
      return false;
    }
    return schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey)
    );
  } catch (e) {
    console.error("[NWC] Signature verification error:", e);
    return false;
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
  console.log(`[NWC] processEvent called: kind=${event.kind} id=${event.id?.slice(0,12)}...`);
  if (event.kind !== NWC_KIND) {
    console.log(`[NWC] Ignoring non-NWC event kind=${event.kind}`);
    return;
  }

  if (!verifyEventSignature(event)) {
    console.warn("[NWC] Rejected event with invalid signature:", event.id);
    return;
  }

  const pTag = event.tags.find((t) => t[0] === "p")?.[1];
  if (!pTag) {
    console.warn("[NWC] Event missing p tag:", event.id);
    return;
  }
  console.log(`[NWC] Event p-tag target: ${pTag.slice(0, 12)}...`);

  const keys = await db.select().from(agentKeysTable);
  const matchingKey = keys.find((k) => {
    try {
      return getPublicKey(k.secretKey) === pTag;
    } catch {
      return false;
    }
  });

  if (!matchingKey) {
    console.log("[NWC] No matching key for pubkey:", pTag);
    return;
  }

  try {
    const decrypted = decryptNip04(event.content, matchingKey.secretKey, event.pubkey);
    const request: NwcRequest = JSON.parse(decrypted);

    console.log(`[NWC] Processing ${request.method} for key "${matchingKey.name}"`);

    const response = await handleNwcRequest(matchingKey, request);

    const responsePubkey = getPublicKey(matchingKey.secretKey);
    const responseContent = await encryptNip04(
      JSON.stringify(response),
      matchingKey.secretKey,
      event.pubkey
    );

    const responseEvent = {
      pubkey: responsePubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: NWC_RESPONSE_KIND,
      tags: [
        ["p", event.pubkey],
        ["e", event.id],
      ],
      content: responseContent,
    };

    const id = getEventId(responseEvent);
    const sig = await signEvent({ ...responseEvent, id }, matchingKey.secretKey);

    const signedEvent = { ...responseEvent, id, sig };

    if (relayWs && relayWs.readyState === WebSocket.OPEN) {
      relayWs.send(JSON.stringify(["EVENT", signedEvent]));
      console.log(`[NWC] Sent response for ${request.method}`);
    }
  } catch (err) {
    console.error("[NWC] Failed to process event:", err);
  }
}

const SUPPORTED_METHODS = "pay_invoice make_invoice get_balance get_info list_transactions lookup_invoice";
let infoEventInterval: ReturnType<typeof setInterval> | null = null;

async function publishInfoEvents(keys: (typeof agentKeysTable.$inferSelect)[]) {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) return;

  const nwcKeys = keys.filter((k) => k.isActive && k.connectionType === "nwc");
  for (const key of nwcKeys) {
    try {
      const pubkey = getPublicKey(key.secretKey);
      const infoEvent = {
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: NWC_INFO_KIND,
        tags: [["d", pubkey]],
        content: SUPPORTED_METHODS,
      };
      const id = getEventId(infoEvent);
      const sig = await signEvent({ ...infoEvent, id }, key.secretKey);
      const signed = { ...infoEvent, id, sig };
      relayWs!.send(JSON.stringify(["EVENT", signed]));
      console.log(`[NWC] Published info event (kind 13194) for key "${key.name}" pubkey=${pubkey.slice(0, 12)}...`);
    } catch (e) {
      console.error(`[NWC] Failed to publish info event for key "${key.name}":`, e);
    }
  }
}

async function subscribeToKeys() {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) return;

  try {
    const keys = await db.select().from(agentKeysTable);
    const pubkeys = keys
      .filter((k) => k.isActive && k.connectionType === "nwc")
      .map((k) => {
        try {
          return getPublicKey(k.secretKey);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    if (pubkeys.length === 0) {
      console.log("[NWC] No active NWC keys to subscribe to");
      return;
    }

    const filter = {
      kinds: [NWC_KIND],
      "#p": pubkeys,
      since: Math.floor(Date.now() / 1000) - 60,
    };

    relayWs!.send(JSON.stringify(["REQ", "nwc-sub", filter]));
    console.log(`[NWC] Subscribed to ${pubkeys.length} NWC key(s): ${pubkeys.map(p => p.slice(0,12) + '...').join(', ')}`);

    await publishInfoEvents(keys);

    if (infoEventInterval) clearInterval(infoEventInterval);
    infoEventInterval = setInterval(async () => {
      try {
        const freshKeys = await db.select().from(agentKeysTable);
        await publishInfoEvents(freshKeys);
      } catch (e) {
        console.error("[NWC] Failed to re-publish info events:", e);
      }
    }, 5 * 60 * 1000);
  } catch (e) {
    console.error("[NWC] Failed to load keys:", e);
  }
}

function connectToRelay() {
  if (relayWs) {
    try { relayWs.close(); } catch (_e) {}
  }

  console.log(`[NWC] Connecting to ${RELAY_URL}...`);

  relayWs = new WebSocket(RELAY_URL);

  relayWs.on("open", () => {
    console.log("[NWC] Connected to relay");
    subscribeToKeys();
  });

  relayWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg)) {
        if (msg[0] === "EVENT" && msg[2]) {
          const evt = msg[2];
          console.log(`[NWC] Received EVENT kind=${evt.kind} id=${evt.id?.slice(0,12)}... from=${evt.pubkey?.slice(0,12)}...`);
          processEvent(evt);
        } else if (msg[0] === "EOSE") {
          console.log("[NWC] End of stored events");
        } else if (msg[0] === "OK") {
          const [, eventId, accepted, reason] = msg;
          if (accepted) {
            console.log(`[NWC] Relay accepted event ${(eventId as string)?.slice(0, 12)}...`);
          } else {
            console.warn(`[NWC] Relay REJECTED event ${(eventId as string)?.slice(0, 12)}...: ${reason}`);
          }
        } else if (msg[0] === "NOTICE") {
          console.log("[NWC] Relay notice:", msg[1]);
        } else if (msg[0] === "CLOSED") {
          console.warn("[NWC] Subscription closed by relay:", msg[1], msg[2]);
        }
      }
    } catch (e) {
      console.error("[NWC] Failed to parse relay message:", e);
    }
  });

  relayWs.on("close", () => {
    console.log("[NWC] Relay connection closed");
    if (isRunning) {
      reconnectTimeout = setTimeout(connectToRelay, 5000);
    }
  });

  relayWs.on("error", (err) => {
    console.error("[NWC] Relay error:", err.message);
  });
}

export function startNwcRelay() {
  if (isRunning) return;
  isRunning = true;
  console.log("[NWC] Starting NWC relay service");
  connectToRelay();
}

export function stopNwcRelay() {
  isRunning = false;
  if (infoEventInterval) {
    clearInterval(infoEventInterval);
    infoEventInterval = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (relayWs) {
    try { relayWs.close(); } catch (_e) {}
    relayWs = null;
  }
  console.log("[NWC] Relay service stopped");
}

export function refreshNwcSubscriptions() {
  subscribeToKeys();
}
