import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Share,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useSettings } from "@/contexts/SettingsContext";

const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const GOLD = "#c9a24d";
const LIGHTNING_ADDRESS = "buccaneeradiciw@breez.tips";

// QR code for the lightning address (static)
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=lightning%3A${encodeURIComponent(LIGHTNING_ADDRESS)}&color=FFFFFF&bgcolor=111D35&qzone=2`;

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [copied, setCopied] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleCopy = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Clipboard.setStringAsync(settings.lightningAddress || LIGHTNING_ADDRESS);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Pay me on Lightning: ${settings.lightningAddress || LIGHTNING_ADDRESS}`,
        title: "Buccaneer Wallet - Lightning Address",
      });
    } catch (_e) {}
  };

  const addr = settings.lightningAddress || LIGHTNING_ADDRESS;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIndicator} />
      </View>

      {/* Top Nav */}
      <View style={styles.topNav}>
        <Pressable onPress={() => router.back()} testID="receive-back-button">
          <Ionicons name="chevron-down" size={28} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.pageTitle}>Receive</Text>
        <View style={{ width: 28 }} />
      </View>

      <Animated.View entering={FadeIn.duration(400)} style={[styles.content, { paddingBottom: bottomPad + 20 }]}>
        {/* QR Card */}
        <View style={styles.qrCard}>
          <Image
            source={{ uri: QR_URL }}
            style={styles.qrImage}
            resizeMode="contain"
          />

          {/* Buccaneer logo badge over QR */}
          <View style={styles.qrBadge}>
            <LinearGradient
              colors={["#111D35", "#0B1426"]}
              style={styles.qrBadgeInner}
            >
              <Text style={styles.qrBadgeText}>Buccaneer</Text>
              <MaterialCommunityIcons name="lightning-bolt" size={14} color={GOLD} />
            </LinearGradient>
          </View>
        </View>

        {/* Address */}
        <Pressable testID="copy-address-button" onPress={handleCopy} style={styles.addressRow}>
          <Text style={styles.address}>{addr}</Text>
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={18}
            color={copied ? "#2DC653" : GOLD}
          />
        </Pressable>
        <Text style={styles.addressLabel}>Lightning Address · tap to copy</Text>

        {/* Network badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.networkBadge, { backgroundColor: "rgba(74,144,217,0.18)" }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={13} color="#4A90D9" />
            <Text style={[styles.badgeText, { color: "#4A90D9" }]}>Lightning</Text>
          </View>
          <Text style={styles.plus}>+</Text>
          <View style={[styles.networkBadge, { backgroundColor: "rgba(247,147,26,0.18)" }]}>
            <FontAwesome5 name="bitcoin" size={12} color="#F7931A" />
            <Text style={[styles.badgeText, { color: "#F7931A" }]}>On-chain</Text>
          </View>
        </View>

        <Text style={styles.unifiedNote}>
          Unified QR · works with any Bitcoin wallet.
        </Text>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable testID="request-amount-button" style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>Request Amount</Text>
          </Pressable>

          <Pressable
            testID="share-address-button"
            style={styles.goldBtn}
            onPress={handleShare}
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
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: { alignItems: "center", paddingVertical: 10 },
  headerIndicator: {
    width: 40,
    height: 4,
    backgroundColor: "#1E2D50",
    borderRadius: 2,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontFamily: "PirataOne_400Regular",
    fontSize: 30,
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
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
    position: "relative",
  },
  qrImage: {
    width: 260,
    height: 260,
    borderRadius: 12,
  },
  qrBadge: {
    position: "absolute",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GOLD,
  },
  qrBadgeInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  qrBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  address: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: GOLD,
  },
  addressLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#4A6080",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  plus: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#4A6080",
  },
  unifiedNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#4A6080",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#1E2D50",
    alignItems: "center",
  },
  outlineBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#8FA3C8",
  },
  goldBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  goldBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  goldBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: NAVY,
  },
});
