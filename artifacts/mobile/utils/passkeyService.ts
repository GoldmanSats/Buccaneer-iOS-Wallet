import { Platform } from "react-native";
import { Passkey as RNPasskey } from "react-native-passkey";

const RP_ID = "keys.breez.technology";

let passkeyCredentialId: string | null = null;

async function ensurePasskeyCredential(): Promise<string> {
  if (passkeyCredentialId) return passkeyCredentialId;

  try {
    const result = await RNPasskey.get({
      rpId: RP_ID,
      challenge: randomChallenge(),
      extensions: { prf: { eval: { first: prfSaltBytes("probe") } } },
    });
    passkeyCredentialId = result.id;
    return result.id;
  } catch {
    const result = await RNPasskey.create({
      rp: { id: RP_ID, name: "Buccaneer Wallet" },
      user: {
        id: randomUserId(),
        name: "wallet-user",
        displayName: "Buccaneer Wallet User",
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
      extensions: { prf: {} },
    });
    passkeyCredentialId = result.id;
    return result.id;
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

export function createPrfProvider() {
  return {
    async derivePrfSeed(salt: string): Promise<ArrayBuffer> {
      const credId = await ensurePasskeyCredential();
      const saltBytes = prfSaltBytes(salt);

      const result = await RNPasskey.get({
        rpId: RP_ID,
        challenge: randomChallenge(),
        allowCredentials: [{ id: credId, type: "public-key" }],
        extensions: {
          prf: {
            eval: { first: saltBytes },
          },
        },
      });

      const prfResult =
        (result as any).clientExtensionResults?.prf?.results?.first;
      if (!prfResult) {
        throw new Error("PRF output not available. Your device may not support passkey key derivation.");
      }

      if (prfResult instanceof ArrayBuffer) return prfResult;
      if (typeof prfResult === "string") return base64ToArrayBuffer(prfResult);
      if (prfResult.buffer) return prfResult.buffer;
      throw new Error("Unexpected PRF output format");
    },

    async isPrfAvailable(): Promise<boolean> {
      if (Platform.OS === "web") return false;
      try {
        await ensurePasskeyCredential();
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

export async function createWalletWithPasskey(label?: string): Promise<{
  mnemonic: string;
  label: string;
}> {
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const provider = createPrfProvider();
  const passkey = new breez.Passkey(provider, undefined);

  const wallet = await passkey.getWallet(label ?? undefined);

  const mnemonic = extractMnemonic(wallet.seed);
  await passkey.storeLabel(wallet.label);

  return { mnemonic, label: wallet.label };
}

export async function restoreWalletWithPasskey(): Promise<{
  mnemonic: string;
  label: string;
  labels: string[];
}> {
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const provider = createPrfProvider();
  const passkey = new breez.Passkey(provider, undefined);

  const labels = await passkey.listLabels();

  const targetLabel = labels.length > 0 ? labels[0] : undefined;
  const wallet = await passkey.getWallet(targetLabel);

  const mnemonic = extractMnemonic(wallet.seed);

  return { mnemonic, label: wallet.label, labels };
}

export async function exportMnemonicFromPasskey(label?: string): Promise<string> {
  const result = await createWalletWithPasskey(label);
  return result.mnemonic;
}
