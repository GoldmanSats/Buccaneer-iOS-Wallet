import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useWallet } from "@/contexts/WalletContext";

const NAVY = "#0B1426";
const NAVY_CARD = "#151f35";
const GOLD = "#c9a24d";

type Stage = "scan" | "paste" | "review" | "sending" | "success" | "error";

export default function SendScreen() {
  const insets = useSafeAreaInsets();
  const { sendPayment, decodeInvoice, parseInput } = useWallet();
  const [stage, setStage] = useState<Stage>("scan");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [decodedInvoice, setDecodedInvoice] = useState<{
    amountSats?: number;
    description?: string;
    isExpired: boolean;
    type?: string;
    address?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [isDecoding, setIsDecoding] = useState(false);
  const [result, setResult] = useState<{ feeSats: number; amountSats: number } | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const successScale = useSharedValue(0);

  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const topPad = insets.top;
  const bottomPad = insets.bottom + 16;

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const normalizeQrData = (raw: string): string => {
    let s = raw.trim();
    if (/^lightning:/i.test(s)) s = s.replace(/^lightning:/i, "");
    if (/^bitcoin:/i.test(s)) {
      const qIdx = s.indexOf("?");
      if (qIdx > -1) {
        const params = new URLSearchParams(s.slice(qIdx + 1));
        const lnParam = params.get("lightning") || params.get("LIGHTNING");
        if (lnParam) return lnParam;
      }
    }
    return s;
  };

  const handleBarCodeScanned = async (data: string) => {
    if (!data || isDecoding) return;
    setCameraActive(false);
    const cleaned = normalizeQrData(data);
    setInvoiceInput(cleaned);
    await handleDecodeInput(cleaned);
  };

  const handlePasteInvoice = () => {
    setCameraActive(false);
    setStage("paste");
    Clipboard.getStringAsync()
      .then((text) => {
        if (text) setInvoiceInput((prev) => prev || text);
      })
      .catch(() => {});
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        setError("QR code detection from images requires native processing. Please paste the invoice instead.");
      }
    } catch (_e) {}
  };

  const handleDecodeInput = async (input: string) => {
    if (!input.trim()) return;
    setIsDecoding(true);
    setError("");
    try {
      const parsed = await parseInput(input.trim());

      if (parsed.type === "bolt11" && parsed.invoice) {
        const decoded = await decodeInvoice(parsed.invoice);
        if (decoded.isExpired) {
          setError("This invoice has expired");
          setIsDecoding(false);
          return;
        }
        setDecodedInvoice({ ...decoded, type: "bolt11" });
        setInvoiceInput(parsed.invoice);
        setStage("review");
      } else if (parsed.type === "lightning_address") {
        setDecodedInvoice({
          type: "lightning_address",
          address: parsed.address,
          description: `Pay to ${parsed.address}`,
          isExpired: false,
        });
        setStage("review");
      } else if (parsed.type === "bitcoin") {
        setDecodedInvoice({
          type: "bitcoin",
          address: parsed.address,
          amountSats: parsed.amountSats,
          description: "On-chain payment",
          isExpired: false,
        });
        setStage("review");
      } else if (parsed.type === "lnurl") {
        setDecodedInvoice({
          type: "lnurl",
          address: parsed.address,
          description: "LNURL payment",
          isExpired: false,
        });
        setStage("review");
      } else {
        try {
          const decoded = await decodeInvoice(input.trim());
          if (decoded.isExpired) {
            setError("This invoice has expired");
            setIsDecoding(false);
            return;
          }
          setDecodedInvoice({ ...decoded, type: "bolt11" });
          setStage("review");
        } catch {
          setError("Could not recognize this payment format. Try pasting a Lightning invoice.");
        }
      }
    } catch (e) {
      setError("Invalid input. Please check and try again.");
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

  const getPaymentTypeLabel = () => {
    switch (decodedInvoice?.type) {
      case "lightning_address": return "Lightning Address";
      case "bitcoin": return "On-chain (Submarine Swap)";
      case "lnurl": return "LNURL Pay";
      default: return "Lightning";
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="send-back-button">
          <Ionicons name="chevron-back" size={22} color="#8FA3C8" />
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
          {stage === "scan" && (
            <Animated.View entering={FadeIn} style={{ gap: 20 }}>
              <View style={styles.scannerBox}>
                {permission?.granted && cameraActive && Platform.OS !== "web" ? (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={(result) => handleBarCodeScanned(result.data)}
                  />
                ) : null}
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
                {!permission?.granted && (
                  <Pressable onPress={requestPermission} style={styles.cameraPermBtn}>
                    <Ionicons name="camera" size={24} color="#8FA3C8" />
                    <Text style={styles.cameraPermText}>Tap to enable camera</Text>
                  </Pressable>
                )}
                {permission?.granted && cameraActive && (
                  <Text style={styles.scanningText}>SCANNING FOR QR CODE...</Text>
                )}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                testID="paste-invoice-button"
                style={styles.dashedBtn}
                onPress={handlePasteInvoice}
              >
                <Ionicons name="clipboard-outline" size={18} color="#CDDAED" />
                <Text style={styles.dashedBtnText}>Paste Invoice</Text>
              </Pressable>

              <Pressable testID="import-photos-button" style={styles.dashedBtn} onPress={handlePickImage}>
                <MaterialCommunityIcons name="image-plus" size={18} color="#CDDAED" />
                <Text style={styles.dashedBtnText}>Import from Photos</Text>
              </Pressable>
            </Animated.View>
          )}

          {stage === "paste" && (
            <Animated.View entering={FadeIn} style={styles.scanStage}>
              <View style={styles.invoiceCard}>
                <View style={styles.invoiceCardHeader}>
                  <Ionicons name="key-outline" size={16} color="#8FA3C8" />
                  <Text style={styles.invoiceCardLabel}>INVOICE DETAILS</Text>
                </View>
                <TextInput
                  testID="invoice-input"
                  style={styles.invoiceTextArea}
                  placeholder="Paste lightning invoice, Bitcoin address, or LNURL..."
                  placeholderTextColor="#4A608080"
                  value={invoiceInput}
                  onChangeText={setInvoiceInput}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={{ flex: 1 }} />

              <View style={styles.scanActions}>
                <Pressable
                  testID="send-invoice-button"
                  style={styles.sendCoralBtn}
                  onPress={() => handleDecodeInput(invoiceInput)}
                  disabled={!invoiceInput.trim() || isDecoding}
                >
                  {isDecoding ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="arrow-forward-outline" size={18} color="#FFF" style={{ transform: [{ rotate: "-45deg" }] }} />
                      <Text style={styles.sendCoralBtnText}>Continue</Text>
                    </>
                  )}
                </Pressable>

                <Pressable onPress={() => { setStage("scan"); setCameraActive(true); setError(""); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Back to Scanner</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

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
                  <Text style={styles.badgeText}>{getPaymentTypeLabel()}</Text>
                </View>
              </View>

              {decodedInvoice.type === "bitcoin" && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning-outline" size={16} color={GOLD} />
                  <Text style={styles.warningText}>
                    On-chain payments use submarine swaps and may take longer with additional fees.
                  </Text>
                </View>
              )}

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

              <Pressable onPress={() => { setStage("scan"); setCameraActive(true); setError(""); }} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </Animated.View>
          )}

          {stage === "sending" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={styles.stateTitle}>Firing the cannons…</Text>
              <Text style={styles.stateSubtitle}>Sending your sats</Text>
            </Animated.View>
          )}

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
              <Pressable testID="send-done-button" style={styles.doneBtn} onPress={() => router.back()}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </Animated.View>
          )}

          {stage === "error" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <View style={styles.errorCircle}>
                <Ionicons name="close" size={48} color="#E63946" />
              </View>
              <Text style={styles.stateTitle}>Payment failed</Text>
              <Text style={styles.stateSubtitle} numberOfLines={3}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => { setStage("scan"); setError(""); setCameraActive(true); }}
              >
                <Text style={styles.retryBtnText}>Try Again</Text>
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
    borderRadius: 22,
    backgroundColor: NAVY_CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  title: { fontFamily: "Nunito_700Bold", fontSize: 20, color: "#FFFFFF" },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  scannerBox: {
    height: 300,
    backgroundColor: "#000",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  cornerTL: { position: "absolute", top: 20, left: 20, width: 32, height: 32, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "rgba(255,255,255,0.6)", borderTopLeftRadius: 8 },
  cornerTR: { position: "absolute", top: 20, right: 20, width: 32, height: 32, borderTopWidth: 3, borderRightWidth: 3, borderColor: "rgba(255,255,255,0.6)", borderTopRightRadius: 8 },
  cornerBL: { position: "absolute", bottom: 20, left: 20, width: 32, height: 32, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "rgba(255,255,255,0.6)", borderBottomLeftRadius: 8 },
  cornerBR: { position: "absolute", bottom: 20, right: 20, width: 32, height: 32, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "rgba(255,255,255,0.6)", borderBottomRightRadius: 8 },
  cameraPermBtn: { alignItems: "center", gap: 8 },
  cameraPermText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#8FA3C8" },
  scanningText: {
    fontFamily: "Nunito_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 2,
    position: "absolute",
    bottom: 28,
    textTransform: "uppercase",
  },
  scanStage: { flex: 1, gap: 16 },
  invoiceCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E2D50",
    gap: 12,
  },
  invoiceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  invoiceCardLabel: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: "#8FA3C8",
    letterSpacing: 1.5,
  },
  invoiceTextArea: {
    backgroundColor: "rgba(11,20,38,0.5)",
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#CDDAED",
    borderWidth: 1,
    borderColor: "#1E2D5060",
  },
  scanActions: { gap: 12 },
  sendCoralBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: "#C45A3D",
  },
  sendCoralBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFF" },
  dashedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
  },
  dashedBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: "#CDDAED" },
  errorText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#E63946", textAlign: "center" },
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
  reviewTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: "#FFFFFF" },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  reviewLabel: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#8FA3C8" },
  reviewValueCol: { flex: 1, alignItems: "flex-end" },
  reviewAmount: { fontFamily: "Nunito_700Bold", fontSize: 22, color: "#FFFFFF" },
  reviewValue: { fontFamily: "Nunito_500Medium", fontSize: 14, color: "#CDDAED", flex: 1, textAlign: "right" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(74,144,217,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontFamily: "Nunito_500Medium", fontSize: 12, color: "#4A90D9" },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(201,162,77,0.1)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
  },
  warningText: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12, color: "#CDDAED", lineHeight: 18 },
  confirmBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  confirmGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  confirmText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFF" },
  cancelBtn: { alignItems: "center", paddingVertical: 8 },
  cancelText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#4A6080" },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: 80,
  },
  stateTitle: { fontFamily: "Nunito_700Bold", fontSize: 24, color: "#FFFFFF" },
  stateSubtitle: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#8FA3C8", textAlign: "center", paddingHorizontal: 20 },
  feeNote: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080" },
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
  doneBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: NAVY },
  retryBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#CDDAED" },
});
