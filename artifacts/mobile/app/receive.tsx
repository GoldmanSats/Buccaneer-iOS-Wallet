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

const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const GOLD = "#c9a24d";

const API_BASE = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

function makeQrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(data)}&color=FFFFFF&bgcolor=111D35&qzone=2`;
}

type Mode = "invoice" | "address";

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const { createInvoice } = useWallet();

  const [mode, setMode] = useState<Mode>("invoice");
  const [amountInput, setAmountInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [copied, setCopied] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleGenerate = useCallback(async () => {
    const sats = parseInt(amountInput);
    if (!sats || sats <= 0) {
      setInvoiceError("Enter an amount in sats first");
      return;
    }
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);
    setInvoiceError("");
    setInvoice(null);
    try {
      const result = await createInvoice(sats, descInput || "Buccaneer Wallet");
      setInvoice(result.bolt11);
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

  const handleShare = async (text: string) => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: text, title: "Buccaneer Wallet — Lightning Invoice" });
    } catch (_e) {}
  };

  const handleReset = () => {
    setInvoice(null);
    setAmountInput("");
    setDescInput("");
    setInvoiceError("");
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {/* Drag handle / header */}
      <View style={styles.headerHandle}>
        <View style={styles.handleBar} />
      </View>

      {/* Top Nav */}
      <View style={styles.topNav}>
        <Pressable onPress={() => router.back()} testID="receive-back-button">
          <Ionicons name="chevron-down" size={28} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.pageTitle}>Receive</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Mode tabs */}
      <View style={styles.modeTabs}>
        <Pressable
          testID="invoice-tab"
          style={[styles.modeTab, mode === "invoice" && styles.modeTabActive]}
          onPress={() => { setMode("invoice"); handleReset(); }}
        >
          <MaterialCommunityIcons
            name="lightning-bolt"
            size={15}
            color={mode === "invoice" ? "#FFFFFF" : "#4A6080"}
          />
          <Text style={[styles.modeTabText, mode === "invoice" && styles.modeTabTextActive]}>
            Invoice
          </Text>
        </Pressable>
        <Pressable
          testID="address-tab"
          style={[styles.modeTab, mode === "address" && styles.modeTabActive]}
          onPress={() => setMode("address")}
        >
          <MaterialCommunityIcons
            name="at"
            size={15}
            color={mode === "address" ? "#FFFFFF" : "#4A6080"}
          />
          <Text style={[styles.modeTabText, mode === "address" && styles.modeTabTextActive]}>
            Address
          </Text>
        </Pressable>
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

          {/* INVOICE MODE */}
          {mode === "invoice" && (
            <Animated.View entering={FadeIn} style={styles.invoiceSection}>

              {/* No invoice yet — show input form */}
              {!invoice && !isGenerating && (
                <Animated.View entering={FadeInDown} style={styles.formCard}>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountCurrency}>₿</Text>
                    <TextInput
                      testID="amount-input"
                      style={styles.amountInput}
                      placeholder="0"
                      placeholderTextColor="#243354"
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="number-pad"
                      returnKeyType="done"
                    />
                    <Text style={styles.amountUnit}>sats</Text>
                  </View>

                  <View style={styles.divider} />

                  <TextInput
                    testID="description-input"
                    style={styles.descInput}
                    placeholder="Description (optional)"
                    placeholderTextColor="#4A6080"
                    value={descInput}
                    onChangeText={setDescInput}
                    returnKeyType="done"
                  />

                  {invoiceError ? (
                    <Text style={styles.errorText}>{invoiceError}</Text>
                  ) : null}

                  <Pressable
                    testID="generate-invoice-button"
                    style={styles.generateBtn}
                    onPress={handleGenerate}
                  >
                    <LinearGradient
                      colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.generateBtnGradient}
                    >
                      <MaterialCommunityIcons name="lightning-bolt" size={18} color={NAVY} />
                      <Text style={styles.generateBtnText}>Generate Invoice</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              )}

              {/* Generating... */}
              {isGenerating && (
                <View style={styles.centerState}>
                  <ActivityIndicator color={GOLD} size="large" />
                  <Text style={styles.generatingText}>Summoning invoice from the deep…</Text>
                </View>
              )}

              {/* Invoice ready */}
              {invoice && (
                <Animated.View entering={FadeInDown} style={styles.invoiceCard}>
                  {/* QR */}
                  <View style={styles.qrCard}>
                    <Image
                      source={{ uri: makeQrUrl(invoice) }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Amount label */}
                  {amountInput && (
                    <View style={styles.invoiceAmountRow}>
                      <Text style={styles.invoiceAmountLabel}>Requesting</Text>
                      <Text style={styles.invoiceAmount}>{parseInt(amountInput).toLocaleString()} sats</Text>
                    </View>
                  )}

                  {/* Invoice string */}
                  <View style={styles.invoiceStringRow}>
                    <Text style={styles.invoiceString} numberOfLines={1}>
                      {invoice.slice(0, 20)}…{invoice.slice(-8)}
                    </Text>
                    <Pressable
                      testID="copy-invoice-button"
                      style={styles.iconBtn}
                      onPress={() => handleCopy(invoice)}
                    >
                      <Ionicons
                        name={copied ? "checkmark" : "copy-outline"}
                        size={18}
                        color={copied ? "#2DC653" : "#8FA3C8"}
                      />
                    </Pressable>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionRow}>
                    <Pressable
                      testID="share-invoice-button"
                      style={styles.goldBtn}
                      onPress={() => handleShare(invoice)}
                    >
                      <LinearGradient
                        colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.goldBtnGradient}
                      >
                        <Ionicons name="share-outline" size={18} color={NAVY} />
                        <Text style={styles.goldBtnText}>Share</Text>
                      </LinearGradient>
                    </Pressable>

                    <Pressable
                      testID="new-invoice-button"
                      style={styles.outlineBtn}
                      onPress={handleReset}
                    >
                      <Text style={styles.outlineBtnText}>New Invoice</Text>
                    </Pressable>
                  </View>

                  <View style={styles.expiryNote}>
                    <Ionicons name="time-outline" size={13} color="#4A6080" />
                    <Text style={styles.expiryText}>Expires in 1 hour</Text>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          )}

          {/* ADDRESS MODE */}
          {mode === "address" && (
            <Animated.View entering={FadeIn} style={styles.addressSection}>
              <View style={styles.warningCard}>
                <Ionicons name="warning-outline" size={16} color={GOLD} />
                <Text style={styles.warningText}>
                  Lightning addresses route payments via Breez's infrastructure.
                  Verify this address is registered to your wallet keys before sharing it.
                </Text>
              </View>

              <View style={styles.qrCard}>
                <Image
                  source={{ uri: makeQrUrl("lightning:buccaneeradiciw@breez.tips") }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>

              <Pressable
                testID="copy-address-button"
                style={styles.addressRow}
                onPress={() => handleCopy("buccaneeradiciw@breez.tips")}
              >
                <Text style={styles.address}>buccaneeradiciw@breez.tips</Text>
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={18}
                  color={copied ? "#2DC653" : GOLD}
                />
              </Pressable>
              <Text style={styles.addressLabel}>Lightning Address · tap to copy</Text>

              <View style={styles.actionRow}>
                <Pressable
                  testID="share-address-button"
                  style={styles.goldBtn}
                  onPress={() => handleShare("buccaneeradiciw@breez.tips")}
                >
                  <LinearGradient
                    colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.goldBtnGradient}
                  >
                    <Ionicons name="share-outline" size={18} color={NAVY} />
                    <Text style={styles.goldBtnText}>Share Address</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  headerHandle: { alignItems: "center", paddingVertical: 10 },
  handleBar: { width: 40, height: 4, backgroundColor: "#1E2D50", borderRadius: 2 },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  pageTitle: { fontFamily: "PirataOne_400Regular", fontSize: 30, color: "#FFFFFF" },
  modeTabs: {
    flexDirection: "row",
    marginHorizontal: 24,
    backgroundColor: "#0D1830",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  modeTabActive: { backgroundColor: "#172040" },
  modeTabText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#4A6080" },
  modeTabTextActive: { color: "#FFFFFF" },
  content: { paddingHorizontal: 24, gap: 16, flexGrow: 1 },
  invoiceSection: { gap: 16, alignItems: "center" },
  formCard: {
    width: "100%",
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 8,
  },
  amountCurrency: { fontFamily: "Inter_400Regular", fontSize: 32, color: "#4A6080" },
  amountInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 52,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -2,
  },
  amountUnit: { fontFamily: "Inter_400Regular", fontSize: 16, color: "#4A6080" },
  divider: { height: 1, backgroundColor: "#1E2D50" },
  descInput: {
    padding: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#CDDAED",
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#E63946", paddingHorizontal: 16, paddingBottom: 8 },
  generateBtn: { margin: 16, borderRadius: 14, overflow: "hidden" },
  generateBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  generateBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: NAVY },
  centerState: { alignItems: "center", paddingVertical: 60, gap: 16 },
  generatingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#8FA3C8" },
  invoiceCard: { width: "100%", alignItems: "center", gap: 16 },
  qrCard: {
    width: 280,
    height: 280,
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1E2D50",
    overflow: "hidden",
  },
  qrImage: { width: 268, height: 268, borderRadius: 12 },
  invoiceAmountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  invoiceAmountLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#8FA3C8" },
  invoiceAmount: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF" },
  invoiceStringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1E2D50",
    width: "100%",
  },
  invoiceString: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#4A6080", letterSpacing: 0.5 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", gap: 12, width: "100%" },
  goldBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  goldBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  goldBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: NAVY },
  outlineBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#1E2D50",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#8FA3C8" },
  expiryNote: { flexDirection: "row", alignItems: "center", gap: 5 },
  expiryText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#4A6080" },
  addressSection: { gap: 16, alignItems: "center" },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(201,162,77,0.1)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
    width: "100%",
  },
  warningText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#CDDAED", lineHeight: 18 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD },
  addressLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#4A6080" },
});
