import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BACKUP_KEY = "buccaneer_wallet_backup";
const BACKUP_TIMESTAMP_KEY = "buccaneer_wallet_backup_ts";
const ICLOUD_BACKUP_FILENAME = "buccaneer-wallet-backup.enc";

export interface WalletBackup {
  seedWords: string[];
  backedUpAt: string;
  walletName?: string;
}

export async function saveWalletBackup(_seedWords: string[]): Promise<boolean> {
  if (Platform.OS === "web") return false;
  // Legacy seed backup storage has been disabled because it was not strong enough
  // to safely protect the wallet seed phrase.
  await deleteWalletBackup();
  return false;
}

export async function checkForBackup(): Promise<WalletBackup | null> {
  if (Platform.OS === "web") return null;
  await deleteWalletBackup();
  return null;
}

export async function checkForICloudBackup(): Promise<WalletBackup | null> {
  if (Platform.OS !== "ios") return null;
  await deleteWalletBackup();
  return null;
}

export async function deleteWalletBackup(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(BACKUP_KEY);
    await SecureStore.deleteItemAsync(BACKUP_TIMESTAMP_KEY);
  } catch {}

  if (Platform.OS === "ios") {
    try {
      const RNFS = require("react-native-fs");
      const backupPath = `${RNFS.DocumentDirectoryPath}/${ICLOUD_BACKUP_FILENAME}`;
      const exists = await RNFS.exists(backupPath);
      if (exists) await RNFS.unlink(backupPath);
    } catch {}
  }
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
