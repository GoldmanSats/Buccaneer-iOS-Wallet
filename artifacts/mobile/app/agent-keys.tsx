import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

const NAVY = "#0B1426";
const NAVY_CARD = "#111D35";
const GOLD = "#c9a24d";
const API = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/agent-keys`;

interface AgentKey {
  id: number;
  name: string;
  nwcUri: string;
  spendingLimitSats: number | null;
  isActive: boolean;
  createdAt: string;
}

export default function AgentKeysScreen() {
  const insets = useSafeAreaInsets();
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyLimit, setNewKeyLimit] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(API);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch (e) {
      console.error("Failed to load keys", e);
    } finally {
      setIsLoading(false);
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          spendingLimitSats: newKeyLimit ? parseInt(newKeyLimit) : undefined,
        }),
      });
      if (res.ok) {
        const key = await res.json();
        setKeys((prev) => [...prev, key]);
        setNewKeyName("");
        setNewKeyLimit("");
        setShowCreate(false);
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Failed to create key", e);
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: number) => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      console.error("Failed to delete key", e);
    }
  };

  const copyUri = async (key: AgentKey) => {
    if (Platform.OS !== "web") {
      await Clipboard.setStringAsync(key.nwcUri);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          testID="agent-keys-back-button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.title}>AI Agent Keys</Text>
        <Pressable
          testID="create-key-button"
          onPress={() => setShowCreate(!showCreate)}
          style={styles.addBtn}
        >
          <Ionicons name={showCreate ? "close" : "add"} size={22} color={GOLD} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Explainer */}
        <View style={styles.explainerCard}>
          <MaterialCommunityIcons name="robot" size={22} color="#9333EA" />
          <Text style={styles.explainerText}>
            Give AI agents controlled access to your wallet via Nostr Wallet Connect (NIP-47). Set spending limits to protect your treasure.
          </Text>
        </View>

        {/* Create Form */}
        {showCreate && (
          <Animated.View entering={FadeInDown} style={styles.createCard}>
            <Text style={styles.createTitle}>New Agent Key</Text>
            <TextInput
              testID="agent-key-name-input"
              style={styles.input}
              placeholder="Agent name (e.g. Claude, GPT-4)"
              placeholderTextColor="#4A6080"
              value={newKeyName}
              onChangeText={setNewKeyName}
              autoCapitalize="words"
            />
            <TextInput
              testID="agent-key-limit-input"
              style={styles.input}
              placeholder="Spending limit in sats (optional)"
              placeholderTextColor="#4A6080"
              value={newKeyLimit}
              onChangeText={setNewKeyLimit}
              keyboardType="number-pad"
            />
            <Pressable
              testID="confirm-create-key"
              style={styles.createBtn}
              onPress={createKey}
              disabled={creating}
            >
              <LinearGradient
                colors={["#9333EA", "#7928CA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createBtnGradient}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="key-plus" size={18} color="#FFF" />
                    <Text style={styles.createBtnText}>Generate Key</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Keys List */}
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={GOLD} />
            <Text style={styles.loadingText}>Loading keys…</Text>
          </View>
        ) : keys.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="robot-off" size={48} color="#243354" />
            <Text style={styles.emptyTitle}>No agent keys yet</Text>
            <Text style={styles.emptySubtitle}>Create a key to let AI agents use your wallet</Text>
          </View>
        ) : (
          <View style={styles.keysList}>
            {keys.map((key) => (
              <Animated.View key={key.id} entering={FadeInDown} style={styles.keyCard}>
                <View style={styles.keyHeader}>
                  <View style={styles.keyIconBg}>
                    <MaterialCommunityIcons name="robot" size={20} color="#9333EA" />
                  </View>
                  <View style={styles.keyInfo}>
                    <Text style={styles.keyName}>{key.name}</Text>
                    <Text style={styles.keyDate}>
                      Created {new Date(key.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {key.isActive && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  )}
                </View>

                {key.spendingLimitSats ? (
                  <View style={styles.limitRow}>
                    <Ionicons name="shield-outline" size={13} color={GOLD} />
                    <Text style={styles.limitText}>
                      Limit: {key.spendingLimitSats.toLocaleString()} sats
                    </Text>
                  </View>
                ) : null}

                <View style={styles.uriRow}>
                  <Text style={styles.uriText} numberOfLines={1}>{key.nwcUri.slice(0, 32)}…</Text>
                  <Pressable
                    testID={`copy-nwc-${key.id}`}
                    onPress={() => copyUri(key)}
                    style={styles.uriCopyBtn}
                  >
                    <Ionicons
                      name={copiedId === key.id ? "checkmark" : "copy-outline"}
                      size={15}
                      color={copiedId === key.id ? "#2DC653" : "#4A6080"}
                    />
                  </Pressable>
                </View>

                <Pressable
                  testID={`delete-key-${key.id}`}
                  style={styles.deleteBtn}
                  onPress={() => deleteKey(key.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#E63946" />
                  <Text style={styles.deleteBtnText}>Revoke Access</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(201,162,77,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
  },
  content: { padding: 20, gap: 16 },
  explainerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(147,51,234,0.1)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(147,51,234,0.25)",
  },
  explainerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#CDDAED",
    lineHeight: 20,
  },
  createCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  createTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#0D1830",
    borderRadius: 10,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#CDDAED",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  createBtn: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  createBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  createBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#FFF",
  },
  centerState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#4A6080",
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
    textAlign: "center",
  },
  keysList: { gap: 12 },
  keyCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  keyIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(147,51,234,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyInfo: { flex: 1, gap: 2 },
  keyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  keyDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#4A6080",
  },
  activeBadge: {
    backgroundColor: "rgba(45,198,83,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(45,198,83,0.3)",
  },
  activeBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#2DC653",
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  limitText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: GOLD,
  },
  uriRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D1830",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  uriText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#4A6080",
    letterSpacing: 0.3,
  },
  uriCopyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(230,57,70,0.1)",
    borderWidth: 1,
    borderColor: "rgba(230,57,70,0.2)",
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#E63946",
  },
});
