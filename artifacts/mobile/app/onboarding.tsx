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
import Svg, { Path, Circle } from "react-native-svg";

const appIconSource = require("@/assets/images/app-icon.png");

const { width, height } = Dimensions.get("window");

const GOLD = "#c9a24d";
const GOLD_LIGHT = "#d4ad5a";
const NAVY = "#0B1426";
const NAVY2 = "#151f35";
const NAVY_BUTTON = "#1a2540";

function LightningIcon({ size = 22, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color} />
    </Svg>
  );
}

function AnchorIcon({ size = 22, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="5" r="2.5" stroke={color} strokeWidth="1.8" fill="none" />
      <Path d="M12 7.5V21M12 21c-4-0.5-7-3.5-7-7h3M12 21c4-0.5 7-3.5 7-7h-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function BitcoinIcon({ size = 22, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9.5 2v2M14.5 2v2M9.5 20v2M14.5 20v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M7 8h8.5a3 3 0 010 6H7V8z" stroke={color} strokeWidth="1.8" fill="none" />
      <Path d="M7 14h9a3 3 0 010 6H7v-6z" stroke={color} strokeWidth="1.8" fill="none" />
    </Svg>
  );
}

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
            <Image source={appIconSource} style={styles.loadingAppIcon} />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <View style={styles.topSection}>
          <Animated.View style={[styles.logoContainer, bobbingStyle]}>
            <Image source={appIconSource} style={styles.appIcon} />
          </Animated.View>

          <Text style={styles.appName}>Buccaneer Wallet</Text>
          <Text style={styles.tagline}>
            The self-custody lightning wallet built{"\n"}for pirates, not saylors.
          </Text>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <LightningIcon size={24} color={GOLD} />
              <Text style={styles.featureLabel}>INSTANT</Text>
            </View>
            <View style={styles.featureDivider} />
            <View style={styles.featureItem}>
              <AnchorIcon size={24} color={GOLD} />
              <Text style={styles.featureLabel}>YOURS</Text>
            </View>
            <View style={styles.featureDivider} />
            <View style={styles.featureItem}>
              <BitcoinIcon size={24} color={GOLD} />
              <Text style={styles.featureLabel}>BTC ONLY</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Animated.View style={[styles.buttonWrap, buttonStyle]}>
            <Pressable testID="start-voyage-button" style={styles.button} onPress={handleStart}>
              <LinearGradient
                colors={[GOLD_LIGHT, GOLD, "#b8922f"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Create New Wallet</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={() => setScreen("restore")}
            style={styles.restoreButton}
          >
            <Text style={styles.restoreButtonText}>Restore from Backup</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  star: { position: "absolute", backgroundColor: "#FFFFFF", borderRadius: 2 },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  topSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 20,
  },
  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  appIcon: { width: 140, height: 140, borderRadius: 28 },
  loadingAppIcon: { width: 180, height: 180, borderRadius: 36 },
  appName: {
    fontFamily: "Chewy_400Regular",
    fontSize: 36,
    color: "#FFFFFF",
    letterSpacing: 1,
    textAlign: "center",
  },
  tagline: {
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#8FA3C8",
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
  },
  features: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 0,
  },
  featureItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  featureLabel: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11,
    color: "#8FA3C8",
    letterSpacing: 1.5,
  },
  featureDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(143,163,200,0.25)",
  },
  bottomSection: {
    paddingBottom: Platform.OS === "ios" ? 40 : 30,
    gap: 12,
  },
  buttonWrap: { width: "100%" },
  button: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
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
  buttonText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 17,
    color: NAVY,
    letterSpacing: 0.3,
  },
  restoreButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(143,163,200,0.2)",
    backgroundColor: NAVY_BUTTON,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreButtonText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 17,
    color: "#CDDAED",
    letterSpacing: 0.3,
  },
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
