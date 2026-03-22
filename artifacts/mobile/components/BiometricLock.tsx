import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, AppState, Image } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/contexts/SettingsContext";

const appIconSource = require("@/assets/images/app-icon.png");

const NAVY = "#0B1426";
const NAVY2 = "#151f35";
const GOLD = "#c9a24d";

export default function BiometricLock({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [isLocked, setIsLocked] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  const authenticate = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Buccaneer Wallet",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
        setAuthFailed(false);
      } else {
        setAuthFailed(true);
      }
    } catch {
      setAuthFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!settings.biometricsEnabled || Platform.OS === "web") return;

    setIsLocked(true);
    authenticate();
  }, [settings.biometricsEnabled]);

  useEffect(() => {
    if (!settings.biometricsEnabled || Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && isLocked) {
        authenticate();
      }
      if (nextState === "background" || nextState === "inactive") {
        setIsLocked(true);
      }
    });

    return () => subscription.remove();
  }, [settings.biometricsEnabled, isLocked, authenticate]);

  if (!isLocked || !settings.biometricsEnabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[NAVY, NAVY2, "#0A1020"]} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <Image source={appIconSource} style={styles.icon} />
        <Text style={styles.title}>Wallet Locked</Text>
        <Text style={styles.subtitle}>Authenticate to continue</Text>

        {authFailed && (
          <Pressable style={styles.retryBtn} onPress={authenticate}>
            <Ionicons name="finger-print" size={28} color={GOLD} />
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  icon: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  title: {
    fontFamily: "Chewy_400Regular",
    fontSize: 28,
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#8FA3C8",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
    backgroundColor: "rgba(201,162,77,0.08)",
  },
  retryText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    color: GOLD,
  },
});
