import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { ed25519 } from "@noble/curves/ed25519";
import { mnemonicToSeedSync } from "bip39";
import { Platform } from "react-native";
import { SETTINGS_STORAGE_KEY, type WalletMode } from "@/constants/walletMetadata";
import { getSeedFromSecureStore, saveSeedToSecureStore } from "@/utils/breezService";
import { notePasskeyVerification } from "@/utils/passkeyVerificationPolicy";
import { hasRecentLocalAuth, noteSuccessfulLocalAuth } from "@/utils/localAuthState";
import { exportMnemonicFromPasskey } from "@/utils/passkeyService";

const WALLET_AGENT_PRIVATE_KEY = "bellamy_wallet_agent_private_key";
const WALLET_AGENT_PUBLIC_KEY = "bellamy_wallet_agent_public_key";
const WALLET_AGENT_SESSION_KEY = "bellamy_wallet_agent_session";
const SESSION_SKEW_MS = 15 * 1000;

interface WalletSettingsSnapshot {
  onboardingDone: boolean;
  walletMode: WalletMode;
  walletLabel: string | null;
}

interface WalletAgentChallengeResponse {
  challengeId: number;
  nonce: string;
  expiresAt: string;
}

interface WalletAgentSessionPayload {
  token: string;
  expiresAt: string;
}

interface WalletAgentSessionResponse {
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

async function readWalletSettings(): Promise<WalletSettingsSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { onboardingDone: false, walletMode: null, walletLabel: null };
    }

    const parsed = JSON.parse(raw) as Partial<WalletSettingsSnapshot>;
    return {
      onboardingDone: parsed.onboardingDone ?? false,
      walletMode: parsed.walletMode ?? null,
      walletLabel: parsed.walletLabel ?? null,
    };
  } catch {
    return { onboardingDone: false, walletMode: null, walletLabel: null };
  }
}

async function getWalletMnemonic(): Promise<{ mnemonic: string; walletMode: WalletMode; walletLabel: string | null }> {
  const settings = await readWalletSettings();
  if (!settings.onboardingDone) {
    throw new Error("Create or restore a Bellamy wallet before enabling Agent Access.");
  }

  const cached = await getSeedFromSecureStore();
  if (cached) {
    return { mnemonic: cached, walletMode: settings.walletMode, walletLabel: settings.walletLabel };
  }

  if (settings.walletMode === "passkey") {
    const mnemonic = await exportMnemonicFromPasskey(settings.walletLabel ?? undefined);
    await saveSeedToSecureStore(mnemonic);
    await notePasskeyVerification();
    return { mnemonic, walletMode: settings.walletMode, walletLabel: settings.walletLabel };
  }

  throw new Error("Bellamy couldn't find your wallet seed on this device.");
}

async function authenticateAgentAccess(promptMessage: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Per-user Agent Access is not available on web.");
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

export async function confirmWalletAgentAction(promptMessage: string): Promise<void> {
  await authenticateAgentAccess(promptMessage);
}

async function readStoredSession(): Promise<WalletAgentSessionPayload | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(WALLET_AGENT_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalletAgentSessionPayload;
    if (!parsed.token || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoredSession(session: WalletAgentSessionPayload): Promise<void> {
  await SecureStore.setItemAsync(WALLET_AGENT_SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearWalletAgentAccessLocalState(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all([
    SecureStore.deleteItemAsync(WALLET_AGENT_PRIVATE_KEY),
    SecureStore.deleteItemAsync(WALLET_AGENT_PUBLIC_KEY),
    SecureStore.deleteItemAsync(WALLET_AGENT_SESSION_KEY),
  ]);
}

export async function hasStoredWalletAgentIdentity(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(WALLET_AGENT_PRIVATE_KEY),
    SecureStore.getItemAsync(WALLET_AGENT_PUBLIC_KEY),
  ]);
  return Boolean(privateKey && publicKey);
}

export async function ensureWalletAgentIdentityKeys(): Promise<{
  publicKey: string;
  privateKey: string;
  walletMode: WalletMode;
  walletLabel: string | null;
}> {
  if (Platform.OS === "web") {
    throw new Error("Per-user Agent Access is not available on web.");
  }

  const [existingPrivate, existingPublic] = await Promise.all([
    SecureStore.getItemAsync(WALLET_AGENT_PRIVATE_KEY),
    SecureStore.getItemAsync(WALLET_AGENT_PUBLIC_KEY),
  ]);
  const settings = await readWalletSettings();

  if (existingPrivate && existingPublic) {
    return {
      privateKey: existingPrivate,
      publicKey: existingPublic,
      walletMode: settings.walletMode,
      walletLabel: settings.walletLabel,
    };
  }

  const { walletMode, walletLabel, mnemonic } = await getWalletMnemonic();
  const seed = mnemonicToSeedSync(mnemonic, "bellamy-agent-access");
  const privateKeyBytes = seed.subarray(0, 32);
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  const privateKey = bytesToHex(privateKeyBytes);
  const publicKey = bytesToHex(publicKeyBytes);

  await Promise.all([
    SecureStore.setItemAsync(WALLET_AGENT_PRIVATE_KEY, privateKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(WALLET_AGENT_PUBLIC_KEY, publicKey, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  ]);

  return { privateKey, publicKey, walletMode, walletLabel };
}

export async function hasValidWalletAgentSession(): Promise<boolean> {
  const session = await readStoredSession();
  if (!session) return false;
  return new Date(session.expiresAt).getTime() > Date.now() + SESSION_SKEW_MS;
}

async function createWalletAgentSessionWithKeys(
  publicKey: string,
  privateKey: string,
  walletMode: WalletMode,
  walletLabel: string | null,
): Promise<WalletAgentSessionPayload> {
  const apiBase = getApiBase();
  const challengeRes = await fetch(`${apiBase}/api/agent-access/session/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletPublicKey: publicKey,
      walletMode,
      walletLabel,
    }),
  });

  if (!challengeRes.ok) {
    throw new Error(await readErrorMessage(challengeRes, "Couldn't start Agent Access for this wallet."));
  }

  const challenge = await challengeRes.json() as WalletAgentChallengeResponse;
  const signature = bytesToHex(
    ed25519.sign(challengeMessage(challenge.challengeId, challenge.nonce), hexToBytes(privateKey)),
  );

  const verifyRes = await fetch(`${apiBase}/api/agent-access/session/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      walletPublicKey: publicKey,
      signature,
    }),
  });

  if (!verifyRes.ok) {
    throw new Error(await readErrorMessage(verifyRes, "Couldn't verify Agent Access for this wallet."));
  }

  const verified = await verifyRes.json() as WalletAgentSessionResponse;
  const session = {
    token: verified.sessionToken,
    expiresAt: verified.expiresAt,
  };
  await writeStoredSession(session);
  return session;
}

export async function ensureWalletAgentSession(
  promptMessage = "Confirm Agent Access",
  options?: { requireLocalAuth?: boolean },
): Promise<WalletAgentSessionPayload> {
  const existing = await readStoredSession();
  if (existing && new Date(existing.expiresAt).getTime() > Date.now() + SESSION_SKEW_MS) {
    return existing;
  }

  if (options?.requireLocalAuth !== false) {
    await authenticateAgentAccess(promptMessage);
  }

  const { publicKey, privateKey, walletMode, walletLabel } = await ensureWalletAgentIdentityKeys();
  return createWalletAgentSessionWithKeys(publicKey, privateKey, walletMode, walletLabel);
}

export async function walletAgentFetch(
  path: string,
  init: RequestInit = {},
  options?: { promptMessage?: string; retryOnAuthFailure?: boolean; requireLocalAuth?: boolean },
): Promise<Response> {
  const apiBase = getApiBase();
  let session = await ensureWalletAgentSession(
    options?.promptMessage ?? "Confirm Agent Access",
    { requireLocalAuth: options?.requireLocalAuth },
  );

  const makeRequest = (sessionToken: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("X-Wallet-Agent-Session", sessionToken);
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(session.token);
  if (res.status !== 401 || options?.retryOnAuthFailure === false) {
    return res;
  }

  await SecureStore.deleteItemAsync(WALLET_AGENT_SESSION_KEY);
  session = await ensureWalletAgentSession(
    options?.promptMessage ?? "Confirm Agent Access",
    { requireLocalAuth: options?.requireLocalAuth },
  );
  return makeRequest(session.token);
}

export async function ensureWalletAgentEnabled(promptMessage = "Enable Agent Access"): Promise<void> {
  await ensureWalletAgentSession(promptMessage, { requireLocalAuth: true });
}
