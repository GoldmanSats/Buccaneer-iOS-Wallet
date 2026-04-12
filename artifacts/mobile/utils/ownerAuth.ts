import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { ed25519 } from "@noble/curves/ed25519";
import { Platform } from "react-native";
import { hasRecentLocalAuth, noteSuccessfulLocalAuth } from "@/utils/localAuthState";

const OWNER_DEVICE_PRIVATE_KEY = "bellamy_owner_device_private_key";
const OWNER_DEVICE_PUBLIC_KEY = "bellamy_owner_device_public_key";
const OWNER_SESSION_KEY = "bellamy_owner_session";
const SESSION_SKEW_MS = 15 * 1000;

interface OwnerSessionPayload {
  token: string;
  expiresAt: string;
}

interface OwnerChallengeResponse {
  challengeId: number;
  nonce: string;
  expiresAt: string;
}

interface OwnerSessionResponse {
  sessionToken: string;
  expiresAt: string;
}

function getApiBase(): string {
  const base = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!base) {
    throw new Error("Bellamy server URL is not configured.");
  }
  return base;
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function challengeMessage(challengeId: number, nonce: string): Uint8Array {
  return new TextEncoder().encode(`${challengeId}:${nonce}`);
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {}
  return fallback;
}

async function authenticateOwner(promptMessage: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Owner sessions are not available on web.");
  }
  if (hasRecentLocalAuth()) {
    return;
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Use Passcode",
    disableDeviceFallback: false,
  });
  if (!result.success) {
    throw new Error("Authentication was cancelled.");
  }
  noteSuccessfulLocalAuth();
}

export async function ensureOwnerDeviceKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (Platform.OS === "web") {
    throw new Error("Owner device keys are not available on web.");
  }

  const [existingPrivate, existingPublic] = await Promise.all([
    SecureStore.getItemAsync(OWNER_DEVICE_PRIVATE_KEY),
    SecureStore.getItemAsync(OWNER_DEVICE_PUBLIC_KEY),
  ]);

  if (existingPrivate && existingPublic) {
    return { privateKey: existingPrivate, publicKey: existingPublic };
  }

  const privateKeyBytes = ed25519.utils.randomPrivateKey();
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  const privateKey = bytesToHex(privateKeyBytes);
  const publicKey = bytesToHex(publicKeyBytes);

  await Promise.all([
    SecureStore.setItemAsync(OWNER_DEVICE_PRIVATE_KEY, privateKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(OWNER_DEVICE_PUBLIC_KEY, publicKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  ]);

  return { privateKey, publicKey };
}

export async function getOwnerDevicePublicKey(): Promise<string> {
  const keys = await ensureOwnerDeviceKeys();
  return keys.publicKey;
}

function defaultOwnerDeviceLabel(): string {
  if (Platform.OS === "ios") return "Bellamy iPhone";
  if (Platform.OS === "android") return "Bellamy Android";
  return "Bellamy Device";
}

export async function clearOwnerSession(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(OWNER_SESSION_KEY);
}

async function readStoredOwnerSession(): Promise<OwnerSessionPayload | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(OWNER_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OwnerSessionPayload;
    if (!parsed.token || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeOwnerSession(session: OwnerSessionPayload): Promise<void> {
  await SecureStore.setItemAsync(OWNER_SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function hasValidOwnerSession(): Promise<boolean> {
  const session = await readStoredOwnerSession();
  if (!session) return false;
  return new Date(session.expiresAt).getTime() > Date.now() + SESSION_SKEW_MS;
}

async function registerInitialOwnerDevice(publicKey: string, label = defaultOwnerDeviceLabel()): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/owner-auth/register-initial-device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey, label }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Couldn't enable Agent Access on this device."));
  }
}

async function createOwnerSessionWithKeys(
  publicKey: string,
  privateKey: string,
  promptMessage: string,
): Promise<OwnerSessionPayload> {
  const apiBase = getApiBase();
  let challengeRes = await fetch(`${apiBase}/api/owner-auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey }),
  });

  if (challengeRes.status === 404) {
    await registerInitialOwnerDevice(publicKey);
    challengeRes = await fetch(`${apiBase}/api/owner-auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });
  }

  if (!challengeRes.ok) {
    throw new Error(await readErrorMessage(challengeRes, `Couldn't ${promptMessage.toLowerCase()}.`));
  }

  const challenge = await challengeRes.json() as OwnerChallengeResponse;
  const signature = bytesToHex(
    ed25519.sign(challengeMessage(challenge.challengeId, challenge.nonce), hexToBytes(privateKey)),
  );

  const verifyRes = await fetch(`${apiBase}/api/owner-auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
    }),
  });
  if (!verifyRes.ok) {
    throw new Error(await readErrorMessage(verifyRes, "Couldn't verify owner access."));
  }

  const verified = await verifyRes.json() as OwnerSessionResponse;
  const session = {
    token: verified.sessionToken,
    expiresAt: verified.expiresAt,
  };
  await writeOwnerSession(session);
  return session;
}

export async function ensureOwnerSession(promptMessage = "Confirm Agent Access"): Promise<OwnerSessionPayload> {
  const existing = await readStoredOwnerSession();
  if (existing && new Date(existing.expiresAt).getTime() > Date.now() + SESSION_SKEW_MS) {
    return existing;
  }

  await authenticateOwner(promptMessage);
  const { publicKey, privateKey } = await ensureOwnerDeviceKeys();
  return createOwnerSessionWithKeys(publicKey, privateKey, promptMessage);
}

export async function ownerFetch(
  path: string,
  init: RequestInit = {},
  options?: { promptMessage?: string; retryOnAuthFailure?: boolean },
): Promise<Response> {
  const promptMessage = options?.promptMessage ?? "Confirm Agent Access";
  const apiBase = getApiBase();
  let session = await ensureOwnerSession(promptMessage);

  const makeRequest = (sessionToken: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("X-Owner-Session", sessionToken);
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(session.token);
  if (res.status !== 401 || options?.retryOnAuthFailure === false) {
    return res;
  }

  await clearOwnerSession();
  session = await ensureOwnerSession(promptMessage);
  res = await makeRequest(session.token);
  return res;
}
