import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWallet } from "@/contexts/WalletContext";

const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const GOLD = "#c9a24d";

type Stage = "scan" | "review" | "sending" | "success" | "error";

export default function SendScreen() {
  const insets = useSafeAreaInsets();
  const { sendPayment, decodeInvoice } = useWallet();
  const [stage, setStage] = useState<Stage>("scan");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [decodedInvoice, setDecodedInvoice] = useState<{
    amountSats?: number;
    description?: string;
    isExpired: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [isDecoding, setIsDecoding] = useState(false);
  const [result, setResult] = useState<{ feeSats: number; amountSats: number } | null>(null);
  const successScale = useSharedValue(0);

  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handlePasteInvoice = async () => {
    // In real app, use Clipboard
    setStage("scan");
  };

  const handleDecodeInvoice = async (bolt11: string) => {
    if (!bolt11.trim()) return;
    setIsDecoding(true);
    setError("");
    try {
      const decoded = await decodeInvoice(bolt11.trim());
      if (decoded.isExpired) {
        setError("This invoice has expired");
        return;
      }
      setDecodedInvoice(decoded);
      setStage("review");
    } catch (e) {
      setError("Invalid invoice. Please check and try again.");
    } finally {
      setIsDecoding(false);
    }
  };

  const handleSend = async () => {
    if (!invoiceInput) return;
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStage("sending");
    try {
      const res = await sendPayment(invoiceInput.trim(), decodedInvoice?.amountSats);
      setResult(res);
      successScale.value = withSpring(1, { damping: 12 });
      setStage("success");
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStage("error");
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="send-back-button">
          <Ionicons name="arrow-back" size={22} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.title}>Send</Text>
        <View style={{ width: 44 }} />
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
          {/* Scan Stage */}
          {(stage === "scan") && (
            <Animated.View entering={FadeIn} style={{ gap: 20 }}>
              {/* QR Scanner placeholder */}
              <View style={styles.scannerBox}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
                <Text style={styles.scanningText}>SCANNING FOR QR CODE...</Text>
              </View>

              {/* Invoice Input */}
              <View style={styles.inputGroup}>
                <TextInput
                  testID="invoice-input"
                  style={styles.input}
                  placeholder="Paste a Lightning invoice (lnbc...)"
                  placeholderTextColor="#4A6080"
                  value={invoiceInput}
                  onChangeText={setInvoiceInput}
                  multiline
                  numberOfLines={3}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              {/* Action buttons */}
              <Pressable
                testID="paste-invoice-button"
                style={styles.dashedBtn}
                onPress={() => invoiceInput ? handleDecodeInvoice(invoiceInput) : null}
              >
                {isDecoding ? (
                  <ActivityIndicator color={GOLD} size="small" />
                ) : (
                  <>
                    <Ionicons name="clipboard-outline" size={18} color="#8FA3C8" />
                    <Text style={styles.dashedBtnText}>
                      {invoiceInput ? "Confirm Invoice" : "Paste Invoice"}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable testID="import-photos-button" style={styles.dashedBtn}>
                <MaterialCommunityIcons name="image-plus" size={18} color="#8FA3C8" />
                <Text style={styles.dashedBtnText}>Import from Photos</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Review Stage */}
          {stage === "review" && decodedInvoice && (
            <Animated.View entering={FadeInDown} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <MaterialCommunityIcons name="lightning-bolt" size={24} color={GOLD} />
                <Text style={styles.reviewTitle}>Confirm Payment</Text>
              </View>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Amount</Text>
                <View style={styles.reviewValueCol}>
                  <Text style={styles.reviewAmount}>
                    {decodedInvoice.amountSats
                      ? `${decodedInvoice.amountSats.toLocaleString()} sats`
                      : "Variable amount"}
                  </Text>
                </View>
              </View>

              {decodedInvoice.description ? (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Note</Text>
                  <Text style={styles.reviewValue} numberOfLines={2}>
                    {decodedInvoice.description}
                  </Text>
                </View>
              ) : null}

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Network</Text>
                <View style={styles.badge}>
                  <MaterialCommunityIcons name="lightning-bolt" size={12} color="#4A90D9" />
                  <Text style={styles.badgeText}>Lightning</Text>
                </View>
              </View>

              <Pressable
                testID="confirm-send-button"
                style={styles.confirmBtn}
                onPress={handleSend}
              >
                <LinearGradient
                  colors={["#E76F51", "#C45A3D"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmGradient}
                >
                  <Ionicons name="arrow-up" size={20} color="#FFF" />
                  <Text style={styles.confirmText}>Send Sats</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={() => setStage("scan")} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Sending Stage */}
          {stage === "sending" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={styles.stateTitle}>Firing the cannons…</Text>
              <Text style={styles.stateSubtitle}>Sending your sats</Text>
            </Animated.View>
          )}

          {/* Success Stage */}
          {stage === "success" && result && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <Animated.View style={[styles.successCircle, successStyle]}>
                <Ionicons name="checkmark" size={48} color="#2DC653" />
              </Animated.View>
              <Text style={styles.stateTitle}>Sats away!</Text>
              <Text style={styles.stateSubtitle}>
                Sent {result.amountSats.toLocaleString()} sats
              </Text>
              {result.feeSats > 0 && (
                <Text style={styles.feeNote}>Fee: {result.feeSats} sats</Text>
              )}
              <Pressable
                testID="send-done-button"
                style={styles.doneBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Error Stage */}
          {stage === "error" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <View style={styles.errorCircle}>
                <Ionicons name="close" size={48} color="#E63946" />
              </View>
              <Text style={styles.stateTitle}>Payment failed</Text>
              <Text style={styles.stateSubtitle} numberOfLines={3}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => { setStage("scan"); setError(""); }}
              >
                <Text style={styles.doneBtnText}>Try Again</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: NAVY_CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
  },
  content: {
    padding: 20,
    gap: 16,
    flexGrow: 1,
  },
  scannerBox: {
    height: 280,
    backgroundColor: "#000",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  cornerTL: { position: "absolute", top: 16, left: 16, width: 28, height: 28, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#FFF", borderRadius: 4 },
  cornerTR: { position: "absolute", top: 16, right: 16, width: 28, height: 28, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#FFF", borderRadius: 4 },
  cornerBL: { position: "absolute", bottom: 16, left: 16, width: 28, height: 28, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#FFF", borderRadius: 4 },
  cornerBR: { position: "absolute", bottom: 16, right: 16, width: 28, height: 28, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#FFF", borderRadius: 4 },
  scanningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1.5,
    position: "absolute",
    bottom: 24,
  },
  inputGroup: {
    borderWidth: 1,
    borderColor: "#1E2D50",
    borderRadius: 12,
    backgroundColor: NAVY_CARD,
    overflow: "hidden",
  },
  input: {
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#CDDAED",
    minHeight: 80,
    textAlignVertical: "top",
  },
  dashedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#1E2D50",
  },
  dashedBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "#8FA3C8",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#E63946",
    textAlign: "center",
  },
  reviewCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    padding: 24,
    gap: 20,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D50",
  },
  reviewTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  reviewLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#8FA3C8",
  },
  reviewValueCol: { flex: 1, alignItems: "flex-end" },
  reviewAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
  },
  reviewValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#CDDAED",
    flex: 1,
    textAlign: "right",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(74,144,217,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#4A90D9",
  },
  confirmBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 8,
  },
  confirmGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  confirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFF",
  },
  cancelBtn: { alignItems: "center", paddingVertical: 8 },
  cancelText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#4A6080",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: 80,
  },
  stateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
  },
  stateSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#8FA3C8",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  feeNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#4A6080",
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(45,198,83,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(45,198,83,0.3)",
  },
  errorCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(230,57,70,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(230,57,70,0.3)",
  },
  doneBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: "#172040",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  doneBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: NAVY,
  },
});
