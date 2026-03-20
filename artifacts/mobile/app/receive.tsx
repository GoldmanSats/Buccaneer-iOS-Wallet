import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Share,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useWallet } from "@/contexts/WalletContext";
import { useSettings } from "@/contexts/SettingsContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";

function makeQrUrl(data: string, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&color=000000&bgcolor=FFFFFF&qzone=2`;
}

type Mode = "default" | "amount" | "generated";

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const { createInvoice } = useWallet();
  const { settings } = useSettings();
  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;

  const [mode, setMode] = useState<Mode>("default");
  const [amountInput, setAmountInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const lightningAddress = settings.lightningAddress || "buccaneeradiciw@breez.tips";

  const topPad = insets.top;
  const bottomPad = insets.bottom + 16;

  const handleGenerate = useCallback(async () => {
    const sats = parseInt(amountInput);
    if (!sats || sats <= 0) {
      setInvoiceError("Enter an amount in sats");
      return;
    }
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);
    setInvoiceError("");
    setInvoice(null);
    try {
      const result = await createInvoice(sats, descInput || "Buccaneer Wallet");
      setInvoice(result.bolt11);
      setMode("generated");
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setIsGenerating(false);
    }
  }, [amountInput, descInput, createInvoice]);

  const handleCopy = async (text: string) => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAddress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(lightningAddress);
    }
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const handleShare = async (text: string) => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: text, title: "Buccaneer Wallet" });
    } catch (_e) {}
  };

  const handleReset = () => {
    setInvoice(null);
    setAmountInput("");
    setDescInput("");
    setInvoiceError("");
    setMode("default");
  };

  const qrData = invoice || `lightning:${lightningAddress}`;
  const qrSize = mode === "amount" ? 180 : 280;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={styles.headerHandle}>
        <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.pageTitle, { color: colors.text }]}>Receive</Text>

          <View style={[styles.qrContainer, { width: qrSize + 24, height: qrSize + 24 }]}>
            <Image
              source={{ uri: makeQrUrl(qrData, qrSize) }}
              style={{ width: qrSize, height: qrSize, borderRadius: 8 }}
              resizeMode="contain"
            />
            <View style={styles.qrCenterOverlay}>
              <Text style={styles.qrCenterText}>₿uccaneer</Text>
              <View style={styles.qrBadgeRow}>
                <View style={[styles.qrBadge, { backgroundColor: "#FBBF24" }]}>
                  <Text style={styles.qrBadgeText}>⚡</Text>
                </View>
                <View style={[styles.qrBadge, { backgroundColor: "#F7931A" }]}>
                  <Text style={styles.qrBadgeText}>₿</Text>
                </View>
              </View>
            </View>
          </View>

          {mode === "default" && (
            <Animated.View entering={FadeIn} style={styles.defaultSection}>
              <Pressable onPress={handleCopyAddress} style={styles.addressRow}>
                <Text style={styles.addressText}>{lightningAddress}</Text>
                <Ionicons
                  name={addressCopied ? "checkmark-circle" : "copy-outline"}
                  size={18}
                  color={addressCopied ? "#2DC653" : colors.gold}
                />
              </Pressable>
              <Text style={styles.addressLabel}>Lightning Address · tap to copy</Text>

              <View style={styles.protocolBadges}>
                <View style={[styles.protocolBadge, { backgroundColor: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.3)" }]}>
                  <Text style={{ fontSize: 12 }}>⚡</Text>
                  <Text style={[styles.protocolText, { color: "#FBBF24" }]}>Lightning</Text>
                </View>
                <Text style={styles.protocolPlus}>+</Text>
                <View style={[styles.protocolBadge, { backgroundColor: "rgba(247,147,26,0.15)", borderColor: "rgba(247,147,26,0.3)" }]}>
                  <Text style={[styles.protocolText, { color: "#F7931A", fontWeight: "700" }]}>₿</Text>
                  <Text style={[styles.protocolText, { color: "#F7931A" }]}>On-chain</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.infoText, { color: colors.textMuted }]}>Unified QR: works with any Bitcoin wallet.</Text>
              </View>

              <View style={styles.bottomButtons}>
                <Pressable
                  testID="request-amount-button"
                  style={[styles.dashedBtn, { borderColor: colors.border }]}
                  onPress={() => setMode("amount")}
                >
                  <Text style={[styles.dashedBtnText, { color: colors.textMuted }]}>Request Amount</Text>
                </Pressable>
                <Pressable
                  testID="share-button"
                  style={styles.shareBtn}
                  onPress={() => handleShare(lightningAddress)}
                >
                  <LinearGradient
                    colors={isDark ? ["#d4ad5a", "#c9a24d", "#a07c35"] : [colors.gold, colors.goldDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.shareBtnGradient}
                  >
                    <Ionicons name="share-outline" size={18} color={isDark ? "#0B1426" : "#172331"} />
                    <Text style={[styles.shareBtnText, { color: isDark ? "#0B1426" : "#172331" }]}>Share</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {mode === "amount" && (
            <Animated.View entering={FadeInDown} style={styles.amountSection}>
              <View style={[styles.amountCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.amountInputRow}>
                  <Text style={[styles.amountCurrency, { color: colors.textMuted }]}>₿</Text>
                  <TextInput
                    testID="amount-input"
                    style={[styles.amountInput, { color: colors.text }]}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted + "60"}
                    value={amountInput}
                    onChangeText={setAmountInput}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    autoFocus
                  />
                  <Text style={[styles.amountUnit, { color: colors.textMuted }]}>sats</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TextInput
                  style={[styles.descInput, { color: colors.textSecondary }]}
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={descInput}
                  onChangeText={setDescInput}
                  returnKeyType="done"
                />
              </View>

              {invoiceError ? <Text style={styles.errorText}>{invoiceError}</Text> : null}
              {isGenerating && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.gold} size="small" />
                  <Text style={[styles.loadingText, { color: colors.textMuted }]}>Generating invoice…</Text>
                </View>
              )}

              <View style={styles.bottomButtons}>
                <Pressable style={[styles.dashedBtn, { borderColor: colors.border }]} onPress={() => setMode("default")}>
                  <Text style={[styles.dashedBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="generate-invoice-button"
                  style={styles.shareBtn}
                  onPress={handleGenerate}
                >
                  <LinearGradient
                    colors={isDark ? ["#d4ad5a", "#c9a24d", "#a07c35"] : [colors.gold, colors.goldDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.shareBtnGradient}
                  >
                    <MaterialCommunityIcons name="lightning-bolt" size={18} color={isDark ? "#0B1426" : "#172331"} />
                    <Text style={[styles.shareBtnText, { color: isDark ? "#0B1426" : "#172331" }]}>Generate</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {mode === "generated" && invoice && (
            <Animated.View entering={FadeInDown} style={styles.generatedSection}>
              <View style={[styles.invoiceStringRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.invoiceString, { color: colors.textMuted }]} numberOfLines={1}>
                  {invoice.slice(0, 24)}…{invoice.slice(-8)}
                </Text>
                <Pressable
                  testID="copy-invoice-button"
                  style={styles.copyBtn}
                  onPress={() => handleCopy(invoice)}
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={16}
                    color={copied ? "#2DC653" : colors.textMuted}
                  />
                </Pressable>
              </View>

              {amountInput && (
                <Text style={[styles.invoiceAmountText, { color: colors.text }]}>
                  Requesting {parseInt(amountInput).toLocaleString()} sats
                </Text>
              )}

              <View style={styles.bottomButtons}>
                <Pressable
                  testID="copy-full-button"
                  style={[styles.dashedBtn, { borderColor: colors.border }]}
                  onPress={() => handleCopy(invoice)}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.dashedBtnText, { color: colors.textMuted }]}>Copy</Text>
                </Pressable>
                <Pressable
                  testID="share-invoice-button"
                  style={styles.shareBtn}
                  onPress={() => handleShare(invoice)}
                >
                  <LinearGradient
                    colors={isDark ? ["#d4ad5a", "#c9a24d", "#a07c35"] : [colors.gold, colors.goldDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.shareBtnGradient}
                  >
                    <Ionicons name="share-outline" size={18} color={isDark ? "#0B1426" : "#172331"} />
                    <Text style={[styles.shareBtnText, { color: isDark ? "#0B1426" : "#172331" }]}>Share</Text>
                  </LinearGradient>
                </Pressable>
              </View>

              <Pressable testID="new-invoice-button" onPress={handleReset} style={styles.newInvoiceLink}>
                <Text style={[styles.newInvoiceLinkText, { color: colors.textMuted }]}>New Invoice</Text>
              </Pressable>

              <View style={styles.expiryRow}>
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={[styles.expiryText, { color: colors.textMuted }]}>Expires in 1 hour</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerHandle: { alignItems: "center", paddingVertical: 10 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  content: { paddingHorizontal: 24, alignItems: "center" },
  pageTitle: {
    fontFamily: "Chewy_400Regular",
    fontSize: 32,
    color: "#FFFFFF",
    alignSelf: "flex-start",
    marginBottom: 20,
    marginTop: 8,
  },
  qrContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  qrCenterOverlay: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qrCenterText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: "#0B1426",
  },
  qrBadgeRow: {
    flexDirection: "row",
    gap: 3,
  },
  qrBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  qrBadgeText: { fontSize: 11 },

  defaultSection: { width: "100%", alignItems: "center", gap: 12 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressText: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: "#EAB308" },
  addressLabel: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080" },

  protocolBadges: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  protocolBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  protocolText: { fontFamily: "Nunito_600SemiBold", fontSize: 12 },
  protocolPlus: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#4A6080" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  infoText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080" },

  bottomButtons: { flexDirection: "row", gap: 12, width: "100%", marginTop: 16 },
  dashedBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#1E2D50",
  },
  dashedBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: "#8FA3C8" },
  shareBtn: { flex: 1, borderRadius: 16, overflow: "hidden" },
  shareBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  shareBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15 },

  amountSection: { width: "100%", alignItems: "center", gap: 12 },
  amountCard: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 8,
  },
  amountCurrency: { fontFamily: "Nunito_400Regular", fontSize: 32, color: "#4A6080" },
  amountInput: {
    flex: 1,
    fontFamily: "Nunito_700Bold",
    fontSize: 44,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -2,
  },
  amountUnit: { fontFamily: "Nunito_400Regular", fontSize: 16, color: "#4A6080" },
  divider: { height: 1, backgroundColor: "#1E2D50" },
  descInput: {
    padding: 16,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#CDDAED",
  },
  errorText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#E63946", textAlign: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#8FA3C8" },

  generatedSection: { width: "100%", alignItems: "center", gap: 12 },
  invoiceStringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    width: "100%",
  },
  invoiceString: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080", letterSpacing: 0.5 },
  copyBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  invoiceAmountText: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: "#FFFFFF" },
  newInvoiceLink: { paddingVertical: 8 },
  newInvoiceLinkText: { fontFamily: "Nunito_500Medium", fontSize: 14, color: "#4A6080" },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  expiryText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080" },
});
