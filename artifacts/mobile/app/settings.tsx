import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
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

function StatusPulse({ connected, checking }: { connected: boolean; checking: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (connected) {
      opacity.value = withRepeat(withTiming(0.3, { duration: 1000 }), -1, true);
    }
  }, [connected]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (checking) {
    return (
      <View style={s.statusRow}>
        <ActivityIndicator size="small" color="#EAB308" />
        <Text style={[s.statusLabel, { color: "#EAB308" }]}>CHECKING</Text>
      </View>
    );
  }

  return (
    <View style={s.statusRow}>
      <Animated.View style={[s.statusDot, { backgroundColor: connected ? "#2DC653" : "#E63946" }, connected && animStyle]} />
      <Text style={[s.statusLabel, { color: connected ? "#2DC653" : "#E63946" }]}>
        {connected ? "ONLINE" : "OFFLINE"}
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
  const [addressInput, setAddressInput] = useState(settings.lightningAddress.replace(/@breez\.tips$/, ""));
  const [sdkConnected, setSdkConnected] = useState(false);
  const [sdkChecking, setSdkChecking] = useState(true);
  const [nodeInfo, setNodeInfo] = useState<{ pubkey: string; blockHeight: number; balanceSats: number } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sparkExpanded, setSparkExpanded] = useState(false);

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
          setNodeInfo({ pubkey: info.pubkey, blockHeight: info.blockHeight, balanceSats: info.balanceSat ?? 0 });
        }
      } catch (_e) {}
      setSdkChecking(false);
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
    const local = addressInput.trim().replace(/@breez\.tips$/, "");
    if (local) {
      await updateSettings({ lightningAddress: `${local}@breez.tips` });
    }
    setEditingAddress(false);
  };

  const handleDeleteWallet = async () => {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setShowDeleteModal(false);
    await updateSettings({ onboardingDone: false, backupCompleted: false });
    router.replace("/onboarding");
  };

  const switchTrackOff = isDark ? "#243354" : colors.border;
  const cardBorder = colors.border + "80";

  const rowSeparator = { borderBottomWidth: 1, borderBottomColor: colors.border + "80" } as const;

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={[s.header, { paddingTop: topPad > 0 ? topPad : 56 }]}>
        <Pressable testID="settings-back-button" onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.bgCard + "CC", borderColor: colors.border + "60" }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text + "B3"} />
        </Pressable>
        <Text style={[s.title, { color: colors.text }]}>Captain's Quarters</Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: bottomPad + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {editingAddress ? (
          <Animated.View entering={FadeInDown.duration(200)} style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.gold, marginBottom: 6 }]}>
            <View style={[s.addressEditInputWrap, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              <TextInput
                style={[s.addressEditInput, { color: colors.text }]}
                value={addressInput}
                onChangeText={setAddressInput}
                placeholder="your-address"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <Text style={[s.addressSuffix, { color: colors.textMuted }]}>@breez.tips</Text>
            </View>
            <View style={s.addressEditActions}>
              <Pressable onPress={() => setEditingAddress(false)} style={[s.addrCancelBtn, { backgroundColor: colors.bgElevated }]}>
                <Text style={[s.addrCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveAddress} style={[s.addrSaveBtn, { backgroundColor: colors.gold }]}>
                <Text style={[s.addrSaveText, { color: isDark ? colors.bg : "#172331" }]}>Save</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.duration(300)} style={[s.card, s.addressCard, { backgroundColor: colors.bgCard, borderColor: cardBorder, marginBottom: 6 }]}>
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(201,162,77,0.2)" : "rgba(250,186,26,0.15)" }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={20} color={colors.gold} />
            </View>
            <Text style={[s.addressText, { color: colors.text }]} numberOfLines={1}>
              {settings.lightningAddress}
            </Text>
            <Pressable testID="copy-lightning-address" onPress={handleCopyAddress} style={[s.smallCircleBtn, { backgroundColor: colors.bgElevated }]}>
              <Ionicons name={addressCopied ? "checkmark" : "copy-outline"} size={16} color={addressCopied ? colors.green : colors.textSecondary} />
            </Pressable>
            <Pressable style={[s.smallCircleBtn, { backgroundColor: colors.bgElevated }]} onPress={() => { setAddressInput(settings.lightningAddress.replace(/@breez\.tips$/, "")); setEditingAddress(true); }}>
              <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          </Animated.View>
        )}

        <Text style={[s.sectionHeader, { color: colors.textMuted }]}>SECURITY & SHIP GUARD</Text>
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: cardBorder }]}>
          <Pressable
            testID="seed-phrase-row"
            style={({ pressed }) => [s.row, rowSeparator, pressed && { backgroundColor: colors.bgElevated + "50" }]}
            onPress={() => router.push("/backup")}
          >
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.15)" }]}>
              <MaterialCommunityIcons name="key-variant" size={20} color={colors.gold} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Seed Phrase</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Backup your booty</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>

          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(231,111,81,0.15)" : "rgba(231,111,81,0.1)" }]}>
              <MaterialCommunityIcons name="shield-account" size={20} color="#E76F51" />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Face ID Lock</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Require biometrics</Text>
            </View>
            <Switch
              value={settings.biometricsEnabled}
              trackColor={{ false: switchTrackOff, true: colors.gold }}
              thumbColor="#FFF"
              onValueChange={(v) => updateSettings({ biometricsEnabled: v })}
            />
          </View>
        </View>

        <Text style={[s.sectionHeader, { color: colors.textMuted }]}>AGENT ACCESS</Text>
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: cardBorder }]}>
          <Pressable
            testID="agent-keys-row"
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.bgElevated + "50" }]}
            onPress={() => router.push("/agent-keys")}
          >
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(147,51,234,0.15)" : "rgba(124,58,237,0.1)" }]}>
              <MaterialCommunityIcons name="robot" size={20} color={colors.purple} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>AI Agent Keys</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Let AI agents use your wallet</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={[s.sectionHeader, { color: colors.textMuted }]}>PREFERENCES</Text>
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: cardBorder }]}>
          <Pressable
            style={({ pressed }) => [s.row, rowSeparator, pressed && { backgroundColor: colors.bgElevated + "50" }]}
            onPress={() => setShowCurrencies(!showCurrencies)}
          >
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.15)" }]}>
              <MaterialCommunityIcons name="currency-usd" size={20} color={colors.gold} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Fiat Currency</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Select local currency</Text>
            </View>
            <View style={[s.pillSelect, { backgroundColor: colors.bgElevated }]}>
              <Text style={[s.pillText, { color: colors.textSecondary }]}>{FIAT_LABELS[settings.fiatCurrency] || settings.fiatCurrency}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            </View>
          </Pressable>

          {showCurrencies && (
            <View style={[s.currencyPicker, { backgroundColor: colors.bgInput + "50", borderBottomWidth: 1, borderBottomColor: colors.border + "80" }]}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    s.currencyChip,
                    { backgroundColor: colors.bgElevated, borderColor: colors.border },
                    c === settings.fiatCurrency && { borderColor: colors.gold, backgroundColor: isDark ? "rgba(201,162,77,0.15)" : "rgba(250,186,26,0.1)" },
                  ]}
                  onPress={() => { updateSettings({ fiatCurrency: c }); setShowCurrencies(false); }}
                >
                  <Text style={[s.currencyChipText, { color: colors.textSecondary }, c === settings.fiatCurrency && { color: colors.gold }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={[s.row, rowSeparator]}>
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(201,162,77,0.10)" : "rgba(250,186,26,0.10)" }]}>
              <MaterialCommunityIcons name="circle-multiple-outline" size={20} color={isDark ? colors.goldBright : colors.goldDark} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Primary Display</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Show values in</Text>
            </View>
            <View style={[s.segmented, { backgroundColor: colors.bgElevated }]}>
              {(["sats", "fiat"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={[s.segOption, settings.primaryDisplay === mode && [s.segActive, { backgroundColor: colors.bgCard, shadowColor: "#000" }]]}
                  onPress={() => updateSettings({ primaryDisplay: mode })}
                >
                  <Text style={[s.segText, { color: colors.textMuted }, settings.primaryDisplay === mode && { color: colors.text }]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[s.row, rowSeparator]}>
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)" }]}>
              <Ionicons name="notifications-outline" size={20} color={colors.blue} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Annoying Parrot Squawks</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Be notified of incoming transactions</Text>
            </View>
            <Switch
              value={settings.soundEffectsEnabled}
              trackColor={{ false: switchTrackOff, true: colors.gold }}
              thumbColor="#FFF"
              onValueChange={(v) => updateSettings({ soundEffectsEnabled: v })}
            />
          </View>

          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.1)" }]}>
              <Ionicons name={isDark ? "moon-outline" : "sunny-outline"} size={20} color={isDark ? "#6366F1" : "#EAB308"} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Daytime Mode</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Sail under the glare of daylight</Text>
            </View>
            <Switch
              value={!settings.isDarkMode}
              trackColor={{ false: switchTrackOff, true: colors.gold }}
              thumbColor="#FFF"
              onValueChange={(v) => updateSettings({ isDarkMode: !v })}
            />
          </View>
        </View>

        <Text style={[s.sectionHeader, { color: colors.textMuted }]}>ABOUT THE VOYAGE</Text>
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: cardBorder }]}>
          <Pressable
            style={({ pressed }) => [s.row, rowSeparator, pressed && { backgroundColor: colors.bgElevated + "50" }]}
            onPress={() => setSparkExpanded(!sparkExpanded)}
          >
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(147,51,234,0.15)" : "rgba(124,58,237,0.1)" }]}>
              <MaterialCommunityIcons name="creation" size={20} color={colors.purple} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Spark Network Status</Text>
            </View>
            <StatusPulse connected={sdkConnected} checking={sdkChecking} />
          </Pressable>

          {sparkExpanded && (
            <View style={[s.expandedPanel, { backgroundColor: colors.bgElevated + "30" }]}>
              {nodeInfo ? (
                <>
                  <View style={s.kvRow}>
                    <Text style={[s.kvKey, { color: colors.textMuted }]}>Balance</Text>
                    <Text style={[s.kvVal, { color: colors.textSecondary }]}>{nodeInfo.balanceSats.toLocaleString()} sats</Text>
                  </View>
                  <View style={s.kvRow}>
                    <Text style={[s.kvKey, { color: colors.textMuted }]}>Node ID</Text>
                    <Text style={[s.kvVal, { color: colors.textSecondary }]}>Nodeless</Text>
                  </View>
                  <View style={s.kvRow}>
                    <Text style={[s.kvKey, { color: colors.textMuted }]}>Backend</Text>
                    <Text style={[s.kvVal, { color: colors.textSecondary }]}>Breez Spark SDK</Text>
                  </View>
                  <View style={s.kvRow}>
                    <Text style={[s.kvKey, { color: colors.textMuted }]}>Network</Text>
                    <Text style={[s.kvVal, { color: colors.textSecondary }]}>Mainnet</Text>
                  </View>
                </>
              ) : (
                <ActivityIndicator color={colors.gold} size="small" />
              )}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.row, rowSeparator, pressed && { backgroundColor: colors.bgElevated + "50" }]}
            onPress={() => Linking.openURL("https://buccaneer.dev/terms")}
          >
            <View style={[s.iconBox, { backgroundColor: isDark ? "rgba(107,114,128,0.15)" : "rgba(107,114,128,0.1)" }]}>
              <Ionicons name="book-outline" size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Pirate's Code (TOS)</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textMuted} />
          </Pressable>

          <View style={[s.versionRow, { backgroundColor: colors.bgElevated + "50" }]}>
            <Text style={[s.versionText, { color: colors.textMuted }]}>v1.0.0 "Blackbeard"</Text>
          </View>
        </View>

        <Text style={[s.sectionHeader, { color: colors.textMuted }]}>DANGER ZONE</Text>
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: "rgba(239,68,68,0.2)" }]}>
          <Pressable
            testID="delete-wallet-button"
            style={({ pressed }) => [s.row, pressed && { backgroundColor: "rgba(239,68,68,0.05)" }]}
            onPress={() => setShowDeleteModal(true)}
          >
            <View style={[s.iconBox, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.red }]}>Delete Wallet</Text>
              <Text style={[s.rowSub, { color: colors.red + "99" }]}>Wipe wallet and return to setup</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={s.modalIconCircle}>
              <Ionicons name="warning-outline" size={32} color="#EF4444" />
            </View>
            <Text style={[s.modalTitle, { color: colors.text }]}>Abandon Ship?</Text>
            <Text style={[s.modalDesc, { color: colors.textMuted }]}>
              This will erase all wallet data from this device. This action cannot be undone.
            </Text>
            <Text style={s.modalBoldWarning}>
              If you haven't backed up your seed phrase, you will lose your funds forever.
            </Text>
            <Pressable style={s.modalDeleteBtn} onPress={handleDeleteWallet}>
              <Text style={s.modalDeleteText}>Delete My Wallet</Text>
            </Pressable>
            <Pressable style={[s.modalCancelBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setShowDeleteModal(false)}>
              <Text style={[s.modalCancelText, { color: colors.text }]}>Actually, on second thought...</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
    zIndex: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontFamily: "Chewy_400Regular", fontSize: 28 },
  content: { paddingHorizontal: 24 },
  sectionHeader: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    marginLeft: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  card: {
    borderRadius: 32,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  rowSub: { fontFamily: "Nunito_400Regular", fontSize: 12 },

  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  addressText: { flex: 1, fontFamily: "Nunito_700Bold", fontSize: 15, marginLeft: 4 },
  smallCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  addressEditInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    margin: 16,
    marginBottom: 0,
  },
  addressEditInput: {
    flex: 1,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    paddingVertical: 12,
  },
  addressSuffix: { fontFamily: "Nunito_400Regular", fontSize: 14 },
  addressEditActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    padding: 16,
    paddingTop: 12,
  },
  addrCancelBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  addrCancelText: { fontFamily: "Nunito_600SemiBold", fontSize: 14 },
  addrSaveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  addrSaveText: { fontFamily: "Nunito_700Bold", fontSize: 14 },

  pillSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  currencyPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center" as const,
    gap: 8,
    padding: 16,
  },
  currencyChip: {
    width: 70,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  currencyChipText: { fontFamily: "Nunito_600SemiBold", fontSize: 13 },

  segmented: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 4,
  },
  segOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  segActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  segText: { fontFamily: "Nunito_700Bold", fontSize: 12 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: "Nunito_700Bold", fontSize: 12 },

  expandedPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kvKey: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  kvVal: { fontFamily: "Nunito_600SemiBold", fontSize: 12, flexShrink: 1 },

  versionRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  versionText: { fontFamily: "Nunito_700Bold", fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 384,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239,68,68,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontFamily: "Chewy_400Regular", fontSize: 24, marginBottom: 8 },
  modalDesc: { fontFamily: "Nunito_400Regular", fontSize: 14, textAlign: "center", marginBottom: 12 },
  modalBoldWarning: {
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 20,
  },
  modalDeleteBtn: {
    width: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  modalDeleteText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFFFFF" },
  modalCancelBtn: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
});
