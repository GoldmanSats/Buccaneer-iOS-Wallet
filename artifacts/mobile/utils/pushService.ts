import { Platform } from "react-native";
import { walletAgentFetch, hasStoredWalletAgentIdentity } from "@/utils/walletAgentAccess";

let registeredToken: string | null = null;

type NotificationsModule = {
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getDevicePushTokenAsync: () => Promise<{ data: string }>;
};

let Notifications: NotificationsModule | null = null;

try {
  Notifications = require("expo-notifications") as NotificationsModule;
} catch (err) {
  console.warn("[PushService] Notifications native module unavailable; push registration disabled.", err);
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!(await hasStoredWalletAgentIdentity())) return null;
  if (!Notifications) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("[PushService] Push notification permission not granted");
      return null;
    }

    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data as string;

    if (token === registeredToken) return token;

    await walletAgentFetch("/api/agent-access/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushToken: token, platform: Platform.OS }),
    }, {
      requireLocalAuth: false,
      retryOnAuthFailure: true,
    });

    registeredToken = token;
    console.log("[PushService] Push token registered with server");
    return token;
  } catch (error) {
    console.warn("[PushService] Failed to register push token:", error);
    return null;
  }
}
