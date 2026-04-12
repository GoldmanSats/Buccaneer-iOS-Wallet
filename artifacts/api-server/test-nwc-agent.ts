/**
 * Test NWC Agent — connects to the built-in relay and sends a get_balance request.
 *
 * Usage:
 *   npx tsx test-nwc-agent.ts "nostr+walletconnect://SERVICE_PUBKEY?relay=ws://...&secret=CLIENT_SECRET"
 */

import WebSocket from "ws";
import * as secp256k1 from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";
import crypto from "crypto";

const NWC_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}
function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash("sha256").update(data).digest());
}

function getEventId(event: {
  pubkey: string; created_at: number; kind: number; tags: string[][]; content: string;
}): string {
  const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

function encryptNip04(plaintext: string, senderSecretHex: string, recipientPubHex: string): string {
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
  if (!encryptedData || !ivStr) throw new Error("Invalid NIP-04 ciphertext");
  const sharedPoint = secp256k1.getSharedSecret(hexToBytes(receiverSecretHex), hexToBytes(`02${senderPubHex}`));
  const sharedX = sharedPoint.slice(1, 33);
  const iv = Buffer.from(ivStr, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(sharedX), iv);
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ---------------------------------------------------------------------------

function parseNwcUri(uri: string) {
  const match = uri.match(/^nostr\+walletconnect:\/\/([0-9a-f]+)\?(.+)$/i);
  if (!match) throw new Error("Invalid NWC URI");
  const servicePubkey = match[1];
  const params = new URLSearchParams(match[2]);
  const relay = params.get("relay");
  const secret = params.get("secret");
  if (!relay || !secret) throw new Error("NWC URI missing relay or secret");
  return { servicePubkey, relay, secret };
}

function deriveClientPubkey(secretHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(secretHex)));
}

async function main() {
  const uri = process.argv[2];
  if (!uri) {
    console.error("Usage: npx tsx test-nwc-agent.ts <NWC_URI>");
    process.exit(1);
  }

  const { servicePubkey, relay, secret } = parseNwcUri(uri);
  const clientPubkey = deriveClientPubkey(secret);

  console.log("┌─────────────────────────────────────────────");
  console.log("│  NWC Agent Test");
  console.log("├─────────────────────────────────────────────");
  console.log(`│  Relay:          ${relay}`);
  console.log(`│  Service pubkey: ${servicePubkey.slice(0, 16)}…`);
  console.log(`│  Client pubkey:  ${clientPubkey.slice(0, 16)}…`);
  console.log("└─────────────────────────────────────────────");
  console.log();

  const ws = new WebSocket(relay);

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    process.exit(1);
  });

  ws.on("open", async () => {
    console.log("✓ Connected to relay\n");

    // Subscribe to responses from the service addressed to us
    const subId = "agent-test";
    ws.send(JSON.stringify(["REQ", subId, {
      kinds: [NWC_RESPONSE_KIND],
      authors: [servicePubkey],
      "#p": [clientPubkey],
    }]));

    // Send get_balance request
    const request = JSON.stringify({ method: "get_balance", params: {} });
    const encryptedContent = encryptNip04(request, secret, servicePubkey);

    const event = {
      pubkey: clientPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: NWC_KIND,
      tags: [["p", servicePubkey]],
      content: encryptedContent,
    };
    const id = getEventId(event);
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(secret)));
    const signedEvent = { ...event, id, sig };

    console.log("→ Sending get_balance request…\n");
    ws.send(JSON.stringify(["EVENT", signedEvent]));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));

    if (msg[0] === "EOSE") {
      return; // end-of-stored-events, expected
    }

    if (msg[0] === "OK") {
      const accepted = msg[2];
      if (!accepted) {
        console.error(`✗ Event rejected: ${msg[3]}`);
        ws.close();
        process.exit(1);
      }
      console.log("✓ Event accepted by relay");
      return;
    }

    if (msg[0] === "EVENT") {
      const event = msg[2];
      if (event.kind === NWC_RESPONSE_KIND) {
        try {
          const decrypted = decryptNip04(event.content, secret, servicePubkey);
          const response = JSON.parse(decrypted);
          console.log("\n┌─────────────────────────────────────────────");
          console.log("│  Response from Bellamy");
          console.log("├─────────────────────────────────────────────");
          if (response.error) {
            console.log(`│  Error: [${response.error.code}] ${response.error.message}`);
          } else {
            console.log(`│  Method: ${response.result_type}`);
            console.log(`│  Result: ${JSON.stringify(response.result, null, 2).split("\n").join("\n│          ")}`);
          }
          console.log("└─────────────────────────────────────────────");
        } catch (err) {
          console.error("Failed to decrypt response:", err);
        }
        ws.close();
        process.exit(0);
      }
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.error("\n✗ Timed out waiting for response (10s)");
    ws.close();
    process.exit(1);
  }, 10_000);
}

main();
