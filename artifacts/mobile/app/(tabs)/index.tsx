import React, { useEffect, useCallback, useState, useRef } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/contexts/SettingsContext";
import { useWallet } from "@/contexts/WalletContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";
import Svg, { Circle, Line, G } from "react-native-svg";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const FIAT_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
  AUD: "A$",
  NZD: "NZ$",
  CAD: "C$",
  CHF: "CHF",
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
  tx,
  onPress,
  colors,
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

  const iconBg = isPendingDeposit
    ? "rgba(234,179,8,0.15)"
    : isReceive
    ? colors.receiveIconBg
    : colors.sendIconBg;
  const iconColor = isPendingDeposit
    ? "#EAB308"
    : isReceive
    ? colors.teal
    : colors.coral;
  const amountColor = isPendingDeposit
    ? "#EAB308"
    : isReceive
    ? colors.tealDark
    : colors.coralDark;

  return (
    <Pressable
      style={({ pressed }) => [
        txStyles.row,
        { borderBottomColor: colors.border + "40" },
        pressed && { opacity: 0.7, backgroundColor: colors.bgCard + "60" },
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
          name={isReceive ? "arrow-down-outline" : "arrow-up-outline"}
          size={20}
          color={iconColor}
          style={{ transform: [{ rotate: isReceive ? "-45deg" : "45deg" }] }}
        />
      </View>

      <View style={txStyles.meta}>
        <Text
          style={[
            txStyles.desc,
            { color: isPendingDeposit ? "#EAB308" : colors.text },
          ]}
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <Text style={[txStyles.time, { color: colors.textMuted }]}>
          {isPendingDeposit ? "Waiting for confirmation..." : formatDate(tx.timestamp)}
        </Text>
      </View>

      <View style={txStyles.amountCol}>
        <Text style={[txStyles.amount, { color: amountColor }]}>
          {isReceive ? "+" : "-"}
          {formatSats(tx.amountSats)} sats
        </Text>
        <View style={txStyles.statusRow}>
          {(tx.feeSats ?? 0) > 0 && (
            <Text style={[txStyles.feeText, { color: colors.textMuted }]}>
              Fee: {tx.feeSats}
            </Text>
          )}
          {isPendingDeposit ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="reload" size={8} color="#EAB308" />
              <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#EAB308" }}>PENDING</Text>
            </View>
          ) : tx.status === "completed" ? (
            <Ionicons name="checkmark-circle" size={12} color={colors.green} />
          ) : tx.status === "pending" ? (
            <Ionicons name="reload" size={12} color="#EAB308" />
          ) : tx.status === "failed" ? (
            <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: colors.red }}>FAILED</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
    borderBottomWidth: 0,
    gap: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EAB308",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  meta: { flex: 1, gap: 2 },
  desc: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  time: { fontFamily: "Inter_400Regular", fontSize: 12 },
  amountCol: { alignItems: "flex-end", gap: 2 },
  amount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeText: { fontFamily: "Inter_400Regular", fontSize: 10 },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { settings, isLoading: settingsLoading, toggleBalanceHidden, toggleDisplayMode } = useSettings();
  const {
    balance,
    transactions,
    btcPrice,
    isBalanceLoading,
    isTransactionsLoading,
    refetchBalance,
    refetchTransactions,
    updateMemo,
  } = useWallet();

  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TxType | null>(null);
  const [editingMemo, setEditingMemo] = useState("");
  const [celebration, setCelebration] = useState<{ amount: number; description: string } | null>(null);

  const colors = MIDNIGHT;

  useEffect(() => {
    if (!settingsLoading && !settings.onboardingDone) {
      router.replace("/onboarding");
    }
  }, [settingsLoading, settings.onboardingDone]);

  const balanceScale = useSharedValue(1);
  const balanceAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: balanceScale.value }],
  }));

  const handleBalanceTap = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    balanceScale.value = withSpring(0.95, {}, () => {
      balanceScale.value = withSpring(1);
    });
    await toggleBalanceHidden();
  };

  const handleTxPress = (tx: TxType) => {
    setSelectedTx(tx);
    setEditingMemo(tx.memo || "");
  };

  const handleSaveMemo = async () => {
    if (!selectedTx) return;
    try {
      await updateMemo(selectedTx.id, editingMemo);
    } catch {}
    setSelectedTx(null);
  };

  const refreshing = isBalanceLoading || isTransactionsLoading;
  const onRefresh = useCallback(() => {
    refetchBalance();
    refetchTransactions();
  }, [refetchBalance, refetchTransactions]);

  const sats = balance?.balanceSats ?? 0;
  const isFiatPrimary = settings.primaryDisplay === "fiat";
  const fiatCurrency = settings.fiatCurrency ?? "USD";
  const isBackedUp = settings.backupCompleted;
  const fiatSymbol = FIAT_SYMBOLS[fiatCurrency] || "$";
  const fiatAmount = btcPrice ? (sats / 100_000_000) * btcPrice.price : 0;
  const hasFiatPrice = !!btcPrice;

  const prevTxCountRef = useRef(transactions.length);
  useEffect(() => {
    if (transactions.length > prevTxCountRef.current) {
      const newTxs = transactions.slice(0, transactions.length - prevTxCountRef.current);
      const receivedTxs = newTxs.filter((tx: any) => tx.type === "receive" && tx.status === "completed");
      if (receivedTxs.length > 0) {
        const totalAmount = receivedTxs.reduce((sum: number, tx: any) => sum + (tx.amountSats || 0), 0);
        const desc = receivedTxs.length > 1
          ? `${receivedTxs.length} incoming payments`
          : (receivedTxs[0] as any).description || "Incoming payment";
        setCelebration({ amount: totalAmount, description: desc });
        setTimeout(() => setCelebration(null), 5500);
      }
    }
    prevTxCountRef.current = transactions.length;
  }, [transactions]);

  const formatted = formatSats(sats);
  const digitCount = formatted.replace(/,/g, "").length;
  const balanceFontSize = digitCount <= 3 ? 64 : digitCount <= 5 ? 52 : digitCount <= 7 ? 44 : 36;
  const symbolFontSize = digitCount <= 5 ? 24 : digitCount <= 7 ? 20 : 18;

  const topPad = insets.top + 8;
  const bottomPad = insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
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
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.border + "80",
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons name="shield-outline" size={14} color="#FB923C" />
              <Text style={styles.backupText}>Backup!</Text>
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
                    <Text style={[styles.fiatSymbol, { color: colors.text, fontSize: 32 }]}>
                      {fiatSymbol}
                    </Text>
                    <Text
                      style={[
                        styles.balanceText,
                        { color: colors.text, fontSize: 64 },
                      ]}
                    >
                      {settings.balanceHidden
                        ? "•••"
                        : hasFiatPrice
                        ? fiatAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
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
                        { color: colors.text, fontSize: symbolFontSize },
                      ]}
                    >
                      ₿
                    </Text>
                    <Text
                      style={[
                        styles.balanceText,
                        { color: colors.text, fontSize: balanceFontSize },
                      ]}
                    >
                      {settings.balanceHidden ? "•••" : formatted}
                    </Text>
                  </View>
                  <Text style={[styles.subBalance, { color: colors.textMuted }]}>
                    {settings.balanceHidden
                      ? "Tap to reveal"
                      : hasFiatPrice
                      ? `≈ ${fiatSymbol}${fiatAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ${fiatCurrency}`
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
            onPress={async () => {
              if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/receive");
            }}
            style={({ pressed }) => [
              styles.actionCard,
              {
                backgroundColor: colors.receiveBg,
                borderColor: colors.border + "80",
              },
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: colors.receiveIconBg }]}>
              <Ionicons
                name="arrow-down-outline"
                size={24}
                color={colors.teal}
                style={{ transform: [{ rotate: "-45deg" }] }}
              />
            </View>
            <Text style={[styles.actionLabel, { color: colors.teal }]}>Receive</Text>
          </Pressable>

          <Pressable
            testID="send-button"
            onPress={async () => {
              if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/send");
            }}
            style={({ pressed }) => [
              styles.actionCard,
              {
                backgroundColor: colors.sendBg,
                borderColor: colors.border + "80",
              },
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: colors.sendIconBg }]}>
              <Ionicons
                name="arrow-up-outline"
                size={24}
                color={colors.coral}
                style={{ transform: [{ rotate: "45deg" }] }}
              />
            </View>
            <Text style={[styles.actionLabel, { color: colors.coral }]}>Send</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.txPanel,
            {
              backgroundColor: colors.bgCard + "CC",
              borderTopColor: colors.border,
              minHeight: isLogExpanded ? SCREEN_HEIGHT - 120 : 240,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsLogExpanded(!isLogExpanded);
            }}
            style={styles.txHeaderRow}
          >
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.txHeaderText, { color: colors.textSecondary }]}>Transaction Log</Text>
          </Pressable>

          <View style={styles.txList}>
            {transactions.length === 0 ? (
              <View style={styles.emptyState}>
                {!isTransactionsLoading ? (
                  <>
                    <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                      No transactions yet
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                      Your voyage log is empty
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    Loading plunder…
                  </Text>
                )}
              </View>
            ) : (
              transactions.map((tx: any) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx as TxType}
                  onPress={handleTxPress}
                  colors={colors}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedTx}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTx(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedTx(null)} />
          <View
            style={[
              styles.txDetailSheet,
              { backgroundColor: colors.bg, paddingBottom: bottomPad + 12 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted + "40" }]} />

            {selectedTx && (() => {
              const isReceive = selectedTx.type === "receive";
              const isPendingDeposit = selectedTx.status === "pending" && selectedTx.method === "deposit";
              const iconBg = isPendingDeposit
                ? "rgba(234,179,8,0.15)"
                : isReceive
                ? colors.receiveIconBg
                : colors.sendIconBg;
              const iconColor = isPendingDeposit
                ? "#EAB308"
                : isReceive
                ? colors.teal
                : colors.coral;

              return (
                <View style={styles.txDetailContent}>
                  <View style={[styles.txDetailIcon, { backgroundColor: iconBg }]}>
                    <Ionicons
                      name={isReceive ? "arrow-down-outline" : "arrow-up-outline"}
                      size={40}
                      color={iconColor}
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
                        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#EAB308" }}>
                          Waiting for on-chain confirmation
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#EAB308", opacity: 0.8 }}>
                          Your sats are on the way. This typically takes 10-30 minutes.
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={[styles.detailRow, { borderBottomColor: colors.border + "80" }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {selectedTx.status === "completed" && <Ionicons name="checkmark-circle" size={16} color={colors.green} />}
                      {selectedTx.status === "pending" && <Ionicons name="reload" size={16} color="#EAB308" />}
                      <Text
                        style={[
                          styles.detailValue,
                          {
                            color:
                              selectedTx.status === "completed" ? colors.green :
                              selectedTx.status === "pending" ? "#EAB308" :
                              selectedTx.status === "failed" ? colors.red : colors.text,
                          },
                        ]}
                      >
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
                        style={[
                          styles.memoInput,
                          {
                            backgroundColor: colors.bgElevated,
                            color: colors.text,
                            borderColor: colors.border + "60",
                          },
                        ]}
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
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                        {isPendingDeposit ? "Transaction ID" : "Payment Hash"}
                      </Text>
                      <Text
                        style={[styles.hashText, { color: colors.text + "80" }]}
                        selectable
                      >
                        {selectedTx.paymentHash}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>

      {celebration && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCelebration(null)}>
          <Pressable
            style={styles.celebrationOverlay}
            onPress={() => setCelebration(null)}
            testID="celebration-overlay"
          >
            <Animated.View entering={FadeInDown.springify().damping(15)} style={styles.celebrationContent}>
              <Text style={styles.celebrationEmoji}>🏴‍☠️</Text>
              <Text style={styles.celebrationTitle}>Treasure Received!</Text>
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
    paddingBottom: 8,
    marginBottom: 8,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  backupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  backupText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#FB923C",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  balanceSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    minHeight: 160,
  },
  balanceCenter: {
    alignItems: "center",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  btcSymbol: {
    fontFamily: "Chewy_400Regular",
    marginBottom: 4,
  },
  fiatSymbol: {
    fontFamily: "Chewy_400Regular",
    marginBottom: 4,
  },
  balanceText: {
    fontFamily: "Chewy_400Regular",
    letterSpacing: -1,
    lineHeight: undefined,
  },
  subBalance: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
  },

  actionRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  actionCard: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 20,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },

  txPanel: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderTopWidth: 1,
    marginHorizontal: -0,
    paddingHorizontal: 24,
    paddingTop: 28,
    flex: 1,
  },
  txHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  txHeaderText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    flex: 1,
  },
  txList: {
    flex: 1,
    gap: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  txDetailSheet: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 20,
  },
  txDetailContent: {
    alignItems: "center",
  },
  txDetailIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  txDetailAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  txDetailAmount: {
    fontFamily: "Chewy_400Regular",
    fontSize: 36,
  },
  txDetailSats: {
    fontFamily: "Inter_400Regular",
    fontSize: 20,
  },
  txDetailDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginBottom: 16,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    width: "100%",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    width: "100%",
  },
  detailLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  detailValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  memoSection: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    width: "100%",
    gap: 8,
  },
  memoInput: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    borderWidth: 1,
  },
  hashSection: {
    paddingVertical: 14,
    width: "100%",
    gap: 4,
  },
  hashText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },

  celebrationOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  celebrationContent: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  celebrationEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  celebrationTitle: {
    fontFamily: "Chewy_400Regular",
    fontSize: 36,
    color: "#FFFFFF",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  celebrationAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  celebrationAmount: {
    fontFamily: "Chewy_400Regular",
    fontSize: 56,
    color: "#FBBF24",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  celebrationSats: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "rgba(251,191,36,0.8)",
    marginBottom: 8,
  },
  celebrationDesc: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 32,
  },
  celebrationDismiss: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  },
});
