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

function xorEncrypt(data: string, key: string): string {
  const encoded: number[] = [];
  for (let i = 0; i < data.length; i++) {
    encoded.push(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return encoded.map((c) => c.toString(16).padStart(2, "0")).join("");
}

function xorDecrypt(hex: string, key: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes.map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
}

const ENCRYPT_KEY = "buccaneer-icloud-backup-key-2024";

async function getICloudPath(): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const RNFS = require("react-native-fs");
    const icloudPath = RNFS.DocumentDirectoryPath;
    if (!icloudPath) return null;
    return icloudPath;
  } catch {
    return null;
  }
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

    if (Platform.OS === "ios") {
      try {
        const RNFS = require("react-native-fs");
        const encrypted = xorEncrypt(JSON.stringify(backup), ENCRYPT_KEY);
        const backupDir = `${RNFS.DocumentDirectoryPath}`;
        const backupPath = `${backupDir}/${ICLOUD_BACKUP_FILENAME}`;
        await RNFS.writeFile(backupPath, encrypted, "utf8");
        console.log("[iCloud] Backup saved to Documents:", backupPath);
      } catch (err: any) {
        console.warn("[iCloud] Could not write iCloud backup:", err?.message);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function checkForBackup(): Promise<WalletBackup | null> {
  if (Platform.OS === "web") return null;

  try {
    const raw = await SecureStore.getItemAsync(BACKUP_KEY);
    if (raw) {
      const backup = JSON.parse(raw) as WalletBackup;
      if (backup.seedWords && backup.seedWords.length >= 12) return backup;
    }
  } catch {}

  return null;
}

export async function checkForICloudBackup(): Promise<WalletBackup | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const RNFS = require("react-native-fs");
    const backupPath = `${RNFS.DocumentDirectoryPath}/${ICLOUD_BACKUP_FILENAME}`;
    const exists = await RNFS.exists(backupPath);
    if (!exists) {
      console.log("[iCloud] No backup file found at:", backupPath);
      return null;
    }
    const encrypted = await RNFS.readFile(backupPath, "utf8");
    const decrypted = xorDecrypt(encrypted, ENCRYPT_KEY);
    const backup = JSON.parse(decrypted) as WalletBackup;
    if (!backup.seedWords || backup.seedWords.length < 12) return null;
    console.log("[iCloud] Found backup from:", backup.backedUpAt);
    return backup;
  } catch (err: any) {
    console.warn("[iCloud] Error reading backup:", err?.message);
    return null;
  }
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
