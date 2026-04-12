import http2 from "http2";
import crypto from "crypto";
import fs from "fs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { walletAgentIdentitiesTable } from "@workspace/db/schema";

const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.development.push.apple.com";

let cachedJwt: { token: string; issuedAt: number } | null = null;

function getApnsConfig() {
  const keyPath = process.env.APNS_KEY_PATH;
  const keyBase64 = process.env.APNS_KEY_BASE64;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID ?? "buccaneerwallet";
  const environment = process.env.APNS_ENVIRONMENT ?? "production";

  if (!keyId || !teamId || (!keyPath && !keyBase64)) {
    return null;
  }

  let keyData: string;
  if (keyBase64) {
    keyData = Buffer.from(keyBase64, "base64").toString("utf8");
  } else {
    keyData = fs.readFileSync(keyPath!, "utf8");
  }

  return { keyData, keyId, teamId, bundleId, environment };
}

function createJwt(keyData: string, keyId: string, teamId: string): string {
  const now = Math.floor(Date.now() / 1000);

  if (cachedJwt && now - cachedJwt.issuedAt < 3000) {
    return cachedJwt.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const signingInput = `${header}.${payload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const derSig = sign.sign(keyData);

  const asn1 = new Uint8Array(derSig);
  let offset = 2;
  if (asn1[1]! > 0x80) offset += asn1[1]! - 0x80;
  const rLen = asn1[offset + 1]!;
  const rStart = offset + 2;
  const sLen = asn1[rStart + rLen + 1]!;
  const sStart = rStart + rLen + 2;

  const r = asn1.slice(rStart, rStart + rLen);
  const s = asn1.slice(sStart, sStart + sLen);

  const rawSig = Buffer.alloc(64);
  Buffer.from(r.length > 32 ? r.slice(r.length - 32) : r).copy(rawSig, 32 - Math.min(r.length, 32));
  Buffer.from(s.length > 32 ? s.slice(s.length - 32) : s).copy(rawSig, 64 - Math.min(s.length, 32));

  const sig = rawSig.toString("base64url");
  const token = `${signingInput}.${sig}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

function sendApnsRequest(
  host: string,
  deviceToken: string,
  jwt: string,
  bundleId: string,
  payload: Record<string, unknown>,
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", reject);

    const body = JSON.stringify(payload);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });

    let responseBody = "";
    req.on("data", (chunk: Buffer) => {
      responseBody += chunk.toString();
    });

    req.on("end", () => {
      client.close();
      if (status >= 200 && status < 300) {
        resolve({ status });
      } else {
        reject(new Error(`APNs returned ${status}: ${responseBody}`));
      }
    });

    req.on("error", (err) => {
      client.close();
      reject(err);
    });

    req.end(body);
  });
}

export async function sendSilentPush(identityId: number): Promise<boolean> {
  const config = getApnsConfig();
  if (!config) {
    console.warn("[PushService] APNs not configured — skipping silent push");
    return false;
  }

  const rows = await db
    .select({ pushToken: walletAgentIdentitiesTable.pushToken })
    .from(walletAgentIdentitiesTable)
    .where(eq(walletAgentIdentitiesTable.id, identityId))
    .limit(1);

  const pushToken = rows[0]?.pushToken;
  if (!pushToken) {
    console.warn("[PushService] No push token for identity", identityId);
    return false;
  }

  const jwt = createJwt(config.keyData, config.keyId, config.teamId);
  const host = config.environment === "production" ? APNS_HOST_PRODUCTION : APNS_HOST_SANDBOX;

  const payload = {
    aps: { "content-available": 1 },
    type: "agent_request",
  };

  try {
    await sendApnsRequest(host, pushToken, jwt, config.bundleId, payload);
    console.log("[PushService] Silent push sent to identity", identityId);
    return true;
  } catch (error) {
    console.error("[PushService] Failed to send silent push:", error);
    return false;
  }
}
