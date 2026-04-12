import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import type { Duplex } from "stream";
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

const NWC_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const NWC_INFO_KIND = 13194;
const SUPPORTED_METHODS = "pay_invoice make_invoice get_balance get_info list_transactions lookup_invoice";

interface NostrFilter {
  kinds?: number[];
  authors?: string[];
  "#p"?: string[];
  "#e"?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface NwcRequest {
  method: string;
  params: Record<string, unknown>;
}

interface NwcResponse {
  result_type: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

interface ConnectedClient {
  ws: WebSocket;
  subscriptions: Map<string, NostrFilter>;
}

const clients = new Set<ConnectedClient>();

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

function verifyEventSignature(event: NostrEvent): boolean {
  try {
    if (getEventId(event) !== event.id) return false;
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    return false;
  }
}

function eventMatchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;
  const pTags = filter["#p"];
  if (pTags) {
    const eventPTags = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
    if (!pTags.some((p) => eventPTags.includes(p))) return false;
  }
  const eTags = filter["#e"];
  if (eTags) {
    const eventETags = event.tags.filter((t) => t[0] === "e").map((t) => t[1]);
    if (!eTags.some((e) => eventETags.includes(e))) return false;
  }
  return true;
}

function sendToClient(client: ConnectedClient, message: unknown[]) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

function broadcastEvent(event: NostrEvent, exclude?: ConnectedClient) {
  for (const client of clients) {
    if (client === exclude) continue;
    for (const [subId, filter] of client.subscriptions) {
      if (eventMatchesFilter(event, filter)) {
        sendToClient(client, ["EVENT", subId, event]);
        break;
      }
    }
  }
}

async function getActiveNwcPolicies() {
  const policies = await db.select().from(walletAgentPoliciesTable);
  return policies.filter(
    (p) => p.isActive && p.connectionType === "nwc" && !!p.nwcSecretKey && !!p.nwcClientPubkey,
  );
}

async function handleNwcRequest(
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

async function processNwcEvent(event: NostrEvent, sender: ConnectedClient) {
  if (!verifyEventSignature(event)) {
    sendToClient(sender, ["OK", event.id, false, "invalid: bad signature"]);
    return;
  }

  if (event.kind === NWC_KIND) {
    sendToClient(sender, ["OK", event.id, true, ""]);

    const targetPubkey = event.tags.find((t) => t[0] === "p")?.[1];
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
      const response = await handleNwcRequest(policy, request);
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
      const fullEvent: NostrEvent = { ...responseEvent, id, sig };

      sendToClient(sender, ["EVENT", "__nwc_response__", fullEvent]);
      broadcastEvent(fullEvent, sender);
    } catch (error) {
      console.error("[NWC Relay] Failed to process NWC request:", error);
    }
  } else {
    sendToClient(sender, ["OK", event.id, false, "blocked: only NWC events accepted"]);
  }
}

function handleReq(client: ConnectedClient, message: unknown[]) {
  const subId = message[1] as string;
  if (!subId || typeof subId !== "string") return;

  const filters: NostrFilter[] = [];
  for (let i = 2; i < message.length; i++) {
    if (message[i] && typeof message[i] === "object") {
      filters.push(message[i] as NostrFilter);
    }
  }

  const merged: NostrFilter = {};
  for (const f of filters) {
    if (f.kinds) merged.kinds = [...(merged.kinds ?? []), ...f.kinds];
    if (f.authors) merged.authors = [...(merged.authors ?? []), ...f.authors];
    if (f["#p"]) merged["#p"] = [...(merged["#p"] ?? []), ...f["#p"]];
    if (f["#e"]) merged["#e"] = [...(merged["#e"] ?? []), ...f["#e"]];
    if (f.since !== undefined) merged.since = Math.min(merged.since ?? Infinity, f.since);
    if (f.until !== undefined) merged.until = Math.max(merged.until ?? 0, f.until);
  }

  client.subscriptions.set(subId, merged);
  sendToClient(client, ["EOSE", subId]);
}

function handleClose(client: ConnectedClient, message: unknown[]) {
  const subId = message[1] as string;
  if (subId) {
    client.subscriptions.delete(subId);
    sendToClient(client, ["CLOSED", subId, ""]);
  }
}

async function handleMessage(client: ConnectedClient, raw: Buffer | string) {
  try {
    const message = JSON.parse(String(raw));
    if (!Array.isArray(message) || message.length < 2) return;

    switch (message[0]) {
      case "REQ":
        handleReq(client, message);
        break;
      case "EVENT":
        if (message[1] && typeof message[1] === "object") {
          await processNwcEvent(message[1] as NostrEvent, client);
        }
        break;
      case "CLOSE":
        handleClose(client, message);
        break;
    }
  } catch (error) {
    console.error("[NWC Relay] Failed to parse message:", error);
  }
}

export function mountNwcRelay(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/nwc") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    const client: ConnectedClient = { ws, subscriptions: new Map() };
    clients.add(client);

    ws.on("message", (data: Buffer | string) => {
      void handleMessage(client, data);
    });

    ws.on("close", () => {
      clients.delete(client);
    });

    ws.on("error", () => {
      clients.delete(client);
    });
  });

  console.log("[NWC Relay] Mounted at /nwc");
}
