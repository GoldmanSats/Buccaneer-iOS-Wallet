import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { continueWithPasskey } from "@/utils/passkeyService";

const LAST_PASSKEY_VERIFICATION_MS_KEY = "buccaneer_last_passkey_verification_ms";

/** Require a new passkey proof at least this often for cached-seed cold starts. */
export const PASSKEY_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export async function getLastPasskeyVerificationMs(): Promise<number | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await AsyncStorage.getItem(LAST_PASSKEY_VERIFICATION_MS_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function notePasskeyVerification(at = Date.now()): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await AsyncStorage.setItem(LAST_PASSKEY_VERIFICATION_MS_KEY, String(at));
  } catch {}
}

export async function clearPasskeyVerificationRecord(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await AsyncStorage.removeItem(LAST_PASSKEY_VERIFICATION_MS_KEY);
  } catch {}
}

export function isPasskeyRefreshDue(lastMs: number | null, now = Date.now()): boolean {
  if (lastMs == null) return false;
  return now - lastMs >= PASSKEY_REFRESH_INTERVAL_MS;
}

/**
 * Run passkey PRF (open existing wallet) and record verification time.
 * Returns the mnemonic for callers that need it (e.g. recovery phrase screen).
 */
export async function passkeySensitiveUnlock(walletLabel?: string | null): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Passkey verification is not available on web.");
  }
  const result = await continueWithPasskey(walletLabel ?? undefined, { intent: "openExisting", syncLabel: false });
  await notePasskeyVerification();
  return result.mnemonic;
}

/** Passkey proof for actions that do not need the mnemonic (e.g. confirming send-max). */
export async function requirePasskeyForSensitiveAction(walletLabel?: string | null): Promise<void> {
  await passkeySensitiveUnlock(walletLabel);
}
