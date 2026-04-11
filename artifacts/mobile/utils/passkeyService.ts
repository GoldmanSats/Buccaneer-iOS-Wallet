import { Platform } from "react-native";
import Constants from "expo-constants";
import { Passkey as RNPasskey } from "react-native-passkey";

const configuredRpId =
  (Constants.expoConfig?.extra as { passkeyRpId?: string } | undefined)?.passkeyRpId;
const RP_ID = configuredRpId || "bellamywallet.com";

let passkeyCredentialId: string | null = null;

type PasskeyFlowOptions = {
  allowCredentialCreation?: boolean;
  syncLabel?: boolean;
};

function getPasskeyApi() {
  const api = RNPasskey as any;
  return {
    create: Platform.OS === "ios" && typeof api.createPlatformKey === "function"
      ? api.createPlatformKey.bind(api)
      : api.create.bind(api),
    get: Platform.OS === "ios" && typeof api.getPlatformKey === "function"
      ? api.getPlatformKey.bind(api)
      : api.get.bind(api),
  };
}

function normalizePasskeyError(error: any): Error {
  const rawMessage = error?.message || String(error || "");
  const lower = rawMessage.toLowerCase();

  if (lower.includes("cancel") || lower.includes("abort")) {
    return new Error("Face ID wallet setup was cancelled.");
  }

  if (lower.includes("no credentials were returned")) {
    return new Error("Face ID could not access or create your wallet on this device. Please try again.");
  }

  if (lower.includes("prf")) {
    return new Error("This device could not complete secure Face ID key derivation. Please try again or use your recovery phrase.");
  }

  return new Error(rawMessage || "Face ID wallet setup failed.");
}

function shouldCreateCredential(error: any): boolean {
  const rawMessage = error?.message || String(error || "");
  const lower = rawMessage.toLowerCase();
  return lower.includes("no credentials");
}

function rememberCredentialId(result: any): void {
  if (result?.id && typeof result.id === "string") {
    passkeyCredentialId = result.id;
  }
}

function buildGetRequest(saltBytes: Uint8Array) {
  return {
    rpId: RP_ID,
    challenge: randomChallenge(),
    ...(passkeyCredentialId
      ? {
          allowCredentials: [{ id: passkeyCredentialId, type: "public-key" as const }],
        }
      : {}),
    extensions: {
      prf: {
        eval: { first: saltBytes },
      },
    },
  };
}

function buildCreateRequest(saltBytes?: Uint8Array) {
  return {
    rp: { id: RP_ID, name: "Bellamy Wallet" },
    user: {
      id: randomUserId(),
      name: "wallet-user",
      displayName: "Bellamy Wallet User",
    },
    challenge: randomChallenge(),
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    extensions: saltBytes
      ? {
          prf: {
            eval: { first: saltBytes },
          },
        }
      : { prf: {} },
  };
}

function readPrfResult(result: any): ArrayBuffer | null {
  const prfResult = result?.clientExtensionResults?.prf?.results?.first;
  if (!prfResult) return null;
  if (prfResult instanceof ArrayBuffer) return prfResult;
  if (typeof prfResult === "string") return base64ToArrayBuffer(prfResult);
  if (prfResult.buffer) return prfResult.buffer;
  throw new Error("Unexpected PRF output format");
}

async function getOrCreateCredentialWithPrf(
  saltBytes: Uint8Array,
  allowCredentialCreation: boolean
): Promise<{ result: any; created: boolean }> {
  const passkeyApi = getPasskeyApi();

  try {
    const result = await passkeyApi.get(buildGetRequest(saltBytes));
    rememberCredentialId(result);
    return { result, created: false };
  } catch (error) {
    if (!allowCredentialCreation || !shouldCreateCredential(error)) {
      throw error;
    }

    const result = await passkeyApi.create(buildCreateRequest(saltBytes));
    rememberCredentialId(result);
    return { result, created: true };
  }
}

function randomChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return uint8ToBase64url(bytes);
}

function randomUserId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return uint8ToBase64url(bytes);
}

function prfSaltBytes(salt: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(salt);
}

function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalised = base64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function extractMnemonic(seed: any): string {
  if (seed.tag === "Mnemonic") {
    const mnemonic = seed.inner?.mnemonic;
    if (!mnemonic || typeof mnemonic !== "string" || mnemonic.split(" ").length < 12) {
      throw new Error("Invalid mnemonic derived from passkey");
    }
    return mnemonic;
  }
  throw new Error("Passkey returned non-mnemonic seed type");
}

export function createPrfProvider(options?: PasskeyFlowOptions) {
  const passkeyApi = getPasskeyApi();
  const allowCredentialCreation = options?.allowCredentialCreation ?? false;

  return {
    async derivePrfSeed(salt: string): Promise<ArrayBuffer> {
      try {
        const saltBytes = prfSaltBytes(salt);
        const { result, created } = await getOrCreateCredentialWithPrf(
          saltBytes,
          allowCredentialCreation
        );

        const directPrfResult = readPrfResult(result);
        if (directPrfResult) {
          return directPrfResult;
        }

        if (!created) {
          throw new Error("PRF output not available. Your device may not support passkey key derivation.");
        }

        // If registration succeeded but did not return PRF output, retry once
        // against the newly created credential.
        const fallbackResult = await passkeyApi.get(buildGetRequest(saltBytes));
        rememberCredentialId(fallbackResult);
        const fallbackPrfResult = readPrfResult(fallbackResult);
        if (!fallbackPrfResult) {
          throw new Error("PRF output not available. Your device may not support passkey key derivation.");
        }

        return fallbackPrfResult;
      } catch (error: any) {
        throw normalizePasskeyError(error);
      }
    },

    async isPrfAvailable(): Promise<boolean> {
      if (Platform.OS === "web") return false;
      try {
        await this.derivePrfSeed("bellamy-passkey-availability");
        return true;
      } catch {
        return false;
      }
    },
  };
}

export async function isPasskeyAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const supported = RNPasskey.isSupported();
    return supported;
  } catch {
    return false;
  }
}

export async function continueWithPasskey(
  preferredLabel?: string,
  options?: PasskeyFlowOptions
): Promise<{
  mnemonic: string;
  label: string;
  labels: string[];
  restored: boolean;
}> {
  const allowCredentialCreation = options?.allowCredentialCreation ?? false;
  const syncLabel = options?.syncLabel ?? true;
  const provider = createPrfProvider({ allowCredentialCreation });

  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const passkey = new breez.Passkey(provider, undefined);
  const targetLabel = preferredLabel ?? undefined;
  const wallet = await passkey.getWallet(targetLabel);
  const mnemonic = extractMnemonic(wallet.seed);

  if (syncLabel) {
    try {
      await passkey.storeLabel(wallet.label);
    } catch {}
  }

  const restored = targetLabel !== undefined || !allowCredentialCreation;
  return { mnemonic, label: wallet.label, labels: targetLabel ? [targetLabel] : [], restored };
}

export async function createWalletWithPasskey(label?: string): Promise<{
  mnemonic: string;
  label: string;
}> {
  const result = await continueWithPasskey(label, { allowCredentialCreation: true });
  return { mnemonic: result.mnemonic, label: result.label };
}

export async function restoreWalletWithPasskey(label?: string): Promise<{
  mnemonic: string;
  label: string;
  labels: string[];
}> {
  const result = await continueWithPasskey(label, { allowCredentialCreation: false });
  return { mnemonic: result.mnemonic, label: result.label, labels: result.labels };
}

export async function exportMnemonicFromPasskey(label?: string): Promise<string> {
  const result = await continueWithPasskey(label, { allowCredentialCreation: false });
  return result.mnemonic;
}
