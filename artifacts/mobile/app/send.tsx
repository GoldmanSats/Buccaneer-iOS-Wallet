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
import Animated, { FadeIn, useSharedValue, withSpring, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useWallet } from "@/contexts/WalletContext";
import { useSettings } from "@/contexts/SettingsContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";
import * as BreezService from "@/utils/breezService";

type Stage = "scan" | "paste" | "sending" | "success" | "error";

export default function SendScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;
  const { sendPayment, decodeInvoice, parseInput, btcPrice, balance } = useWallet();
  const sats = balance?.balanceSats ?? 0;
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
  const [sendAmountInput, setSendAmountInput] = useState("");
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [isFeeLoading, setIsFeeLoading] = useState(false);
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
    setStage("paste");
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

  const feeRequestRef = useRef(0);

  const resetSendState = () => {
    setInvoiceInput("");
    setDecodedInvoice(null);
    setSendAmountInput("");
    setEstimatedFee(null);
    setIsFeeLoading(false);
    setError("");
    feeRequestRef.current++;
  };

  const fetchFeeEstimate = async (destination: string, amountSats?: number) => {
    const reqId = ++feeRequestRef.current;
    setIsFeeLoading(true);
    setEstimatedFee(null);
    try {
      if (Platform.OS !== "web") {
        const result = await BreezService.prepareSendPayment(destination, amountSats);
        if (reqId === feeRequestRef.current) {
          setEstimatedFee(result.feeSats || 0);
        }
      } else {
        const API_BASE = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
        const resp = await fetch(`${API_BASE}/wallet/prepare-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination, amountSats }),
        });
        if (resp.ok && reqId === feeRequestRef.current) {
          const data = await resp.json();
          setEstimatedFee(data.feesSat ?? null);
        }
      }
    } catch {}
    if (reqId === feeRequestRef.current) setIsFeeLoading(false);
  };

  const handleDecodeInput = async (input: string) => {
    if (!input.trim()) return;
    setIsDecoding(true);
    setError("");
    setEstimatedFee(null);
    try {
      const parsed = await parseInput(input.trim());

      let decoded: typeof decodedInvoice = null;
      let canonicalDest = input.trim();

      if (parsed.type === "bolt11" && parsed.invoice) {
        const dec = await decodeInvoice(parsed.invoice);
        if (dec.isExpired) {
          setError("This invoice has expired");
          setIsDecoding(false);
          return;
        }
        decoded = { ...dec, type: "bolt11" };
        canonicalDest = parsed.invoice;
        setInvoiceInput(parsed.invoice);
      } else if (parsed.type === "lightning_address") {
        decoded = {
          type: "lightning_address",
          address: parsed.address,
          description: `Pay to ${parsed.address}`,
          isExpired: false,
        };
        canonicalDest = parsed.address;
      } else if (parsed.type === "bitcoin") {
        decoded = {
          type: "bitcoin",
          address: parsed.address,
          amountSats: parsed.amountSats,
          description: "On-chain payment",
          isExpired: false,
        };
        canonicalDest = parsed.address;
      } else if (parsed.type === "lnurl") {
        decoded = {
          type: "lnurl",
          address: parsed.address,
          description: "LNURL payment",
          isExpired: false,
        };
        canonicalDest = parsed.address;
      } else {
        try {
          const dec = await decodeInvoice(input.trim());
          if (dec.isExpired) {
            setError("This invoice has expired");
            setIsDecoding(false);
            return;
          }
          decoded = { ...dec, type: "bolt11" };
        } catch {
          setError("Could not recognize this payment format. Try pasting a Lightning invoice.");
        }
      }

      if (decoded) {
        setDecodedInvoice(decoded);
        setSendAmountInput("");
        setStage("paste");
        if (decoded.amountSats && decoded.amountSats > 0) {
          fetchFeeEstimate(canonicalDest, decoded.amountSats);
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
    const amountToSend = decodedInvoice?.amountSats || (sendAmountInput ? parseInt(sendAmountInput, 10) : undefined);
    if (!amountToSend || amountToSend <= 0) {
      setError("Please enter an amount");
      return;
    }
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStage("sending");
    try {
      const res = await sendPayment(invoiceInput.trim(), amountToSend);
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

  const satsToFiat = (sats: number) => {
    if (!btcPrice) return null;
    const amount = (sats / 100_000_000) * btcPrice.price;
    return `${btcPrice.symbol || "$"}${amount.toFixed(2)}`;
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
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]} testID="send-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Send</Text>
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
                    <Ionicons name="camera" size={24} color={colors.textMuted} />
                    <Text style={[styles.cameraPermText, { color: colors.textMuted }]}>Tap to enable camera</Text>
                  </Pressable>
                )}
                {permission?.granted && cameraActive && (
                  <Text style={styles.scanningText}>SCANNING FOR QR CODE...</Text>
                )}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                testID="paste-invoice-button"
                style={[styles.dashedBtn, { borderColor: isDark ? "rgba(255,255,255,0.15)" : colors.border }]}
                onPress={handlePasteInvoice}
              >
                <Ionicons name="clipboard-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.dashedBtnText, { color: colors.textSecondary }]}>Paste Invoice</Text>
              </Pressable>

              <Pressable testID="import-photos-button" style={[styles.dashedBtn, { borderColor: isDark ? "rgba(255,255,255,0.15)" : colors.border }]} onPress={handlePickImage}>
                <MaterialCommunityIcons name="image-plus" size={18} color={colors.textSecondary} />
                <Text style={[styles.dashedBtnText, { color: colors.textSecondary }]}>Import from Photos</Text>
              </Pressable>
            </Animated.View>
          )}

          {stage === "paste" && (
            <Animated.View entering={FadeIn} style={styles.scanStage}>
              <View style={[styles.invoiceCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.invoiceCardHeader}>
                  <Ionicons name="key-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.invoiceCardLabel, { color: colors.textMuted }]}>INVOICE DETAILS</Text>
                </View>
                <TextInput
                  testID="invoice-input"
                  style={[
                    styles.invoiceTextArea,
                    { backgroundColor: isDark ? "rgba(11,20,38,0.5)" : colors.bgInput, color: colors.text, borderColor: decodedInvoice ? (isDark ? colors.coral : colors.coralDark) : colors.border + "60" },
                    decodedInvoice && { minHeight: 60 },
                  ]}
                  placeholder="Paste lightning invoice, Bitcoin address, or LNURL..."
                  placeholderTextColor={colors.textMuted + "80"}
                  value={invoiceInput}
                  onChangeText={(t) => {
                    setInvoiceInput(t);
                    if (decodedInvoice) {
                      setDecodedInvoice(null);
                      setSendAmountInput("");
                    }
                  }}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!decodedInvoice}
                />

                {decodedInvoice && (
                  <View style={styles.parsedBadgeRow}>
                    <View style={[styles.badge, { backgroundColor: isDark ? "rgba(74,144,217,0.15)" : "rgba(74,144,217,0.10)" }]}>
                      <MaterialCommunityIcons name="lightning-bolt" size={12} color="#4A90D9" />
                      <Text style={styles.badgeText}>{getPaymentTypeLabel()}</Text>
                    </View>
                    <Text style={[styles.parsedSubtext, { color: colors.textMuted }]}>Instant payment</Text>
                  </View>
                )}
              </View>

              {decodedInvoice && decodedInvoice.amountSats && decodedInvoice.amountSats > 0 && (
                <Animated.View entering={FadeIn} style={{ alignItems: "center", gap: 4, paddingVertical: 8 }}>
                  <Text style={[styles.amountLabel, { color: colors.textMuted, textAlign: "center" }]}>Amount to send</Text>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                    <Text style={[styles.fixedAmountDisplay, { color: colors.text }]}>
                      {decodedInvoice.amountSats.toLocaleString()}
                    </Text>
                    <Text style={[styles.fixedAmountUnit, { color: isDark ? colors.coral : colors.coralDark }]}>sats</Text>
                  </View>
                  {satsToFiat(decodedInvoice.amountSats) && (
                    <Text style={[styles.fiatConversion, { color: colors.textMuted }]}>
                      ≈ {satsToFiat(decodedInvoice.amountSats)}
                    </Text>
                  )}
                </Animated.View>
              )}

              {decodedInvoice && !decodedInvoice.amountSats && (
                <Animated.View entering={FadeIn}>
                  <Text style={[styles.amountLabel, { color: colors.text }]}>Enter Amount to Send</Text>
                  <View style={[styles.amountInputRow, { backgroundColor: isDark ? "rgba(11,20,38,0.5)" : colors.bgInput, borderColor: colors.border }]}>
                    <TextInput
                      testID="send-amount-input"
                      style={[styles.amountInputField, { color: colors.text }]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted + "80"}
                      value={sendAmountInput}
                      onChangeText={(t) => {
                        setSendAmountInput(t.replace(/[^0-9]/g, ""));
                        setEstimatedFee(null);
                      }}
                      keyboardType="number-pad"
                      onBlur={() => {
                        const amt = parseInt(sendAmountInput, 10);
                        if (amt > 0 && invoiceInput) {
                          fetchFeeEstimate(invoiceInput.trim(), amt);
                        }
                      }}
                    />
                    <Text style={[styles.amountUnit, { color: colors.textMuted }]}>sats</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceText, { color: colors.textMuted }]}>
                      Available: {sats.toLocaleString()} sats
                    </Text>
                    <Pressable
                      style={[styles.maxBtn, { backgroundColor: isDark ? "rgba(23,162,184,0.15)" : "rgba(13,110,125,0.12)" }]}
                      onPress={() => {
                        setSendAmountInput(String(sats));
                        if (sats > 0 && invoiceInput) fetchFeeEstimate(invoiceInput.trim(), sats);
                      }}
                    >
                      <Text style={[styles.maxBtnText, { color: isDark ? colors.teal : colors.tealDark }]}>Max</Text>
                    </Pressable>
                  </View>
                  {sendAmountInput && satsToFiat(parseInt(sendAmountInput, 10) || 0) && (
                    <Text style={[styles.fiatConversion, { color: colors.textMuted }]}>
                      ≈ {satsToFiat(parseInt(sendAmountInput, 10) || 0)}
                    </Text>
                  )}
                </Animated.View>
              )}

              {decodedInvoice && (
                <View style={[styles.feeCard, { backgroundColor: isDark ? "rgba(11,20,38,0.5)" : colors.bgInput, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Estimated Network Fee</Text>
                  </View>
                  {isFeeLoading ? (
                    <ActivityIndicator color={colors.textMuted} size="small" style={{ marginTop: 6 }} />
                  ) : estimatedFee !== null ? (
                    <Text style={[styles.feeValue, { color: colors.text }]}>
                      ~{estimatedFee.toLocaleString()} sats
                    </Text>
                  ) : (
                    <Text style={[styles.feeValue, { color: isDark ? colors.coral : colors.coralDark }]}>
                      Calculated on send
                    </Text>
                  )}
                </View>
              )}

              {decodedInvoice && decodedInvoice.type === "bitcoin" && (
                <View style={[styles.warningBanner, { backgroundColor: isDark ? "rgba(201,162,77,0.1)" : "rgba(250,186,26,0.08)", borderColor: isDark ? "rgba(201,162,77,0.3)" : "rgba(250,186,26,0.3)" }]}>
                  <Ionicons name="warning-outline" size={16} color={colors.gold} />
                  <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                    On-chain payments use submarine swaps and may take longer with additional fees.
                  </Text>
                </View>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={{ flex: 1 }} />

              <View style={styles.scanActions}>
                {decodedInvoice ? (
                  <Pressable
                    testID="confirm-send-button"
                    style={styles.confirmBtn}
                    onPress={handleSend}
                    disabled={!decodedInvoice.amountSats && (!sendAmountInput || parseInt(sendAmountInput, 10) <= 0)}
                  >
                    <LinearGradient
                      colors={["#E76F51", "#C45A3D"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.confirmGradient}
                    >
                      <Ionicons name="arrow-up" size={20} color="#FFF" />
                      <Text style={styles.confirmText}>Send</Text>
                    </LinearGradient>
                  </Pressable>
                ) : (
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
                )}

                <Pressable onPress={() => { resetSendState(); setStage("scan"); setCameraActive(true); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.textMuted }]}>{decodedInvoice ? "Cancel" : "Back to Scanner"}</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}


          {stage === "sending" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <ActivityIndicator color={colors.gold} size="large" />
              <Text style={[styles.stateTitle, { color: colors.text }]}>Firing the cannons…</Text>
            </Animated.View>
          )}

          {stage === "success" && result && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <Animated.View style={[styles.successCircle, successStyle]}>
                <Ionicons name="checkmark" size={48} color="#2DC653" />
              </Animated.View>
              <Text style={[styles.successTitle, { color: colors.text }]}>Sent Successfully!</Text>
              <Text style={[styles.stateSubtitle, { color: colors.textMuted }]}>
                {result.amountSats.toLocaleString()} sats have been sent across the seas.
              </Text>
              {result.feeSats > 0 && (
                <Text style={[styles.feeNote, { color: colors.textMuted }]}>Fee: {result.feeSats} sats</Text>
              )}
              <Pressable testID="send-done-button" style={[styles.returnBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]} onPress={() => router.back()}>
                <Text style={[styles.returnBtnText, { color: colors.textSecondary }]}>Return to Port</Text>
              </Pressable>
            </Animated.View>
          )}

          {stage === "error" && (
            <Animated.View entering={FadeIn} style={styles.centerState}>
              <View style={styles.errorCircle}>
                <Ionicons name="close" size={48} color="#E63946" />
              </View>
              <Text style={[styles.stateTitle, { color: colors.text }]}>Payment failed</Text>
              <Text style={[styles.stateSubtitle, { color: colors.textMuted }]} numberOfLines={3}>{error}</Text>
              <Pressable
                style={[styles.retryBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                onPress={() => { resetSendState(); setStage("scan"); setCameraActive(true); }}
              >
                <Text style={[styles.retryBtnText, { color: colors.textSecondary }]}>Try Again</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontFamily: "Nunito_700Bold", fontSize: 20 },
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
  cameraPermText: { fontFamily: "Nunito_400Regular", fontSize: 13 },
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
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
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
    letterSpacing: 1.5,
  },
  invoiceTextArea: {
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    borderWidth: 1,
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
  },
  dashedBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 15 },
  errorText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#E63946", textAlign: "center" },
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
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  warningText: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18 },
  confirmBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  confirmGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  confirmText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFF" },
  parsedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  parsedSubtext: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  amountLabel: { fontFamily: "Nunito_700Bold", fontSize: 16, marginBottom: 8 },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amountInputField: {
    flex: 1,
    fontFamily: "Nunito_700Bold",
    fontSize: 18,
  },
  amountUnit: { fontFamily: "Nunito_600SemiBold", fontSize: 14, marginLeft: 8 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  balanceText: { fontFamily: "Nunito_400Regular", fontSize: 13 },
  maxBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  maxBtnText: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  fiatConversion: { fontFamily: "Nunito_400Regular", fontSize: 13, textAlign: "right", marginTop: 4 },
  fixedAmountDisplay: { fontFamily: "Chewy_400Regular", fontSize: 48 },
  fixedAmountUnit: { fontFamily: "Nunito_700Bold", fontSize: 22, marginBottom: 6 },
  feeCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 4,
  },
  feeLabel: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  feeValue: { fontFamily: "Nunito_700Bold", fontSize: 15, marginTop: 2 },
  cancelBtn: { alignItems: "center", paddingVertical: 8 },
  cancelText: { fontFamily: "Nunito_400Regular", fontSize: 14 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: 80,
  },
  stateTitle: { fontFamily: "Nunito_700Bold", fontSize: 24 },
  successTitle: { fontFamily: "Chewy_400Regular", fontSize: 32 },
  stateSubtitle: { fontFamily: "Nunito_400Regular", fontSize: 14, textAlign: "center", paddingHorizontal: 20 },
  feeNote: { fontFamily: "Nunito_400Regular", fontSize: 12 },
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
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  returnBtn: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    width: "80%",
    alignItems: "center",
  },
  returnBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  retryBtn: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1,
  },
  doneBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  retryBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
});
