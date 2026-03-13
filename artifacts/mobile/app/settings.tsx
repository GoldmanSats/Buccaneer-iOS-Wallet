import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useSettings } from "@/contexts/SettingsContext";

const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const GOLD = "#c9a24d";
const LIGHTNING_ADDRESS = "buccaneeradiciw@breez.tips";

const CURRENCIES = ["USD", "EUR", "GBP", "NZD", "AUD", "CAD", "JPY", "CHF"];

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
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
}) {
  return (
    <Pressable
      testID={testID}
      style={[
        styles.row,
        isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
        isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightElement ?? (
        onPress ? <Ionicons name="chevron-forward" size={18} color="#4A6080" /> : null
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const [addressCopied, setAddressCopied] = useState(false);
  const [showCurrencies, setShowCurrencies] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleCopyAddress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(settings.lightningAddress || LIGHTNING_ADDRESS);
    }
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          testID="settings-back-button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.title}>Captain's Quarters</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Lightning Address Row */}
        <View style={styles.addressCard}>
          <View style={[styles.rowIcon, { backgroundColor: "rgba(201,162,77,0.2)" }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={18} color={GOLD} />
          </View>
          <Text style={styles.addressText} numberOfLines={1}>
            {settings.lightningAddress || LIGHTNING_ADDRESS}
          </Text>
          <Pressable testID="copy-lightning-address" onPress={handleCopyAddress} style={styles.iconBtn}>
            <Ionicons name={addressCopied ? "checkmark" : "copy-outline"} size={18} color={addressCopied ? "#2DC653" : "#8FA3C8"} />
          </Pressable>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="pencil-outline" size={18} color="#8FA3C8" />
          </Pressable>
        </View>

        {/* Security & Ship Guard */}
        <SectionHeader label="SECURITY & SHIP GUARD" />
        <View style={styles.group}>
          <SettingRow
            icon="key-variant"
            iconBg="rgba(201,162,77,0.15)"
            iconColor={GOLD}
            label="Seed Phrase"
            subtitle="Backup your booty"
            onPress={() => router.push("/backup")}
            testID="seed-phrase-row"
            isFirst
          />
          <SettingRow
            icon="shield-account"
            iconBg="rgba(231,111,81,0.15)"
            iconColor="#E76F51"
            label="Face ID Lock"
            subtitle="Require biometrics"
            isLast
            rightElement={
              <Switch
                value={true}
                trackColor={{ false: "#243354", true: GOLD }}
                thumbColor="#FFF"
                onValueChange={() => {}}
              />
            }
          />
        </View>

        {/* Agent Access */}
        <SectionHeader label="AGENT ACCESS" />
        <View style={styles.group}>
          <SettingRow
            icon="robot"
            iconBg="rgba(147,51,234,0.15)"
            iconColor="#9333EA"
            label="AI Agent Keys"
            subtitle="Let AI agents use your wallet"
            onPress={() => router.push("/agent-keys")}
            testID="agent-keys-row"
            isFirst
            isLast
          />
        </View>

        {/* Preferences */}
        <SectionHeader label="PREFERENCES" />
        <View style={styles.group}>
          <Pressable
            style={[styles.row, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}
            onPress={() => setShowCurrencies(!showCurrencies)}
          >
            <View style={[styles.rowIcon, { backgroundColor: "rgba(74,144,217,0.15)" }]}>
              <MaterialCommunityIcons name="currency-usd-circle" size={18} color="#4A90D9" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Fiat Currency</Text>
              <Text style={styles.rowSubtitle}>Select local currency</Text>
            </View>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyText}>{settings.fiatCurrency}</Text>
              <Ionicons name={showCurrencies ? "chevron-up" : "chevron-down"} size={14} color="#8FA3C8" />
            </View>
          </Pressable>

          {showCurrencies && (
            <View style={styles.currencyPicker}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.currencyOption, c === settings.fiatCurrency && styles.currencyOptionActive]}
                  onPress={() => {
                    updateSettings({ fiatCurrency: c });
                    setShowCurrencies(false);
                  }}
                >
                  <Text style={[styles.currencyOptionText, c === settings.fiatCurrency && { color: GOLD }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: "rgba(74,144,217,0.15)" }]}>
              <MaterialCommunityIcons name="swap-horizontal" size={18} color="#4A90D9" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Primary Display</Text>
              <Text style={styles.rowSubtitle}>Show values in</Text>
            </View>
            <View style={styles.toggleGroup}>
              {(["sats", "fiat"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.toggleOption, settings.primaryDisplay === mode && styles.toggleOptionActive]}
                  onPress={() => updateSettings({ primaryDisplay: mode })}
                >
                  <Text style={[styles.toggleText, settings.primaryDisplay === mode && styles.toggleTextActive]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <SettingRow
            icon="bird"
            iconBg="rgba(42,157,143,0.15)"
            iconColor="#2A9D8F"
            label="Annoying Parrot Squawks"
            subtitle="Sound effects"
            isLast
            rightElement={
              <Switch
                value={settings.soundEffectsEnabled}
                trackColor={{ false: "#243354", true: GOLD }}
                thumbColor="#FFF"
                onValueChange={(v) => updateSettings({ soundEffectsEnabled: v })}
              />
            }
          />
        </View>

        {/* About */}
        <SectionHeader label="ABOUT" />
        <View style={styles.group}>
          <View style={[styles.row, { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 }]}>
            <View style={[styles.rowIcon, { backgroundColor: "rgba(201,162,77,0.15)" }]}>
              <MaterialCommunityIcons name="anchor" size={18} color={GOLD} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Buccaneer Wallet</Text>
              <Text style={styles.rowSubtitle}>v1.0.0 · Mainnet · Breez SDK</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
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
    borderRadius: 12,
    backgroundColor: NAVY_CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  title: {
    fontFamily: "PirataOne_400Regular",
    fontSize: 28,
    color: "#FFFFFF",
  },
  content: { paddingHorizontal: 20, gap: 8 },
  sectionHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#4A6080",
    letterSpacing: 1.5,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  group: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E2D50",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D50",
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  rowSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#4A6080",
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#1E2D50",
    marginTop: 8,
  },
  addressText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#CDDAED",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#172040",
    alignItems: "center",
    justifyContent: "center",
  },
  currencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#172040",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  currencyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#CDDAED",
  },
  currencyPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 16,
    backgroundColor: "#0D1830",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D50",
  },
  currencyOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#172040",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  currencyOptionActive: {
    borderColor: GOLD,
    backgroundColor: "rgba(201,162,77,0.15)",
  },
  currencyOptionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#8FA3C8",
  },
  toggleGroup: {
    flexDirection: "row",
    backgroundColor: "#0D1830",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  toggleOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleOptionActive: {
    backgroundColor: "#172040",
  },
  toggleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#4A6080",
  },
  toggleTextActive: {
    color: "#FFFFFF",
  },
});
