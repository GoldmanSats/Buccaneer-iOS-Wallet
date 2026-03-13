import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  FadeInDown,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/contexts/SettingsContext";
import { useWallet } from "@/contexts/WalletContext";

const GOLD = "#c9a24d";
const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const NAVY_ELEVATED = "#172040";

function formatSats(sats: number): string {
  return sats.toLocaleString();
}

function formatFiat(sats: number, price: number, symbol: string): string {
  const value = (sats / 100_000_000) * price;
  if (value < 0.01) return `${symbol}0.00`;
  return `${symbol}${value.toFixed(2)}`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function truncate(str: string, max: number): string {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

interface TransactionItemProps {
  tx: {
    id: string;
    type: "send" | "receive";
    amountSats: number;
    feeSats: number;
    description: string;
    timestamp: string;
    status: string;
  };
}

function TransactionItem({ tx }: TransactionItemProps) {
  const isSend = tx.type === "send";
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <View style={txStyles.row}>
        <View style={[txStyles.iconBg, { backgroundColor: isSend ? "rgba(231,111,81,0.18)" : "rgba(45,198,83,0.15)" }]}>
          <Ionicons
            name={isSend ? "arrow-up" : "arrow-down"}
            size={18}
            color={isSend ? "#E76F51" : "#2DC653"}
          />
        </View>

        <View style={txStyles.meta}>
          <Text style={txStyles.desc} numberOfLines={1}>
            {truncate(tx.description || (isSend ? "Sent" : "Received"), 38)}
          </Text>
          <Text style={txStyles.time}>{formatTimestamp(tx.timestamp)}</Text>
        </View>

        <View style={txStyles.amountCol}>
          <Text style={[txStyles.amount, { color: isSend ? "#E76F51" : "#2DC653" }]}>
            {isSend ? "-" : "+"}{formatSats(tx.amountSats)}
          </Text>
          <Text style={txStyles.unit}>sats</Text>
          {tx.feeSats > 0 && (
            <View style={txStyles.feeRow}>
              <Text style={txStyles.feeLabel}>Fee: </Text>
              <Text style={txStyles.feeValue}>{tx.feeSats}</Text>
              <Ionicons name="checkmark-circle" size={10} color="#2DC653" style={{ marginLeft: 2 }} />
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30,45,80,0.6)",
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  desc: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#CDDAED",
  },
  time: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#4A6080",
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  amount: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  unit: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#4A6080",
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
  feeLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#4A6080",
  },
  feeValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#4A6080",
  },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { settings, isLoading: settingsLoading } = useSettings();

  // Redirect to onboarding if not done
  useEffect(() => {
    if (!settingsLoading && !settings.onboardingDone) {
      router.replace("/onboarding");
    }
  }, [settingsLoading, settings.onboardingDone]);
  const { balance, transactions, btcPrice, isBalanceLoading, isTransactionsLoading, refetchBalance, refetchTransactions } = useWallet();
  const balanceScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulseOpacity.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
  }, []);

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
  };

  const refreshing = isBalanceLoading || isTransactionsLoading;
  const onRefresh = useCallback(() => {
    refetchBalance();
    refetchTransactions();
  }, [refetchBalance, refetchTransactions]);

  const sats = balance?.balanceSats ?? 0;
  const fiatLabel = btcPrice
    ? formatFiat(sats, btcPrice.price, btcPrice.symbol)
    : null;

  const isBackedUp = settings.backupCompleted;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.container, { backgroundColor: NAVY }]}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GOLD}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header Row */}
            <View style={[styles.header, { paddingTop: topPad + 12 }]}>
              <Pressable
                testID="settings-button"
                onPress={() => router.push("/settings")}
                style={styles.headerIconBtn}
              >
                <MaterialCommunityIcons name="steering" size={24} color="#8FA3C8" />
              </Pressable>

              {!isBackedUp && (
                <Pressable
                  testID="backup-button"
                  onPress={() => router.push("/backup")}
                  style={styles.backupBadge}
                >
                  <LinearGradient
                    colors={["rgba(201,162,77,0.25)", "rgba(160,124,53,0.2)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.backupGradient}
                  >
                    <Ionicons name="shield-outline" size={13} color={GOLD} />
                    <Text style={styles.backupText}>BACKUP!</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>

            {/* Balance Section */}
            <Pressable onPress={handleBalanceTap} testID="balance-display">
              <Animated.View style={[styles.balanceSection, balanceAnimStyle]}>
                <View style={styles.balanceRow}>
                  <Text style={styles.btcSymbol}>₿</Text>
                  <Text style={styles.balanceText}>
                    {isBalanceLoading ? "···" : formatSats(sats)}
                  </Text>
                </View>
                {fiatLabel && (
                  <Text style={styles.fiatText}>≈ {fiatLabel} {btcPrice?.currency}</Text>
                )}
                {!fiatLabel && !isBalanceLoading && (
                  <Text style={styles.fiatText}>Loading price…</Text>
                )}
              </Animated.View>
            </Pressable>

            {/* Send / Receive Buttons */}
            <View style={styles.actionRow}>
              <Pressable
                testID="receive-button"
                style={styles.actionCard}
                onPress={async () => {
                  if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/receive");
                }}
              >
                <LinearGradient
                  colors={["#172040", "#0D1830"]}
                  style={styles.actionGradient}
                >
                  <View style={[styles.actionIcon, { backgroundColor: "rgba(42,157,143,0.2)" }]}>
                    <Ionicons name="arrow-down" size={26} color="#2A9D8F" />
                  </View>
                  <Text style={[styles.actionLabel, { color: "#2A9D8F" }]}>Receive</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                testID="send-button"
                style={styles.actionCard}
                onPress={async () => {
                  if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/send");
                }}
              >
                <LinearGradient
                  colors={["#1F1430", "#150D20"]}
                  style={styles.actionGradient}
                >
                  <View style={[styles.actionIcon, { backgroundColor: "rgba(231,111,81,0.2)" }]}>
                    <Ionicons name="arrow-up" size={26} color="#E76F51" />
                  </View>
                  <Text style={[styles.actionLabel, { color: "#E76F51" }]}>Send</Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Transaction Log Header */}
            <View style={styles.txHeaderRow}>
              <Ionicons name="time-outline" size={16} color={GOLD} />
              <Text style={styles.txHeaderText}>Transaction Log</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !isTransactionsLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="treasure-chest" size={40} color="#243354" />
              <Text style={styles.emptyTitle}>No treasure yet</Text>
              <Text style={styles.emptySubtitle}>Your transactions will appear here</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptySubtitle}>Loading plunder…</Text>
            </View>
          )
        }
        renderItem={({ item }) => <TransactionItem tx={item} />}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: NAVY_CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  backupBadge: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.4)",
  },
  backupGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backupText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: GOLD,
    letterSpacing: 1,
  },
  balanceSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  btcSymbol: {
    fontFamily: "Inter_400Regular",
    fontSize: 32,
    color: "#FFFFFF",
    marginTop: 6,
  },
  balanceText: {
    fontFamily: "Inter_700Bold",
    fontSize: 64,
    color: "#FFFFFF",
    letterSpacing: -2,
    lineHeight: 72,
  },
  fiatText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: "#8FA3C8",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  actionGradient: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  txHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: NAVY_CARD,
    borderTopWidth: 1,
    borderTopColor: "#1E2D50",
  },
  txHeaderText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#8FA3C8",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#4A6080",
  },
});
