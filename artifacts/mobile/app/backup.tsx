import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { useSettings } from "@/contexts/SettingsContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";
import { getSeedFromSecureStore } from "@/utils/breezService";
import { exportMnemonicFromPasskey } from "@/utils/passkeyService";

type Stage = "choose" | "warning" | "seed" | "verify" | "done";

function TreasureMapIcon({ colors }: { colors: typeof MIDNIGHT }) {
  return (
    <View style={iconStyles.container}>
      <View style={[iconStyles.bg, { shadowColor: colors.gold }]}>
        <MaterialCommunityIcons name="map-legend" size={52} color={colors.gold} />
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  bg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(201,162,77,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(201,162,77,0.25)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
});

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;
  const isPasskeyWallet = settings.walletMode === "passkey";
  const [stage, setStage] = useState<Stage>("choose");
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [verifyWord, setVerifyWord] = useState<{ index: number; options: string[] } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const [seedError, setSeedError] = useState<string | null>(null);

  const loadSeedPhrase = async () => {
    if (isPasskeyWallet) {
      const seed = await exportMnemonicFromPasskey(settings.walletLabel ?? undefined);
      return seed;
    }
    return getSeedFromSecureStore();
  };

  const handleWriteDown = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPasskeyWallet) {
      setSeedError(null);
      setStage("warning");
      return;
    }
    await revealSeedPhrase();
  };

  const revealSeedPhrase = async () => {
    setIsLoading(true);
    setSeedError(null);
    try {
      if (isPasskeyWallet && Platform.OS !== "web") {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (compatible && enrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: "Reveal emergency recovery phrase",
            fallbackLabel: "Use Passcode",
          });
          if (!result.success) {
            setSeedError("Face ID confirmation was cancelled. Your recovery phrase stayed hidden.");
            setIsLoading(false);
            return;
          }
        }
      }

      const seed = await loadSeedPhrase();
      if (seed) {
        setSeedWords(seed.split(" "));
      } else {
        setSeedError(
          isPasskeyWallet
            ? "Could not retrieve your emergency recovery phrase. Please try Face ID again."
            : "Could not retrieve your seed phrase. Your wallet may not have been created yet."
        );
        setIsLoading(false);
        return;
      }
    } catch (e: any) {
      setSeedError(
        e?.message ||
          (isPasskeyWallet
            ? "Failed to access your emergency recovery phrase. Please try again."
            : "Failed to access secure storage. Please try again.")
      );
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    setStage("seed");
  };

  const handleContinueToVerify = () => {
    if (seedWords.length < 12) return;
    const idx = Math.floor(Math.random() * 12);
    const correctWord = seedWords[idx]!;
    const wrongWords = ["wallet", "bitcoin", "pirate", "treasure"].filter(w => w !== correctWord).slice(0, 3);
    const opts = [correctWord, ...wrongWords].sort(() => Math.random() - 0.5);
    setVerifyWord({ index: idx, options: opts });
    setStage("verify");
  };

  const handleAnswer = async (word: string) => {
    setSelectedAnswer(word);
    const correct = word === seedWords[verifyWord?.index ?? 0];
    setIsCorrect(correct);
    if (Platform.OS !== "web") {
      if (correct) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
    if (correct) {
      setTimeout(async () => {
        await updateSettings({ backupCompleted: true });
        setStage("done");
      }, 1000);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={styles.header}>
        <Pressable
          testID="backup-back-button"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Choose Stage */}
        {stage === "choose" && (
          <Animated.View entering={FadeIn} style={styles.stageContainer}>
            <TreasureMapIcon colors={colors} />
            <Text style={[styles.stageTitle, { color: colors.text }]}>
              {isPasskeyWallet ? "Emergency Recovery" : "Protect Your Treasure"}
            </Text>
            <Text style={[styles.stageSubtitle, { color: colors.textMuted }]}>
              {isPasskeyWallet
                ? "Your Face ID wallet protects day-to-day access. The recovery phrase is an advanced emergency tool, not something you should open casually."
                : "For now, the only safe backup in Bellamy is writing down your seed phrase by hand."}
            </Text>

            <View style={styles.optionList}>
              <Pressable
                testID="write-down-option"
                style={[styles.optionCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                onPress={handleWriteDown}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <>
                    <View style={[styles.optionIcon, { backgroundColor: "rgba(231,111,81,0.15)" }]}>
                      <MaterialCommunityIcons
                        name={isPasskeyWallet ? "shield-alert-outline" : "pencil"}
                        size={26}
                        color="#E76F51"
                      />
                    </View>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionTitle, { color: colors.text }]}>
                        {isPasskeyWallet ? "Emergency Recovery Phrase" : "Write It Down"}
                      </Text>
                      <Text style={[styles.optionSubtitle, { color: colors.textMuted }]}>
                        {isPasskeyWallet ? "Advanced access to the words behind your Face ID wallet" : "12 secret words, pen & paper"}
                      </Text>
                    </View>
                  </>
                )}
              </Pressable>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[styles.optionIcon, { backgroundColor: "rgba(74,144,217,0.15)" }]}>
                <Ionicons name="cloud-offline-outline" size={26} color="#4A90D9" />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {isPasskeyWallet ? "Keep this hidden unless you truly need it" : "Cloud backup is off"}
                </Text>
                <Text style={[styles.optionSubtitle, { color: colors.textMuted }]}>
                  {isPasskeyWallet
                    ? "Once these words are revealed, your wallet is no longer relying only on Face ID. Only use this for emergency recovery planning."
                    : "We disabled the old cloud backup because it was not strong enough to safely protect your seed phrase."}
                </Text>
              </View>
            </View>

            {seedError && (
              <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
                <Text style={{ color: "#E76F51", fontSize: 14, textAlign: "center", fontFamily: "Nunito_400Regular" }}>{seedError}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {stage === "warning" && (
          <Animated.View entering={FadeInDown} style={styles.stageContainer}>
            <View style={[iconStyles.container]}>
              <View style={[iconStyles.bg, { backgroundColor: "rgba(231,111,81,0.12)", borderColor: "rgba(231,111,81,0.3)" }]}>
                <Ionicons name="warning-outline" size={40} color="#E76F51" />
              </View>
            </View>
            <Text style={[styles.stageTitle, { color: colors.text }]}>Before You Reveal It</Text>
            <Text style={[styles.stageSubtitle, { color: colors.textMuted }]}>
              Your recovery phrase gives full control of this wallet. Only reveal it if you are writing it down for emergency recovery and nobody else can see your screen.
            </Text>

            <View style={styles.warningCard}>
              <Ionicons name="shield-outline" size={18} color={colors.gold} />
              <Text style={styles.warningText}>
                Bellamy will ask for Face ID before showing the phrase when your device supports it.
              </Text>
            </View>

            <Pressable
              testID="reveal-emergency-phrase-button"
              style={styles.goldBtn}
              onPress={revealSeedPhrase}
            >
              <LinearGradient
                colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.goldBtnGradient}
              >
                <Text style={styles.goldBtnText}>I Understand, Reveal It</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              testID="keep-hidden-button"
              style={[styles.secondaryBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setStage("choose")}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Keep It Hidden</Text>
            </Pressable>

            {seedError && (
              <View style={{ marginTop: 4, paddingHorizontal: 16 }}>
                <Text style={{ color: "#E76F51", fontSize: 14, textAlign: "center", fontFamily: "Nunito_400Regular" }}>{seedError}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Seed Stage */}
        {stage === "seed" && (
          <Animated.View entering={FadeInDown} style={styles.stageContainer}>
            <View style={[iconStyles.container]}>
              <View style={[iconStyles.bg, { backgroundColor: "rgba(231,111,81,0.12)", borderColor: "rgba(231,111,81,0.3)" }]}>
                <MaterialCommunityIcons name="eye-off" size={40} color="#E76F51" />
              </View>
            </View>
            <Text style={[styles.stageTitle, { color: colors.text }]}>
              {isPasskeyWallet ? "Emergency Recovery Phrase" : "Your Secret Words"}
            </Text>
            <Text style={[styles.stageSubtitle, { color: colors.textMuted }]}>
              {isPasskeyWallet
                ? "Write these 12 words in order and store them somewhere safe offline. These words can fully restore your Face ID wallet."
                : "Write these 12 words in order. Keep them safe — they unlock your entire wallet."}
            </Text>

            <View style={styles.seedGrid}>
              {seedWords.map((word, i) => (
                <View key={i} style={[styles.seedWord, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.seedIndex, { color: colors.textMuted }]}>{i + 1}</Text>
                  <Text style={[styles.seedText, { color: colors.text }]}>{word}</Text>
                </View>
              ))}
            </View>

            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={18} color={colors.gold} />
              <Text style={styles.warningText}>
                Never share these words with anyone. Bellamy will never ask for them.
              </Text>
            </View>

            <Pressable
              testID="written-down-button"
              style={styles.goldBtn}
              onPress={handleContinueToVerify}
            >
              <LinearGradient
                colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.goldBtnGradient}
              >
                <Text style={styles.goldBtnText}>I've Written Them Down</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Verify Stage */}
        {stage === "verify" && verifyWord && (
          <Animated.View entering={FadeInDown} style={styles.stageContainer}>
            <View style={[iconStyles.container]}>
              <View style={[iconStyles.bg]}>
                <MaterialCommunityIcons name="help-circle" size={40} color={colors.gold} />
              </View>
            </View>
            <Text style={[styles.stageTitle, { color: colors.text }]}>Verify Your Backup</Text>
            <Text style={[styles.stageSubtitle, { color: colors.textMuted }]}>
              What is word #{(verifyWord.index + 1)} of your seed phrase?
            </Text>

            <View style={styles.verifyOptions}>
              {verifyWord.options.map((word) => {
                const isSelected = selectedAnswer === word;
                const isWrong = isSelected && isCorrect === false;
                const isRight = isSelected && isCorrect === true;
                return (
                  <Pressable
                    key={word}
                    style={[
                      styles.verifyOption,
                      { backgroundColor: colors.bgCard, borderColor: colors.border },
                      isRight && { borderColor: "#2DC653", backgroundColor: "rgba(45,198,83,0.1)" },
                      isWrong && { borderColor: "#E63946", backgroundColor: "rgba(230,57,70,0.1)" },
                    ]}
                    onPress={() => !selectedAnswer && handleAnswer(word)}
                  >
                    <Text style={[
                      styles.verifyOptionText,
                      { color: colors.text },
                      isRight && { color: "#2DC653" },
                      isWrong && { color: "#E63946" },
                    ]}>
                      {word}
                    </Text>
                    {isRight && <Ionicons name="checkmark-circle" size={20} color="#2DC653" />}
                    {isWrong && <Ionicons name="close-circle" size={20} color="#E63946" />}
                  </Pressable>
                );
              })}
            </View>

            {isCorrect === false && (
              <Pressable
                style={styles.retryBtn}
                onPress={() => { setSelectedAnswer(null); setIsCorrect(null); }}
              >
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* Done Stage */}
        {stage === "done" && (
          <Animated.View entering={FadeIn} style={styles.stageContainer}>
            <View style={[iconStyles.container]}>
              <View style={[iconStyles.bg, { backgroundColor: "rgba(45,198,83,0.12)", borderColor: "rgba(45,198,83,0.3)" }]}>
                <Ionicons name="shield-checkmark" size={48} color="#2DC653" />
              </View>
            </View>
            <Text style={[styles.stageTitle, { color: colors.text }]}>Treasure Secured!</Text>
            <Text style={[styles.stageSubtitle, { color: colors.textMuted }]}>
              Your wallet is backed up. Your sats are safe, Captain.
            </Text>
            <Pressable
              testID="backup-done-button"
              style={styles.goldBtn}
              onPress={() => router.back()}
            >
              <LinearGradient
                colors={["#d4ad5a", "#c9a24d", "#a07c35"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.goldBtnGradient}
              >
                <Text style={styles.goldBtnText}>Back to the Ship</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 20 },
  stageContainer: { alignItems: "center", gap: 20 },
  stageTitle: {
    fontFamily: "Chewy_400Regular",
    fontSize: 34,
    color: "#FFFFFF",
    textAlign: "center",
  },
  stageSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: "#8FA3C8",
    textAlign: "center",
    lineHeight: 22,
  },
  optionList: { width: "100%", gap: 12 },
  infoCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { flex: 1, gap: 3 },
  optionTitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  optionSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: "#4A6080",
  },
  seedGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  seedWord: {
    width: "30%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  seedIndex: {
    fontFamily: "Nunito_500Medium",
    fontSize: 11,
    color: "#4A6080",
    minWidth: 16,
  },
  seedText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
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
  warningText: {
    flex: 1,
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: "#CDDAED",
    lineHeight: 20,
  },
  goldBtn: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#c9a24d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  goldBtnGradient: {
    alignItems: "center",
    paddingVertical: 16,
  },
  goldBtnText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 17,
    color: "#0B1426",
  },
  verifyOptions: { width: "100%", gap: 10 },
  verifyOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
  },
  verifyOptionText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  retryBtn: { marginTop: 8 },
  retryText: {
    fontFamily: "Nunito_500Medium",
    fontSize: 14,
    color: "#4A6080",
  },
  secondaryBtn: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
  },
});
