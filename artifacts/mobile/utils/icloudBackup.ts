import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BACKUP_KEY = "buccaneer_wallet_backup";
const BACKUP_TIMESTAMP_KEY = "buccaneer_wallet_backup_ts";

export interface WalletBackup {
  seedWords: string[];
  backedUpAt: string;
  walletName?: string;
}

export async function saveWalletBackup(seedWords: string[]): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const backup: WalletBackup = {
      seedWords,
      backedUpAt: new Date().toISOString(),
      walletName: "Buccaneer Wallet",
    };
    await SecureStore.setItemAsync(BACKUP_KEY, JSON.stringify(backup), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(BACKUP_TIMESTAMP_KEY, backup.backedUpAt);
    return true;
  } catch {
    return false;
  }
}

export async function checkForBackup(): Promise<WalletBackup | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await SecureStore.getItemAsync(BACKUP_KEY);
    if (!raw) return null;
    const backup = JSON.parse(raw) as WalletBackup;
    if (!backup.seedWords || backup.seedWords.length < 12) return null;
    return backup;
  } catch {
    return null;
  }
}

export async function deleteWalletBackup(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(BACKUP_KEY);
    await SecureStore.deleteItemAsync(BACKUP_TIMESTAMP_KEY);
  } catch {}
}

export function formatBackupDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown date";
  }
}
