import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useSettings } from "@/contexts/SettingsContext";
import { useWallet } from "@/contexts/WalletContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";

const CURRENCIES = ["USD", "EUR", "GBP", "NZD", "AUD", "CAD", "JPY", "CHF"];
const FIAT_LABELS: Record<string, string> = {
  USD: "USD ($)", EUR: "EUR (€)", GBP: "GBP (£)", NZD: "NZD (NZ$)",
  AUD: "AUD (A$)", CAD: "CAD (C$)", JPY: "JPY (¥)", CHF: "CHF",
};

function SectionHeader({ label, colors }: { label: string; colors: typeof MIDNIGHT }) {
  return <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{label}</Text>;
}

function SettingRow({
  icon,
  iconBg,
  iconColor,
  label,
  subtitle,
  rightElement,
  onPress,
  testID,
  isFirst,
  isLast,
  colors,
  labelColor,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  isFirst?: boolean;
  isLast?: boolean;
  colors: typeof MIDNIGHT;
  labelColor?: string;
}) {
  return (
    <Pressable
      testID={testID}
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
        isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: labelColor || colors.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {rightElement ?? (
        onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null
      )}
    </Pressable>
  );
}

function StatusPulse({ connected }: { connected: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 1000 }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={styles.statusRow}>
      <Animated.View style={[styles.statusDot, { backgroundColor: connected ? "#2DC653" : "#E63946" }, animStyle]} />
      <Text style={[styles.statusText, { color: connected ? "#2DC653" : "#E63946" }]}>
        {connected ? "Connected" : "Disconnected"}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { getSdkStatus, getNodeInfo } = useWallet();
  const [addressCopied, setAddressCopied] = useState(false);
  const [showCurrencies, setShowCurrencies] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState(settings.lightningAddress);
  const [sdkConnected, setSdkConnected] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<{ pubkey: string; blockHeight: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  useEffect(() => {
    (async () => {
      try {
        const status = await getSdkStatus();
        setSdkConnected(status.initialized && !status.error);
        if (status.initialized) {
          const info = await getNodeInfo();
          setNodeInfo({ pubkey: info.pubkey, blockHeight: info.blockHeight });
        }
      } catch (_e) {}
    })();
  }, []);

  const handleCopyAddress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(settings.lightningAddress);
    }
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const handleSaveAddress = async () => {
    if (addressInput.trim()) {
      await updateSettings({ lightningAddress: addressInput.trim() });
    }
    setEditingAddress(false);
  };

  const handleDeleteWallet = async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    await updateSettings({ onboardingDone: false, backupCompleted: false });
    router.replace("/onboarding");
  };

  const switchTrackOff = isDark ? "#243354" : colors.border;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={styles.header}>
        <Pressable testID="settings-back-button" onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Captain's Quarters</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {editingAddress ? (
          <View style={[styles.addressEditCard, { backgroundColor: colors.bgCard, borderColor: colors.gold }]}>
            <TextInput
              style={[styles.addressEditInput, { backgroundColor: colors.bgInput, color: colors.text, borderColor: colors.border }]}
              value={addressInput}
              onChangeText={setAddressInput}
              placeholder="your-address@breez.tips"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.addressEditActions}>
              <Pressable onPress={() => setEditingAddress(false)} style={styles.addressCancelBtn}>
                <Text style={[styles.addressCancelText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveAddress} style={[styles.addressSaveBtn, { backgroundColor: colors.gold }]}>
                <Text style={[styles.addressSaveText, { color: isDark ? colors.bg : "#172331" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.addressCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(201,162,77,0.2)" : "rgba(250,186,26,0.15)" }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.gold} />
            </View>
            <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={1}>
              {settings.lightningAddress}
            </Text>
            <Pressable testID="copy-lightning-address" onPress={handleCopyAddress} style={[styles.iconBtn, { backgroundColor: colors.bgElevated }]}>
              <Ionicons name={addressCopied ? "checkmark" : "copy-outline"} size={18} color={addressCopied ? colors.green : colors.textSecondary} />
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: colors.bgElevated }]} onPress={() => { setAddressInput(settings.lightningAddress); setEditingAddress(true); }}>
              <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        <SectionHeader label="SECURITY & SHIP GUARD" colors={colors} />
        <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <SettingRow
            icon="key-variant"
            iconBg={isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.15)"}
            iconColor={colors.gold}
            label="Seed Phrase"
            subtitle="Backup your booty"
            onPress={() => router.push("/backup")}
            testID="seed-phrase-row"
            isFirst
            colors={colors}
          />
          <SettingRow
            icon="shield-account"
            iconBg={isDark ? "rgba(231,111,81,0.15)" : "rgba(231,111,81,0.1)"}
            iconColor="#E76F51"
            label="Face ID Lock"
            subtitle="Require biometrics"
            isLast
            colors={colors}
            rightElement={
              <Switch
                value={settings.biometricsEnabled}
                trackColor={{ false: switchTrackOff, true: colors.gold }}
                thumbColor="#FFF"
                onValueChange={(v) => updateSettings({ biometricsEnabled: v })}
              />
            }
          />
        </View>

        <SectionHeader label="AGENT ACCESS" colors={colors} />
        <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <SettingRow
            icon="robot"
            iconBg={isDark ? "rgba(147,51,234,0.15)" : "rgba(124,58,237,0.1)"}
            iconColor={colors.purple}
            label="AI Agent Keys"
            subtitle="Let AI agents use your wallet"
            onPress={() => router.push("/agent-keys")}
            testID="agent-keys-row"
            isFirst
            isLast
            colors={colors}
          />
        </View>

        <SectionHeader label="PREFERENCES" colors={colors} />
        <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Pressable
            style={[styles.row, { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomColor: colors.border }]}
            onPress={() => setShowCurrencies(!showCurrencies)}
          >
            <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(74,144,217,0.15)" : "rgba(37,99,235,0.1)" }]}>
              <MaterialCommunityIcons name="currency-usd" size={18} color={colors.blue} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Fiat Currency</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>Select local currency</Text>
            </View>
            <View style={[styles.currencyBadge, { backgroundColor: colors.bgElevated }]}>
              <Text style={[styles.currencyText, { color: colors.textSecondary }]}>{FIAT_LABELS[settings.fiatCurrency] || settings.fiatCurrency}</Text>
              <Ionicons name={showCurrencies ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
            </View>
          </Pressable>

          {showCurrencies && (
            <View style={[styles.currencyPicker, { backgroundColor: colors.bgInput, borderBottomColor: colors.border }]}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.currencyOption, { backgroundColor: colors.bgElevated, borderColor: colors.border }, c === settings.fiatCurrency && { borderColor: colors.gold, backgroundColor: isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.1)" }]}
                  onPress={() => { updateSettings({ fiatCurrency: c }); setShowCurrencies(false); }}
                >
                  <Text style={[styles.currencyOptionText, { color: colors.textSecondary }, c === settings.fiatCurrency && { color: colors.gold }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(74,144,217,0.15)" : "rgba(37,99,235,0.1)" }]}>
              <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.blue} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Primary Display</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>Show values in</Text>
            </View>
            <View style={[styles.toggleGroup, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              {(["sats", "fiat"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.toggleOption, settings.primaryDisplay === mode && { backgroundColor: colors.bgElevated }]}
                  onPress={() => updateSettings({ primaryDisplay: mode })}
                >
                  <Text style={[styles.toggleText, { color: colors.textMuted }, settings.primaryDisplay === mode && { color: colors.text }]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <SettingRow
            icon="bird"
            iconBg={isDark ? "rgba(42,157,143,0.15)" : "rgba(22,163,74,0.1)"}
            iconColor={isDark ? "#2A9D8F" : colors.green}
            label="Annoying Parrot Squawks"
            subtitle="Sound effects"
            colors={colors}
            rightElement={
              <Switch
                value={settings.soundEffectsEnabled}
                trackColor={{ false: switchTrackOff, true: colors.gold }}
                thumbColor="#FFF"
                onValueChange={(v) => updateSettings({ soundEffectsEnabled: v })}
              />
            }
          />

          <SettingRow
            icon={isDark ? "weather-night" : "white-balance-sunny"}
            iconBg={isDark ? "rgba(74,144,217,0.15)" : "rgba(234,179,8,0.15)"}
            iconColor={isDark ? "#4A90D9" : colors.yellow}
            label="Daylight Mode"
            subtitle={isDark ? "Switch to daylight" : "Sail under the glare of daylight"}
            isLast
            colors={colors}
            rightElement={
              <Switch
                value={!settings.isDarkMode}
                trackColor={{ false: switchTrackOff, true: colors.gold }}
                thumbColor="#FFF"
                onValueChange={(v) => updateSettings({ isDarkMode: !v })}
              />
            }
          />
        </View>

        <SectionHeader label="SPARK NETWORK STATUS" colors={colors} />
        <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.row, { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(42,157,143,0.15)" : "rgba(22,163,74,0.1)" }]}>
              <MaterialCommunityIcons name="access-point-network" size={18} color={isDark ? "#2A9D8F" : colors.green} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Node Status</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {nodeInfo ? `Block: ${nodeInfo.blockHeight.toLocaleString()}` : "Checking..."}
              </Text>
            </View>
            <StatusPulse connected={sdkConnected} />
          </View>
          {nodeInfo?.pubkey ? (
            <View style={[styles.row, { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0, borderBottomColor: colors.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(74,144,217,0.15)" : "rgba(37,99,235,0.1)" }]}>
                <MaterialCommunityIcons name="key" size={18} color={colors.blue} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Node ID</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {nodeInfo.pubkey.slice(0, 16)}…{nodeInfo.pubkey.slice(-8)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.row, { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0, borderBottomColor: colors.border }]}>
              <ActivityIndicator color={colors.gold} size="small" />
            </View>
          )}
        </View>

        <SectionHeader label="DANGER ZONE" colors={colors} />
        <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {!showDeleteConfirm ? (
            <Pressable
              style={[styles.row, { borderRadius: 16, borderBottomWidth: 0, borderBottomColor: colors.border }]}
              onPress={() => setShowDeleteConfirm(true)}
              testID="delete-wallet-button"
            >
              <View style={[styles.rowIcon, { backgroundColor: "rgba(230,57,70,0.15)" }]}>
                <MaterialCommunityIcons name="skull-crossbones" size={18} color={colors.red} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.red }]}>Scuttle the Ship</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>Delete wallet data</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.red} />
            </Pressable>
          ) : (
            <View style={[styles.deleteConfirm, { borderRadius: 16, borderBottomWidth: 0 }]}>
              <Text style={styles.deleteWarning}>
                This will remove all local wallet data. Make sure you have your seed phrase backed up!
              </Text>
              <View style={styles.deleteActions}>
                <Pressable style={[styles.deleteCancelBtn, { backgroundColor: colors.bgElevated, borderColor: colors.border }]} onPress={() => setShowDeleteConfirm(false)}>
                  <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>Belay That</Text>
                </Pressable>
                <Pressable style={styles.deleteConfirmBtn} onPress={handleDeleteWallet}>
                  <Text style={styles.deleteConfirmText}>Scuttle!</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={styles.aboutSection}>
          <View style={[styles.rowIcon, { backgroundColor: isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.15)" }]}>
            <MaterialCommunityIcons name="anchor" size={18} color={colors.gold} />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Buccaneer Wallet</Text>
            <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>v1.0.0 · Mainnet · Breez SDK</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontFamily: "Chewy_400Regular", fontSize: 30 },
  content: { paddingHorizontal: 20, gap: 8 },
  sectionHeader: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 15 },
  rowSubtitle: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  addressText: { flex: 1, fontFamily: "Nunito_500Medium", fontSize: 14 },
  addressEditCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  addressEditInput: {
    borderRadius: 10,
    padding: 14,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    borderWidth: 1,
  },
  addressEditActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  addressCancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  addressCancelText: { fontFamily: "Nunito_500Medium", fontSize: 14 },
  addressSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addressSaveText: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  currencyText: { fontFamily: "Nunito_600SemiBold", fontSize: 13 },
  currencyPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
  },
  currencyOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  currencyOptionText: { fontFamily: "Nunito_500Medium", fontSize: 13 },
  toggleGroup: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
  },
  toggleOption: { paddingHorizontal: 14, paddingVertical: 8 },
  toggleText: { fontFamily: "Nunito_600SemiBold", fontSize: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: "Nunito_600SemiBold", fontSize: 12 },
  deleteConfirm: {
    padding: 20,
    gap: 16,
  },
  deleteWarning: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: "#E63946",
    lineHeight: 20,
    textAlign: "center",
  },
  deleteActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  deleteCancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  deleteCancelText: { fontFamily: "Nunito_600SemiBold", fontSize: 14 },
  deleteConfirmBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(230,57,70,0.2)",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  deleteConfirmText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#E63946" },
  aboutSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
});
