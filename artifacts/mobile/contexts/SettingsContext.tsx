import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SETTINGS_STORAGE_KEY, type WalletMode } from "@/constants/walletMetadata";

interface Settings {
  fiatCurrency: string;
  primaryDisplay: "sats" | "fiat";
  soundEffectsEnabled: boolean;
  backupCompleted: boolean;
  lightningAddress: string;
  isDarkMode: boolean;
  onboardingDone: boolean;
  balanceHidden: boolean;
  biometricsEnabled: boolean;
  walletMode: WalletMode;
  walletLabel: string | null;
}

interface SettingsContextValue {
  settings: Settings;
  isLoading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  toggleDisplayMode: () => Promise<void>;
  toggleBalanceHidden: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const DEFAULT_SETTINGS: Settings = {
  fiatCurrency: "USD",
  primaryDisplay: "sats",
  soundEffectsEnabled: true,
  backupCompleted: false,
  lightningAddress: "",
  isDarkMode: true,
  onboardingDone: false,
  balanceHidden: false,
  biometricsEnabled: false,
  walletMode: null,
  walletLabel: null,
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      } catch (e) {
        console.error("Settings load error:", e);
      } finally {
        setIsLoading(false);
      }

      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/settings`);
        if (res.ok) {
          const serverSettings = await res.json();
          setSettings((prev) => ({
            ...prev,
            fiatCurrency: serverSettings.fiatCurrency ?? prev.fiatCurrency,
            primaryDisplay: serverSettings.primaryDisplay ?? prev.primaryDisplay,
            soundEffectsEnabled: serverSettings.soundEffectsEnabled ?? prev.soundEffectsEnabled,
            backupCompleted: serverSettings.backupCompleted ?? prev.backupCompleted,
            lightningAddress: serverSettings.lightningAddress ?? prev.lightningAddress,
          }));
        }
      } catch (_e) {}
    })();
  }, []);

  const updateSettings = async (updates: Partial<Settings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));

    try {
      await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (_e) {}
  };

  const toggleDisplayMode = async () => {
    await updateSettings({ primaryDisplay: settings.primaryDisplay === "sats" ? "fiat" : "sats" });
  };

  const toggleBalanceHidden = async () => {
    await updateSettings({ balanceHidden: !settings.balanceHidden });
  };

  const value = useMemo(
    () => ({ settings, isLoading, updateSettings, toggleDisplayMode, toggleBalanceHidden }),
    [settings, isLoading]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
