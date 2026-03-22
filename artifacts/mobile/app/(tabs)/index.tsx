import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Platform,
  TextInput,
  Dimensions,
  Modal,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Share,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeIn,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Audio } from "expo-av";
import { useSettings } from "@/contexts/SettingsContext";
import { useWallet } from "@/contexts/WalletContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";
import Svg, { Circle, Line, G } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const FIAT_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", JPY: "¥", GBP: "£", AUD: "A$", NZD: "NZ$", CAD: "C$", CHF: "CHF",
};

function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
}

function formatSats(sats: number): string {
  return sats.toLocaleString();
}

function ShipWheelIcon({ size = 20, color = "#99A3B8" }: { size?: number; color?: string }) {
  const cx = 12, cy = 12;
  const spokes = [0, 60, 120, 180, 240, 300];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={cx} cy={cy} r={6} stroke={color} strokeWidth={2} fill="none" />
      <Circle cx={cx} cy={cy} r={2} stroke={color} strokeWidth={2} fill="none" />
      {spokes.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + 2 * Math.cos(rad);
        const y1 = cy + 2 * Math.sin(rad);
        const x2 = cx + 10.5 * Math.cos(rad);
        const y2 = cy + 10.5 * Math.sin(rad);
        const hx = cx + 11.2 * Math.cos(rad);
        const hy = cy + 11.2 * Math.sin(rad);
        return (
          <G key={angle}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Circle cx={hx} cy={hy} r={1.2} fill={color} />
          </G>
        );
      })}
    </Svg>
  );
}

interface TxType {
  id: string;
  type: "send" | "receive";
  amountSats: number;
  feeSats: number;
  description: string;
  memo: string;
  timestamp: string;
  status: string;
  paymentHash?: string;
  method?: string;
}

function TransactionItem({
  tx, onPress, colors,
}: {
  tx: TxType;
  onPress: (tx: TxType) => void;
  colors: typeof MIDNIGHT;
}) {
  const isReceive = tx.type === "receive";
  const isPending = tx.status === "pending";
  const isPendingDeposit = isPending && tx.method === "deposit";
  const displayText = isPendingDeposit
    ? "On-chain deposit"
    : tx.memo || (isReceive ? "Received" : "Sent");

  const isDark = colors === MIDNIGHT;
  const iconBg = isPendingDeposit
    ? "rgba(234,179,8,0.15)"
    : isReceive
      ? (isDark ? "rgba(23,162,184,0.10)" : "rgba(23,162,184,0.20)")
      : (isDark ? "rgba(232,106,51,0.10)" : "rgba(232,106,51,0.20)");
  const iconColor = isPendingDeposit ? "#EAB308" : isReceive ? (isDark ? colors.teal : colors.tealDark) : (isDark ? colors.coral : colors.coralDark);
  const amountColor = isPendingDeposit ? "#EAB308" : isReceive ? (isDark ? colors.teal : colors.tealDark) : (isDark ? colors.coral : colors.coralDark);

  return (
    <Pressable
      style={({ pressed }) => [
        txStyles.row,
        isPendingDeposit && { backgroundColor: "rgba(234,179,8,0.05)", borderWidth: 1, borderColor: "rgba(234,179,8,0.2)" },
        pressed && { opacity: 0.7, backgroundColor: colors.bgCard + "80" },
      ]}
      onPress={() => onPress(tx)}
      testID={`tx-item-${tx.id}`}
    >
      <View style={[txStyles.iconCircle, { backgroundColor: iconBg }]}>
        {isPendingDeposit && (
          <View style={txStyles.pendingBadge}>
            <Ionicons name="reload" size={8} color="#FFF" />
          </View>
        )}
        <Ionicons
          name={isReceive ? "arrow-back-outline" : "arrow-up-outline"}
          size={20}
          color={iconColor}
          style={{ transform: [{ rotate: isReceive ? "-45deg" : "45deg" }] }}
        />
      </View>

      <View style={txStyles.meta}>
        <Text style={[txStyles.desc, { color: isPendingDeposit ? "#EAB308" : colors.text }]} numberOfLines={2}>
          {displayText}
        </Text>
        <Text style={[txStyles.time, { color: colors.textMuted }]}>
          {isPendingDeposit ? "Waiting for confirmation..." : formatDate(tx.timestamp)}
        </Text>
      </View>

      <View style={txStyles.amountCol}>
        <Text style={[txStyles.amount, { color: amountColor }]}>
          {isReceive ? "+" : "-"}{formatSats(tx.amountSats)} sats
        </Text>
        <View style={txStyles.statusRow}>
          {(tx.feeSats ?? 0) > 0 && (
            <Text style={[txStyles.feeText, { color: colors.textMuted }]}>Fee: {tx.feeSats}</Text>
          )}
          {isPendingDeposit ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="reload" size={8} color="#EAB308" />
              <Text style={{ fontSize: 9, fontFamily: "Nunito_700Bold", color: "#EAB308" }}>PENDING</Text>
            </View>
          ) : tx.status === "completed" ? (
            <Ionicons name="checkmark-circle" size={12} color={colors.green} />
          ) : tx.status === "pending" ? (
            <Ionicons name="reload" size={12} color="#EAB308" />
          ) : tx.status === "failed" ? (
            <Text style={{ fontSize: 9, fontFamily: "Nunito_700Bold", color: colors.red }}>FAILED</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const txStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8, borderRadius: 16, gap: 16 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  pendingBadge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: "#EAB308", alignItems: "center", justifyContent: "center", zIndex: 1 },
  meta: { flex: 1, gap: 2 },
  desc: { fontFamily: "Nunito_700Bold", fontSize: 14, lineHeight: 18 },
  time: { fontFamily: "Nunito_400Regular", fontSize: 12, marginTop: 2 },
  amountCol: { alignItems: "flex-end", gap: 2 },
  amount: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeText: { fontFamily: "Nunito_400Regular", fontSize: 10 },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { settings, isLoading: settingsLoading, toggleBalanceHidden, toggleDisplayMode } = useSettings();
  const {
    balance, transactions, btcPrice,
    isBalanceLoading, isTransactionsLoading,
    refetchBalance, refetchTransactions,
    updateMemo, createInvoice,
  } = useWallet();

  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TxType | null>(null);
  const [editingMemo, setEditingMemo] = useState("");
  const [celebration, setCelebration] = useState<{ amount: number; description: string } | null>(null);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveMode, setReceiveMode] = useState<"default" | "amount" | "generated">("default");
  const [receiveAmountInput, setReceiveAmountInput] = useState("");
  const [receiveDescInput, setReceiveDescInput] = useState("");
  const [receiveInvoice, setReceiveInvoice] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState("");
  const [receiveGenerating, setReceiveGenerating] = useState(false);
  const [receiveCopied, setReceiveCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;

  useEffect(() => {
    if (!settingsLoading && !settings.onboardingDone) {
      router.replace("/onboarding");
    }
  }, [settingsLoading, settings.onboardingDone]);

  const balanceScale = useSharedValue(1);
  const balanceAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: balanceScale.value }],
  }));

  const topPad = insets.top + 2;
  const bottomPad = insets.bottom + 16;

  const TX_COLLAPSED_HEIGHT = SCREEN_HEIGHT * 0.22;
  const TX_EXPANDED_HEIGHT = SCREEN_HEIGHT - topPad;
  const txPanelHeight = useSharedValue(TX_COLLAPSED_HEIGHT);
  const isLogExpandedRef = useRef(false);

  useEffect(() => {
    isLogExpandedRef.current = isLogExpanded;
    txPanelHeight.value = withTiming(
      isLogExpanded ? TX_EXPANDED_HEIGHT : TX_COLLAPSED_HEIGHT,
      { duration: 350, easing: Easing.out(Easing.cubic) }
    );
  }, [isLogExpanded]);

  const txPanelAnimStyle = useAnimatedStyle(() => ({
    height: txPanelHeight.value,
  }));

  const txPanGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onEnd((e) => {
      const SWIPE_THRESHOLD = 50;
      const VELOCITY_THRESHOLD = 0.5;
      const swipedUp = e.translationY < -SWIPE_THRESHOLD || e.velocityY < -VELOCITY_THRESHOLD;
      const swipedDown = e.translationY > SWIPE_THRESHOLD || e.velocityY > VELOCITY_THRESHOLD;
      if (swipedUp && !isLogExpandedRef.current) {
        if (Platform.OS !== "web") runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(setIsLogExpanded)(true);
      } else if (swipedDown && isLogExpandedRef.current) {
        if (Platform.OS !== "web") runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(setIsLogExpanded)(false);
      }
    });

  const receiveSheetTranslateY = useSharedValue(0);
  const txDetailTranslateY = useSharedValue(0);
  const txLogScrollOffset = useRef(0);

  const receiveSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: receiveSheetTranslateY.value }],
  }));

  const txDetailAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: txDetailTranslateY.value }],
  }));


  const handleBalanceTap = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    balanceScale.value = withSpring(0.95, {}, () => { balanceScale.value = withSpring(1); });
    await toggleBalanceHidden();
  };

  const handleTxPress = (tx: TxType) => {
    txDetailTranslateY.value = 0;
    setSelectedTx(tx);
    setEditingMemo(tx.memo || "");
  };

  const handleSaveMemo = async () => {
    if (!selectedTx) return;
    try { await updateMemo(selectedTx.id, editingMemo); } catch {}
    setSelectedTx(null);
  };

  const refreshing = isBalanceLoading || isTransactionsLoading;
  const onRefresh = useCallback(() => { refetchBalance(); refetchTransactions(); }, [refetchBalance, refetchTransactions]);

  const sats = balance?.balanceSats ?? 0;
  const isFiatPrimary = settings.primaryDisplay === "fiat";
  const fiatCurrency = settings.fiatCurrency ?? "USD";
  const isBackedUp = settings.backupCompleted;
  const fiatSymbol = FIAT_SYMBOLS[fiatCurrency] || "$";
  const fiatAmount = btcPrice ? (sats / 100_000_000) * btcPrice.price : 0;
  const hasFiatPrice = !!btcPrice;

  const playBellSound = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("@/assets/sounds/ships_bell.wav")
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.warn("Bell sound failed", e);
    }
  }, []);

  const seenTxIdsRef = useRef<Set<string> | null>(null);
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!transactions.length) return;
    const currentIds = new Set(transactions.map((tx: any) => tx.id || `${tx.timestamp}-${tx.amountSats}`));
    if (!initialLoadDoneRef.current) {
      seenTxIdsRef.current = currentIds;
      initialLoadDoneRef.current = true;
      return;
    }
    const prevIds = seenTxIdsRef.current!;
    const newReceived = transactions.filter((tx: any) => {
      const txId = tx.id || `${tx.timestamp}-${tx.amountSats}`;
      return !prevIds.has(txId) && tx.type === "receive" && tx.status === "completed";
    });
    if (newReceived.length > 0) {
      const totalAmount = newReceived.reduce((sum: number, tx: any) => sum + (tx.amountSats || 0), 0);
      const desc = newReceived.length > 1
        ? `${newReceived.length} incoming payments`
        : (newReceived[0] as any).description || "Incoming payment";
      if (receiveOpen) {
        receiveSheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) }, () => {
          runOnJS(setReceiveOpen)(false);
          runOnJS(resetReceiveState)();
        });
      }
      refetchBalance();
      playBellSound();
      setCelebration({ amount: totalAmount, description: desc });
      setTimeout(() => setCelebration(null), 5500);
    }
    seenTxIdsRef.current = currentIds;
  }, [transactions]);

  const formatted = formatSats(sats);
  const digitCount = formatted.replace(/,/g, "").length;
  const balanceFontSize = digitCount <= 3 ? 72 : digitCount <= 5 ? 60 : digitCount <= 7 ? 48 : 36;
  const symbolFontSize = digitCount <= 5 ? 24 : digitCount <= 7 ? 20 : 18;
  const symbolBottomOffset = digitCount <= 5 ? 8 : digitCount <= 7 ? 6 : 4;

  const lightningAddress = settings.lightningAddress || "buccaneeradiciw@breez.tips";

  const resetReceiveState = () => {
    setReceiveInvoice(null);
    setReceiveAmountInput("");
    setReceiveDescInput("");
    setReceiveError("");
    setReceiveMode("default");
    setReceiveCopied(false);
    setAddressCopied(false);
  };

  const openReceiveDrawer = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetReceiveState();
    receiveSheetTranslateY.value = SCREEN_HEIGHT;
    setReceiveOpen(true);
    requestAnimationFrame(() => {
      receiveSheetTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    });
  };

  const closeReceiveDrawer = () => {
    receiveSheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) }, () => {
      runOnJS(setReceiveOpen)(false);
      runOnJS(resetReceiveState)();
    });
  };

  const receiveDismissGesture = Gesture.Pan()
    .activeOffsetY([0, 15])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        receiveSheetTranslateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 400) {
        receiveSheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
          runOnJS(setReceiveOpen)(false);
          runOnJS(resetReceiveState)();
        });
      } else {
        receiveSheetTranslateY.value = withTiming(0, { duration: 200 });
      }
    });

  const txDetailDismissGesture = Gesture.Pan()
    .activeOffsetY([0, 15])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        txDetailTranslateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 400) {
        txDetailTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
          runOnJS(setSelectedTx)(null);
        });
      } else {
        txDetailTranslateY.value = withTiming(0, { duration: 200 });
      }
    });

  const handleReceiveGenerate = async () => {
    const satsVal = parseInt(receiveAmountInput);
    if (!satsVal || satsVal <= 0) {
      setReceiveError("Enter an amount in sats");
      return;
    }
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReceiveGenerating(true);
    setReceiveError("");
    try {
      const result = await createInvoice(satsVal, receiveDescInput || "Buccaneer Wallet");
      setReceiveInvoice(result.bolt11);
      setReceiveMode("generated");
    } catch (e) {
      setReceiveError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setReceiveGenerating(false);
    }
  };

  const handleReceiveCopy = async (text: string) => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(text);
    }
    setReceiveCopied(true);
    setTimeout(() => setReceiveCopied(false), 2000);
  };

  const handleCopyAddress = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(lightningAddress);
    }
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const handleReceiveShare = async (text: string) => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await Share.share({ message: text, title: "Buccaneer Wallet" }); } catch {}
  };

  const receiveQrData = receiveInvoice ? `lightning:${receiveInvoice}` : lightningAddress;
  const receiveQrSize = receiveMode === "amount" ? 180 : 280;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: TX_COLLAPSED_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable
            testID="settings-button"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.settingsBtn,
              { backgroundColor: colors.bgCard, borderColor: colors.border + "80" },
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
          >
            <ShipWheelIcon size={20} color={colors.textMuted} />
          </Pressable>

          {!isBackedUp && (
            <Pressable
              testID="backup-button"
              onPress={() => router.push("/backup")}
              style={({ pressed }) => [
                styles.backupBtn,
                isDark
                  ? { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }
                  : { backgroundColor: "#FFF3E0", borderColor: "#FFCC80" },
                pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons name="shield-outline" size={16} color={isDark ? "#FB923C70" : "#EA580C"} />
              <Text style={[styles.backupText, !isDark && { color: "#EA580C" }]}>Backup!</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.balanceSection}>
          <Pressable
            onPress={handleBalanceTap}
            onLongPress={async () => {
              if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await toggleDisplayMode();
            }}
            testID="balance-display"
          >
            <Animated.View style={[styles.balanceCenter, balanceAnimStyle]}>
              {isFiatPrimary ? (
                <>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.fiatSymbol, { color: colors.text, fontSize: 36 }]}>{fiatSymbol}</Text>
                    <Text style={[styles.balanceText, { color: colors.text, fontSize: 72 }]}>
                      {settings.balanceHidden ? "•••" : hasFiatPrice
                        ? fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : "···"}
                    </Text>
                  </View>
                  <Text style={[styles.subBalance, { color: colors.textMuted }]}>
                    {settings.balanceHidden ? "Tap to reveal" : `≈ ${formatSats(sats)} sats`}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.balanceRow}>
                    <Text
                      style={[
                        styles.btcSymbol,
                        {
                          color: colors.text,
                          fontSize: symbolFontSize,
                          lineHeight: balanceFontSize,
                        },
                      ]}
                    >
                      ₿
                    </Text>
                    <Text style={[styles.balanceText, { color: colors.text, fontSize: balanceFontSize }]}>
                      {settings.balanceHidden ? "•••" : formatted}
                    </Text>
                  </View>
                  <Text style={[styles.subBalance, { color: colors.textMuted }]}>
                    {settings.balanceHidden ? "Tap to reveal"
                      : hasFiatPrice
                      ? `≈ ${fiatSymbol}${fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiatCurrency}`
                      : "Loading price…"}
                  </Text>
                </>
              )}
            </Animated.View>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            testID="receive-button"
            onPress={openReceiveDrawer}
            style={({ pressed }) => [
              styles.actionCard,
              { backgroundColor: isDark ? colors.bgCard : colors.receiveIconBg, borderColor: isDark ? colors.border + "80" : "transparent" },
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: isDark ? "rgba(23,162,184,0.10)" : "rgba(23,162,184,0.20)" }]}>
              <Ionicons name="arrow-back-outline" size={24} color={isDark ? colors.teal : colors.tealDark} style={{ transform: [{ rotate: "-45deg" }] }} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.receiveBtnText }]}>Receive</Text>
          </Pressable>

          <Pressable
            testID="send-button"
            onPress={async () => {
              if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/send");
            }}
            style={({ pressed }) => [
              styles.actionCard,
              { backgroundColor: isDark ? colors.bgCard : colors.sendIconBg, borderColor: isDark ? colors.border + "80" : "transparent" },
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: isDark ? "rgba(232,106,51,0.10)" : "rgba(232,106,51,0.20)" }]}>
              <Ionicons name="arrow-up-outline" size={24} color={isDark ? colors.coral : colors.coralDark} style={{ transform: [{ rotate: "45deg" }] }} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.sendBtnText }]}>Send</Text>
          </Pressable>
        </View>

      </ScrollView>

      {/* Transaction Log — anchored to bottom, expands upward */}
      <Animated.View
        style={[
          styles.txPanelOverlay,
          {
            backgroundColor: colors.bgCard,
            borderTopWidth: 1,
            borderTopColor: colors.border + "80",
          },
          !isDark && {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.06,
            shadowRadius: 15,
            elevation: 8,
          },
          txPanelAnimStyle,
        ]}
      >
        <GestureDetector gesture={txPanGesture}>
        <Animated.View>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsLogExpanded(!isLogExpanded);
          }}
          style={styles.txHeaderRow}
        >
          <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.txHeaderText, { color: colors.textSecondary }]}>Transaction Log</Text>
          <Ionicons name={isLogExpanded ? "chevron-down" : "chevron-up"} size={18} color={colors.textMuted} />
        </Pressable>
        </Animated.View>
        </GestureDetector>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + 8 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isLogExpanded}
          scrollEventThrottle={16}
          onScroll={(e) => { txLogScrollOffset.current = e.nativeEvent.contentOffset.y; }}
          onScrollEndDrag={(e) => {
            if (txLogScrollOffset.current <= 0 && (e.nativeEvent.velocity?.y ?? 0) > 0.3) {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsLogExpanded(false);
            }
          }}
        >
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              {!isTransactionsLoading ? (
                <>
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No transactions yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Your voyage log is empty</Text>
                </>
              ) : (
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Loading plunder…</Text>
              )}
            </View>
          ) : (
            <View style={styles.txList}>
              {transactions.map((tx: any) => (
                <TransactionItem key={tx.id} tx={tx as TxType} onPress={handleTxPress} colors={colors} />
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Transaction Detail Sheet */}
      {!!selectedTx && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents="box-none">
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedTx(null)} />
            <GestureDetector gesture={txDetailDismissGesture}>
            <Animated.View
              style={[styles.txDetailSheet, { backgroundColor: colors.bg, paddingBottom: bottomPad + 12 }, txDetailAnimStyle]}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted + "40" }]} />
              {selectedTx && (() => {
              const isReceive = selectedTx.type === "receive";
              const isPendingDeposit = selectedTx.status === "pending" && selectedTx.method === "deposit";
              const iconBg = isPendingDeposit ? "rgba(234,179,8,0.15)" : isReceive ? "rgba(23,162,184,0.10)" : "rgba(232,106,51,0.10)";
              const iconColor = isPendingDeposit ? "#EAB308" : isReceive ? colors.teal : colors.coral;
              return (
                <View style={styles.txDetailContent}>
                  <View style={[styles.txDetailIcon, { backgroundColor: iconBg }]}>
                    <Ionicons
                      name={isReceive ? "arrow-back-outline" : "arrow-up-outline"}
                      size={40} color={iconColor}
                      style={{ transform: [{ rotate: isReceive ? "-45deg" : "45deg" }] }}
                    />
                    {isPendingDeposit && (
                      <View style={[txStyles.pendingBadge, { width: 24, height: 24, borderRadius: 12, top: -4, right: -4 }]}>
                        <Ionicons name="reload" size={14} color="#FFF" />
                      </View>
                    )}
                  </View>
                  <View style={styles.txDetailAmountRow}>
                    <Text style={[styles.txDetailAmount, { color: isPendingDeposit ? "#EAB308" : colors.text }]}>
                      {isReceive ? "+" : "-"}{formatSats(selectedTx.amountSats)}
                    </Text>
                    <Text style={[styles.txDetailSats, { color: colors.textMuted }]}> sats</Text>
                  </View>
                  <Text style={[styles.txDetailDate, { color: colors.textMuted }]}>
                    {isPendingDeposit ? "On-chain deposit" : formatDate(selectedTx.timestamp)}
                  </Text>
                  {isPendingDeposit && (
                    <View style={[styles.pendingBanner, { backgroundColor: "rgba(234,179,8,0.1)", borderColor: "rgba(234,179,8,0.2)" }]}>
                      <Ionicons name="reload" size={16} color="#EAB308" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", color: "#EAB308" }}>Waiting for on-chain confirmation</Text>
                        <Text style={{ fontSize: 11, fontFamily: "Nunito_400Regular", color: "#EAB308", opacity: 0.8 }}>Your sats are on the way. This typically takes 10-30 minutes.</Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.detailRow, { borderBottomColor: colors.border + "80" }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {selectedTx.status === "completed" && <Ionicons name="checkmark-circle" size={16} color={colors.green} />}
                      {selectedTx.status === "pending" && <Ionicons name="reload" size={16} color="#EAB308" />}
                      <Text style={[styles.detailValue, {
                        color: selectedTx.status === "completed" ? colors.green : selectedTx.status === "pending" ? "#EAB308" : selectedTx.status === "failed" ? colors.red : colors.text,
                      }]}>
                        {isPendingDeposit ? "Confirming on-chain" : selectedTx.status}
                      </Text>
                    </View>
                  </View>
                  {selectedTx.method === "deposit" && (
                    <View style={[styles.detailRow, { borderBottomColor: colors.border + "80" }]}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Method</Text>
                      <Text style={[styles.detailValue, { color: "#FB923C" }]}>On-chain (Bitcoin)</Text>
                    </View>
                  )}
                  {(selectedTx.feeSats ?? 0) > 0 && (
                    <View style={[styles.detailRow, { borderBottomColor: colors.border + "80" }]}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Fee</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTx.feeSats} sats</Text>
                    </View>
                  )}
                  {!isPendingDeposit && (
                    <View style={[styles.memoSection, { borderBottomColor: colors.border + "80" }]}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Memo</Text>
                      <TextInput
                        style={[styles.memoInput, { backgroundColor: colors.bgElevated, color: colors.text, borderColor: colors.border + "60" }]}
                        value={editingMemo}
                        onChangeText={setEditingMemo}
                        placeholder="Add a note..."
                        placeholderTextColor={colors.textMuted}
                        onBlur={handleSaveMemo}
                        returnKeyType="done"
                        onSubmitEditing={handleSaveMemo}
                      />
                    </View>
                  )}
                  {selectedTx.paymentHash && (
                    <View style={styles.hashSection}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{isPendingDeposit ? "Transaction ID" : "Payment Hash"}</Text>
                      <Text style={[styles.hashText, { color: colors.text + "80" }]} selectable>{selectedTx.paymentHash}</Text>
                    </View>
                  )}
                </View>
              );
            })()}
            </Animated.View>
            </GestureDetector>
          </View>
        </View>
      )}

      {/* Receive Drawer */}
      {receiveOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents="box-none">
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeReceiveDrawer} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ justifyContent: "flex-end" }}>
              <GestureDetector gesture={receiveDismissGesture}>
              <Animated.View
                style={[styles.receiveSheet, { backgroundColor: colors.bg, paddingBottom: bottomPad + 20 }, receiveSheetAnimStyle]}
              >
                <Pressable onPress={closeReceiveDrawer} style={styles.receiveDragZone}>
                  <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted + "40" }]} />
                  <Text style={[styles.receiveTitle, { color: colors.text }]}>Receive</Text>
                </Pressable>

                <View style={styles.receiveScrollContent}>
                {receiveMode !== "amount" && (
                  <View style={[styles.receiveQrContainer, { width: receiveQrSize + 24, height: receiveQrSize + 24 }]}>
                    <QRCode
                      value={receiveQrData}
                      size={receiveQrSize}
                      backgroundColor="#FFFFFF"
                      color="#000000"
                      quietZone={8}
                    />
                    <View style={styles.receiveQrOverlay}>
                      <Text style={styles.receiveQrText}>₿uccaneer</Text>
                      <View style={styles.receiveQrBadgeRow}>
                        <View style={[styles.receiveQrBadge, { backgroundColor: "#FBBF24" }]}>
                          <Text style={styles.receiveQrBadgeText}>⚡</Text>
                        </View>
                        <View style={[styles.receiveQrBadge, { backgroundColor: "#F7931A" }]}>
                          <Text style={styles.receiveQrBadgeText}>₿</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {receiveMode === "default" && (
                  <View style={styles.receiveDefaultContent}>
                    <Pressable onPress={handleCopyAddress} style={styles.receiveAddressRow}>
                      <Text style={styles.receiveAddressText}>{lightningAddress}</Text>
                      <Ionicons name={addressCopied ? "checkmark-circle" : "copy-outline"} size={18} color={addressCopied ? "#2DC653" : "#EAB308"} />
                    </Pressable>
                    <Text style={[styles.receiveAddressLabel, { color: colors.textMuted }]}>Lightning Address · tap to copy</Text>

                    <View style={styles.receiveProtocolRow}>
                      <View style={[styles.receiveProtocolBadge, { backgroundColor: "rgba(251,191,36,0.12)" }]}>
                        <Text style={{ fontSize: 12 }}>⚡</Text>
                        <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 10, color: "#FBBF24" }}>Lightning</Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>+</Text>
                      <View style={[styles.receiveProtocolBadge, { backgroundColor: "rgba(247,147,26,0.12)" }]}>
                        <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 10, color: "#F7931A" }}>₿ On-chain</Text>
                      </View>
                    </View>

                    <View style={styles.receiveInfoRow}>
                      <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                      <Text style={[styles.receiveInfoText, { color: colors.textMuted }]}>Unified QR: works with any Bitcoin wallet.</Text>
                    </View>

                    <View style={styles.receiveButtonRow}>
                      <Pressable style={[styles.receiveDashedBtn, { borderColor: colors.border }]} onPress={() => setReceiveMode("amount")}>
                        <Text style={[styles.receiveDashedBtnText, { color: colors.textSecondary }]}>Request Amount</Text>
                      </Pressable>
                      <Pressable style={[styles.receiveGoldBtn, { backgroundColor: colors.gold }]} onPress={() => handleReceiveShare(lightningAddress)}>
                        <Ionicons name="share-outline" size={18} color={isDark ? colors.bg : "#172331"} />
                        <Text style={[styles.receiveGoldBtnText, { color: isDark ? colors.bg : "#172331" }]}>Share</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {receiveMode === "amount" && (
                  <View style={styles.receiveAmountContent}>
                    <View style={[styles.receiveAmountCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      <View style={styles.receiveAmountInputRow}>
                        <Text style={[styles.receiveAmountCurrency, { color: colors.textMuted }]}>₿</Text>
                        <TextInput
                          testID="receive-amount-input"
                          style={[styles.receiveAmountInput, { color: colors.text }]}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted + "60"}
                          value={receiveAmountInput}
                          onChangeText={(t) => setReceiveAmountInput(t.replace(/[^0-9]/g, ""))}
                          keyboardType="number-pad"
                          inputAccessoryViewID="none"
                          autoFocus
                        />
                        <Text style={[styles.receiveAmountUnit, { color: colors.textMuted }]}>sats</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: colors.border }} />
                      <TextInput
                        style={[styles.receiveDescInput, { color: colors.textSecondary }]}
                        placeholder="Description (optional)"
                        placeholderTextColor={colors.textMuted}
                        value={receiveDescInput}
                        onChangeText={setReceiveDescInput}
                        returnKeyType="done"
                        inputAccessoryViewID="none"
                      />
                    </View>

                    {receiveError ? <Text style={styles.receiveErrorText}>{receiveError}</Text> : null}
                    {receiveGenerating && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator color={colors.gold} size="small" />
                        <Text style={{ fontFamily: "Nunito_400Regular", fontSize: 14, color: colors.textSecondary }}>Generating invoice…</Text>
                      </View>
                    )}

                    <View style={styles.receiveButtonRow}>
                      <Pressable style={[styles.receiveDashedBtn, { borderColor: colors.border }]} onPress={() => setReceiveMode("default")}>
                        <Text style={[styles.receiveDashedBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </Pressable>
                      <Pressable testID="generate-invoice-button" style={[styles.receiveGoldBtn, { backgroundColor: colors.gold }]} onPress={handleReceiveGenerate}>
                        <MaterialCommunityIcons name="lightning-bolt" size={18} color={isDark ? colors.bg : "#172331"} />
                        <Text style={[styles.receiveGoldBtnText, { color: isDark ? colors.bg : "#172331" }]}>Generate</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {receiveMode === "generated" && receiveInvoice && (
                  <View style={styles.receiveGeneratedContent}>
                    <View style={[styles.receiveInvoiceRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      <Text style={{ flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
                        {receiveInvoice.slice(0, 24)}…{receiveInvoice.slice(-8)}
                      </Text>
                      <Pressable onPress={() => handleReceiveCopy(receiveInvoice)} style={{ padding: 4 }}>
                        <Ionicons name={receiveCopied ? "checkmark" : "copy-outline"} size={16} color={receiveCopied ? "#2DC653" : colors.textMuted} />
                      </Pressable>
                    </View>

                    {receiveAmountInput && (
                      <Text style={{ fontFamily: "Nunito_600SemiBold", fontSize: 15, color: colors.text }}>
                        Requesting {parseInt(receiveAmountInput).toLocaleString()} sats
                      </Text>
                    )}

                    <View style={styles.receiveButtonRow}>
                      <Pressable style={[styles.receiveDashedBtn, { borderColor: colors.border }]} onPress={() => handleReceiveCopy(receiveInvoice)}>
                        <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
                        <Text style={[styles.receiveDashedBtnText, { color: colors.textSecondary }]}>Copy</Text>
                      </Pressable>
                      <Pressable style={[styles.receiveGoldBtn, { backgroundColor: colors.gold }]} onPress={() => handleReceiveShare(receiveInvoice)}>
                        <Ionicons name="share-outline" size={18} color={isDark ? colors.bg : "#172331"} />
                        <Text style={[styles.receiveGoldBtnText, { color: isDark ? colors.bg : "#172331" }]}>Share</Text>
                      </Pressable>
                    </View>

                    <Pressable onPress={resetReceiveState} style={{ paddingVertical: 8 }}>
                      <Text style={{ fontFamily: "Nunito_500Medium", fontSize: 14, color: colors.textMuted }}>New Invoice</Text>
                    </Pressable>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                      <Text style={{ fontFamily: "Nunito_400Regular", fontSize: 12, color: colors.textMuted }}>Expires in 1 hour</Text>
                    </View>
                  </View>
                )}
                </View>
              </Animated.View>
              </GestureDetector>
            </KeyboardAvoidingView>
          </View>
        </View>
      )}

      {/* Celebration overlay */}
      {celebration && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCelebration(null)}>
          <Pressable style={styles.celebrationOverlay} onPress={() => setCelebration(null)} testID="celebration-overlay">
            <Animated.View entering={FadeInDown.springify().damping(15)} style={styles.celebrationContent}>
              <View style={styles.celebrationBell}>
                <Ionicons name="notifications" size={36} color="#FBBF24" />
              </View>
              <Text style={styles.celebrationTitle}>Coins Aboard!</Text>
              <View style={styles.celebrationAmountRow}>
                <Text style={styles.celebrationAmount}>+{formatSats(celebration.amount)}</Text>
                <Text style={styles.celebrationSats}>sats</Text>
              </View>
              <Text style={styles.celebrationDesc}>{celebration.description}</Text>
              <Text style={styles.celebrationDismiss}>Tap anywhere to dismiss</Text>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  backupBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingLeft: 12, paddingRight: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  backupText: {
    fontFamily: "Nunito_700Bold", fontSize: 12,
    color: "rgba(251,147,60,0.7)", letterSpacing: 1.5, textTransform: "uppercase",
  },

  balanceSection: {
    alignItems: "center", justifyContent: "center",
    flex: 1, minHeight: SCREEN_HEIGHT * 0.25, paddingHorizontal: 24,
  },
  balanceCenter: { alignItems: "center" },
  balanceRow: {
    flexDirection: "row", alignItems: "baseline", gap: 6,
  },
  btcSymbol: { fontFamily: "Chewy_400Regular" },
  fiatSymbol: { fontFamily: "Chewy_400Regular" },
  balanceText: { fontFamily: "Chewy_400Regular", letterSpacing: -1 },
  subBalance: { fontFamily: "Nunito_700Bold", fontSize: 14, marginTop: 12, opacity: 0.8 },

  actionRow: { flexDirection: "row", gap: 16, paddingHorizontal: 24, marginBottom: 24 },
  actionCard: {
    flex: 1, borderRadius: 24, paddingVertical: 16,
    alignItems: "center", gap: 12, borderWidth: 1, overflow: "hidden",
  },
  actionIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  actionLabel: { fontFamily: "Nunito_700Bold", fontSize: 18 },

  txPanelOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 40, borderTopRightRadius: 40,
    paddingHorizontal: 24, paddingTop: 24,
    overflow: "hidden",
    zIndex: 10,
  },
  txHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  txHeaderText: { fontFamily: "Nunito_700Bold", fontSize: 18, flex: 1 },
  txList: { gap: 4, paddingBottom: 8 },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 4 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  emptySubtitle: { fontFamily: "Nunito_400Regular", fontSize: 14, marginTop: 4 },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },

  txDetailSheet: {
    borderTopLeftRadius: 40, borderTopRightRadius: 40,
    paddingTop: 16, paddingHorizontal: 24,
  },
  sheetHandle: { width: 48, height: 6, borderRadius: 3, alignSelf: "center", marginTop: 16, marginBottom: 20 },
  txDetailContent: { alignItems: "center", paddingBottom: 48 },
  txDetailIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  txDetailAmountRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  txDetailAmount: { fontFamily: "Chewy_400Regular", fontSize: 36 },
  txDetailSats: { fontFamily: "Nunito_400Regular", fontSize: 24 },
  txDetailDate: { fontFamily: "Nunito_400Regular", fontSize: 14, marginBottom: 8 },
  pendingBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
    borderWidth: 1, marginBottom: 16, width: "100%",
  },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, width: "100%",
  },
  detailLabel: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  detailValue: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  memoSection: { paddingVertical: 12, borderBottomWidth: 1, width: "100%", gap: 8 },
  memoInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "Nunito_400Regular", fontSize: 14 },
  hashSection: { paddingVertical: 12, width: "100%", gap: 4 },
  hashText: { fontFamily: "Nunito_400Regular", fontSize: 11 },

  receiveSheet: {
    borderTopLeftRadius: 40, borderTopRightRadius: 40,
    paddingHorizontal: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
  },
  receiveDragZone: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 16,
  },
  receiveTitle: { fontFamily: "Chewy_400Regular", fontSize: 30, textAlign: "center", marginTop: 8, marginBottom: 16 },
  receiveScrollContent: { alignItems: "center", paddingBottom: 20 },
  receiveQrContainer: {
    backgroundColor: "#FFFFFF", borderRadius: 16,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  receiveQrOverlay: {
    position: "absolute", flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  receiveQrText: { fontFamily: "Nunito_700Bold", fontSize: 13, color: "#0B1426" },
  receiveQrBadgeRow: { flexDirection: "row", gap: 3 },
  receiveQrBadge: { width: 20, height: 20, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  receiveQrBadgeText: { fontSize: 11 },

  receiveDefaultContent: { width: "100%", alignItems: "center", gap: 10 },
  receiveAddressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  receiveAddressText: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: "#EAB308" },
  receiveAddressLabel: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  receiveProtocolRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  receiveProtocolBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  receiveInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  receiveInfoText: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  receiveButtonRow: { flexDirection: "row", gap: 12, width: "100%", marginTop: 16 },
  receiveDashedBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed",
  },
  receiveDashedBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 15 },
  receiveGoldBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  receiveGoldBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15 },

  receiveAmountContent: { width: "100%", alignItems: "center", gap: 12 },
  receiveAmountCard: { width: "100%", borderRadius: 20, overflow: "hidden", borderWidth: 1 },
  receiveAmountInputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24, gap: 8 },
  receiveAmountCurrency: { fontFamily: "Nunito_400Regular", fontSize: 32 },
  receiveAmountInput: { flex: 1, fontFamily: "Nunito_700Bold", fontSize: 44, textAlign: "center", letterSpacing: -2 },
  receiveAmountUnit: { fontFamily: "Nunito_400Regular", fontSize: 16 },
  receiveDescInput: { padding: 16, fontFamily: "Nunito_400Regular", fontSize: 15 },
  receiveErrorText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#E63946", textAlign: "center" },

  receiveGeneratedContent: { width: "100%", alignItems: "center", gap: 12 },
  receiveInvoiceRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, width: "100%",
  },

  celebrationOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  celebrationContent: { alignItems: "center", paddingHorizontal: 32 },
  celebrationBell: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(251,191,36,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
    borderWidth: 2, borderColor: "rgba(251,191,36,0.3)",
  },
  celebrationTitle: {
    fontFamily: "Chewy_400Regular", fontSize: 36, color: "#FFFFFF", marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  celebrationAmountRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 12 },
  celebrationAmount: {
    fontFamily: "Chewy_400Regular", fontSize: 60, color: "#FBBF24",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  celebrationSats: { fontFamily: "Nunito_700Bold", fontSize: 24, color: "rgba(251,191,36,0.8)", marginBottom: 8 },
  celebrationDesc: { fontFamily: "Nunito_500Medium", fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 32 },
  celebrationDismiss: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "rgba(255,255,255,0.3)" },
});
