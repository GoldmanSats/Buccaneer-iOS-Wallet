import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/contexts/SettingsContext";

const appIconSource = require("@/assets/images/app-icon.png");

const { width, height } = Dimensions.get("window");

const GOLD = "#c9a24d";
const NAVY = "#0B1426";
const NAVY2 = "#151f35";

function GalleonSVG() {
  return (
    <View style={galleonStyles.container}>
      <View style={galleonStyles.moonGlow} />
      <View style={galleonStyles.moon} />
      <View style={galleonStyles.mast} />
      <View style={galleonStyles.crossBeam} />
      <View style={galleonStyles.sail1} />
      <View style={galleonStyles.sail2} />
      <View style={galleonStyles.flagPole} />
      <View style={galleonStyles.flag} />
      <View style={galleonStyles.hull} />
      <View style={galleonStyles.hullBottom} />
      <View style={[galleonStyles.cannonPort, { left: 30 }]} />
      <View style={[galleonStyles.cannonPort, { left: 55 }]} />
      <View style={[galleonStyles.cannonPort, { left: 80 }]} />
      <View style={[galleonStyles.wave, { bottom: 0 }]} />
      <View style={[galleonStyles.wave, { bottom: -4, opacity: 0.5, width: 180 }]} />
    </View>
  );
}

const galleonStyles = StyleSheet.create({
  container: { width: 200, height: 200, alignItems: "center", justifyContent: "center", position: "relative" },
  moonGlow: { position: "absolute", top: 10, right: 20, width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(201, 162, 77, 0.15)" },
  moon: { position: "absolute", top: 20, right: 30, width: 50, height: 50, borderRadius: 25, backgroundColor: GOLD, opacity: 0.8 },
  mast: { position: "absolute", top: 40, left: "50%", marginLeft: -2, width: 4, height: 100, backgroundColor: GOLD, borderRadius: 2 },
  crossBeam: { position: "absolute", top: 65, left: "50%", marginLeft: -40, width: 80, height: 3, backgroundColor: GOLD, borderRadius: 2 },
  sail1: { position: "absolute", top: 68, left: "50%", marginLeft: -35, width: 70, height: 55, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, transform: [{ skewX: "3deg" }] },
  sail2: { position: "absolute", top: 44, left: "50%", marginLeft: -20, width: 40, height: 25, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 3 },
  flagPole: { position: "absolute", top: 32, left: "50%", marginLeft: -1, width: 2, height: 12, backgroundColor: GOLD },
  flag: { position: "absolute", top: 32, left: "50%", marginLeft: 2, width: 18, height: 10, backgroundColor: "#E63946", borderRadius: 1 },
  hull: { position: "absolute", bottom: 28, left: "50%", marginLeft: -60, width: 120, height: 40, backgroundColor: "#1E3A5F", borderRadius: 8, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 2, borderColor: GOLD },
  hullBottom: { position: "absolute", bottom: 20, left: "50%", marginLeft: -50, width: 100, height: 15, backgroundColor: "#0D2240", borderRadius: 8, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  cannonPort: { position: "absolute", bottom: 42, width: 10, height: 7, backgroundColor: "#0B1426", borderRadius: 2, borderWidth: 1, borderColor: GOLD },
  wave: { position: "absolute", bottom: 12, left: "50%", marginLeft: -70, width: 140, height: 12, backgroundColor: "#1E5F74", borderRadius: 6, opacity: 0.7 },
});

type Screen = "welcome" | "restore" | "loading";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { updateSettings } = useSettings();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [seedInput, setSeedInput] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  const scale = useSharedValue(1);
  const bobbing = useSharedValue(0);

  React.useEffect(() => {
    bobbing.value = withRepeat(withTiming(8, { duration: 2000 }), -1, true);
  }, []);

  const bobbingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bobbing.value }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleStart = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });

    setScreen("loading");
    setIsInitializing(true);

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/wallet/status`);
      await res.json();
    } catch (_e) {}

    setTimeout(async () => {
      await updateSettings({ onboardingDone: true });
      router.replace("/(tabs)");
    }, 2000);
  };

  const handleRestore = async () => {
    const words = seedInput.trim().split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) {
      setRestoreError("Enter 12 or 24 seed words separated by spaces");
      return;
    }
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setScreen("loading");
    setIsInitializing(true);

    setTimeout(async () => {
      await updateSettings({ onboardingDone: true, backupCompleted: true });
      router.replace("/(tabs)");
    }, 2000);
  };

  if (screen === "loading") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={[NAVY, NAVY2, "#0A1020"]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContent}>
          <Animated.View style={[styles.logoContainer, bobbingStyle]}>
            <Image source={appIconSource} style={styles.appIcon} />
          </Animated.View>
          <Text style={styles.loadingTitle}>Setting Sail...</Text>
          <Text style={styles.loadingSubtitle}>Initializing your wallet</Text>
          <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  if (screen === "restore") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={[NAVY, NAVY2, "#0A1020"]} style={StyleSheet.absoluteFill} />
        <View style={styles.restoreContent}>
          <View style={styles.restoreHeader}>
            <Pressable onPress={() => setScreen("welcome")} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#8FA3C8" />
            </Pressable>
            <Text style={styles.restoreTitle}>Restore Wallet</Text>
          </View>

          <View style={styles.restoreIcon}>
            <MaterialCommunityIcons name="key-variant" size={40} color={GOLD} />
          </View>

          <Text style={styles.restoreSubtitle}>
            Enter your 12 or 24 seed words to restore your wallet
          </Text>

          <TextInput
            style={styles.seedTextArea}
            value={seedInput}
            onChangeText={(t) => { setSeedInput(t); setRestoreError(""); }}
            placeholder="Enter seed words separated by spaces..."
            placeholderTextColor="#4A6080"
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {restoreError ? <Text style={styles.restoreError}>{restoreError}</Text> : null}

          <Text style={styles.wordCount}>
            {seedInput.trim().split(/\s+/).filter(Boolean).length} / 12 words
          </Text>

          <Pressable style={styles.restoreBtn} onPress={handleRestore}>
            <LinearGradient
              colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.restoreBtnGradient}
            >
              <MaterialCommunityIcons name="restore" size={20} color={NAVY} />
              <Text style={styles.restoreBtnText}>Restore Wallet</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <LinearGradient colors={[NAVY, NAVY2, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {[...Array(20)].map((_, i) => (
        <View
          key={i}
          style={[
            styles.star,
            {
              top: Math.sin(i * 1.3) * 0.3 * height + height * 0.1,
              left: Math.cos(i * 0.9) * 0.4 * width + width * 0.3,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              opacity: 0.4 + (i % 5) * 0.1,
            },
          ]}
        />
      ))}

      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, bobbingStyle]}>
          <Image source={appIconSource} style={styles.appIcon} />
        </Animated.View>

        <View style={styles.titleGroup}>
          <Text style={styles.appName}>Buccaneer</Text>
          <Text style={styles.appSubtitle}>Wallet</Text>
          <Text style={styles.tagline}>Sail the Lightning seas</Text>
        </View>

        <View style={styles.features}>
          {[
            { icon: "flash", label: "Instant Lightning payments" },
            { icon: "shield-checkmark", label: "Your keys, your treasure" },
            { icon: "globe", label: "Send to any wallet, anywhere" },
          ].map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={16} color={GOLD} />
              </View>
              <Text style={styles.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>

        <Animated.View style={[styles.buttonWrap, buttonStyle]}>
          <Pressable testID="start-voyage-button" style={styles.button} onPress={handleStart}>
            <LinearGradient
              colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <MaterialCommunityIcons name="anchor" size={22} color={NAVY} />
              <Text style={styles.buttonText}>Start Your Voyage</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Pressable onPress={() => setScreen("restore")} style={styles.restoreLink}>
          <MaterialCommunityIcons name="key-variant" size={16} color="#8FA3C8" />
          <Text style={styles.restoreLinkText}>Restore from Backup</Text>
        </Pressable>

        <Text style={styles.disclaimer}>Mainnet Bitcoin · Real sats · No frills</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  star: { position: "absolute", backgroundColor: "#FFFFFF", borderRadius: 2 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 28,
  },
  logoContainer: { alignItems: "center", justifyContent: "center" },
  appIcon: { width: 180, height: 180, borderRadius: 36 },
  titleGroup: { alignItems: "center", gap: 2 },
  appName: { fontFamily: "Chewy_400Regular", fontSize: 52, color: "#FFFFFF", letterSpacing: 2, lineHeight: 60 },
  appSubtitle: { fontFamily: "Chewy_400Regular", fontSize: 36, color: GOLD, letterSpacing: 4, lineHeight: 40 },
  tagline: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#8FA3C8", marginTop: 8, letterSpacing: 1 },
  features: { gap: 12, width: "100%" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(201,162,77,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#CDDAED" },
  buttonWrap: { width: "100%" },
  button: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  buttonText: { fontFamily: "Nunito_700Bold", fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  restoreLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  restoreLinkText: {
    fontFamily: "Nunito_500Medium",
    fontSize: 14,
    color: "#8FA3C8",
  },
  disclaimer: { fontFamily: "Nunito_400Regular", fontSize: 11, color: "#4A6080", letterSpacing: 0.5 },
  loadingContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingTitle: {
    fontFamily: "Chewy_400Regular",
    fontSize: 36,
    color: "#FFFFFF",
    marginTop: 20,
  },
  loadingSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: "#8FA3C8",
  },
  restoreContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 20,
  },
  restoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: NAVY2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  restoreTitle: {
    fontFamily: "Chewy_400Regular",
    fontSize: 28,
    color: "#FFFFFF",
  },
  restoreIcon: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(201,162,77,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
    marginTop: 20,
  },
  restoreSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: "#8FA3C8",
    textAlign: "center",
    lineHeight: 22,
  },
  seedTextArea: {
    backgroundColor: NAVY2,
    borderRadius: 16,
    padding: 18,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#CDDAED",
    minHeight: 120,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#1E2D50",
    lineHeight: 24,
  },
  restoreError: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: "#E63946",
    textAlign: "center",
  },
  wordCount: {
    fontFamily: "Nunito_500Medium",
    fontSize: 13,
    color: "#4A6080",
    textAlign: "center",
  },
  restoreBtn: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
  },
  restoreBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  restoreBtnText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 17,
    color: NAVY,
  },
});
