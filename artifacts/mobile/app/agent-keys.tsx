import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Switch,
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
const NAVY_CARD = "#151f35";
const GOLD = "#c9a24d";
const API = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/agent-keys`;

interface AgentKey {
  id: number;
  name: string;
  nwcUri: string;
  spendingLimitSats: number | null;
  maxDailySats: number | null;
  spentToday: number;
  connectionType: string;
  isActive: boolean;
  createdAt: string;
}

interface AgentLog {
  id: number;
  action: string;
  amount: number | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

export default function AgentKeysScreen() {
  const insets = useSafeAreaInsets();
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyLimit, setNewKeyLimit] = useState("");
  const [newKeyDaily, setNewKeyDaily] = useState("");
  const [newKeyType, setNewKeyType] = useState<"nwc" | "api">("nwc");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<number | null>(null);
  const [keyLogs, setKeyLogs] = useState<Record<number, AgentLog[]>>({});

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  useEffect(() => { loadKeys(); }, []);

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

  const loadLogs = async (keyId: number) => {
    try {
      const res = await fetch(`${API}/${keyId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setKeyLogs(prev => ({ ...prev, [keyId]: data.logs ?? [] }));
      }
    } catch (_e) {}
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
          maxDailySats: newKeyDaily ? parseInt(newKeyDaily) : undefined,
          connectionType: newKeyType,
        }),
      });
      if (res.ok) {
        const key = await res.json();
        setKeys((prev) => [...prev, key]);
        setNewKeyName("");
        setNewKeyLimit("");
        setNewKeyDaily("");
        setShowCreate(false);
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Failed to create key", e);
    } finally {
      setCreating(false);
    }
  };

  const toggleKey = async (key: AgentKey) => {
    try {
      const res = await fetch(`${API}/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !key.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setKeys(prev => prev.map(k => k.id === key.id ? updated : k));
      }
    } catch (_e) {}
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

  const handleExpand = (keyId: number) => {
    if (expandedKey === keyId) {
      setExpandedKey(null);
    } else {
      setExpandedKey(keyId);
      if (!keyLogs[keyId]) {
        loadLogs(keyId);
      }
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[NAVY, "#0A1020"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable testID="agent-keys-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#8FA3C8" />
        </Pressable>
        <Text style={styles.title}>AI Agent Keys</Text>
        <Pressable testID="create-key-button" onPress={() => setShowCreate(!showCreate)} style={styles.addBtn}>
          <Ionicons name={showCreate ? "close" : "add"} size={22} color={GOLD} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.explainerCard}>
          <MaterialCommunityIcons name="robot" size={22} color="#9333EA" />
          <Text style={styles.explainerText}>
            Give AI agents controlled access to your wallet via Nostr Wallet Connect (NIP-47) or API key. Set per-transaction and daily spending limits.
          </Text>
        </View>

        {showCreate && (
          <Animated.View entering={FadeInDown} style={styles.createCard}>
            <Text style={styles.createTitle}>New Agent Key</Text>

            <View style={styles.typeToggle}>
              {(["nwc", "api"] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.typeOption, newKeyType === t && styles.typeOptionActive]}
                  onPress={() => setNewKeyType(t)}
                >
                  <MaterialCommunityIcons
                    name={t === "nwc" ? "access-point" : "key-variant"}
                    size={16}
                    color={newKeyType === t ? "#FFFFFF" : "#4A6080"}
                  />
                  <Text style={[styles.typeOptionText, newKeyType === t && { color: "#FFFFFF" }]}>
                    {t.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

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
              placeholder="Max per transaction (sats, optional)"
              placeholderTextColor="#4A6080"
              value={newKeyLimit}
              onChangeText={setNewKeyLimit}
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Max daily spending (sats, optional)"
              placeholderTextColor="#4A6080"
              value={newKeyDaily}
              onChangeText={setNewKeyDaily}
              keyboardType="number-pad"
            />
            <Pressable testID="confirm-create-key" style={styles.createBtn} onPress={createKey} disabled={creating}>
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
                <Pressable style={styles.keyHeader} onPress={() => handleExpand(key.id)}>
                  <View style={styles.keyIconBg}>
                    <MaterialCommunityIcons
                      name={key.connectionType === "api" ? "key-variant" : "access-point"}
                      size={20}
                      color="#9333EA"
                    />
                  </View>
                  <View style={styles.keyInfo}>
                    <Text style={styles.keyName}>{key.name}</Text>
                    <Text style={styles.keyDate}>
                      {key.connectionType.toUpperCase()} · Created {new Date(key.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Switch
                    value={key.isActive}
                    trackColor={{ false: "#243354", true: "#9333EA" }}
                    thumbColor="#FFF"
                    onValueChange={() => toggleKey(key)}
                    style={{ transform: [{ scale: 0.8 }] }}
                  />
                </Pressable>

                <View style={styles.limitsRow}>
                  {key.spendingLimitSats ? (
                    <View style={styles.limitBadge}>
                      <Ionicons name="shield-outline" size={11} color={GOLD} />
                      <Text style={styles.limitBadgeText}>{key.spendingLimitSats.toLocaleString()}/tx</Text>
                    </View>
                  ) : null}
                  {key.maxDailySats ? (
                    <View style={styles.limitBadge}>
                      <Ionicons name="today-outline" size={11} color={GOLD} />
                      <Text style={styles.limitBadgeText}>
                        {key.spentToday.toLocaleString()}/{key.maxDailySats.toLocaleString()} daily
                      </Text>
                    </View>
                  ) : null}
                  {!key.isActive && (
                    <View style={[styles.limitBadge, { borderColor: "rgba(230,57,70,0.3)", backgroundColor: "rgba(230,57,70,0.1)" }]}>
                      <Text style={[styles.limitBadgeText, { color: "#E63946" }]}>Disabled</Text>
                    </View>
                  )}
                </View>

                <View style={styles.uriRow}>
                  <Text style={styles.uriText} numberOfLines={1}>{key.nwcUri.slice(0, 32)}…</Text>
                  <Pressable testID={`copy-nwc-${key.id}`} onPress={() => copyUri(key)} style={styles.uriCopyBtn}>
                    <Ionicons
                      name={copiedId === key.id ? "checkmark" : "copy-outline"}
                      size={15}
                      color={copiedId === key.id ? "#2DC653" : "#4A6080"}
                    />
                  </Pressable>
                </View>

                {expandedKey === key.id && (
                  <Animated.View entering={FadeInDown} style={styles.logsSection}>
                    <Text style={styles.logsSectionTitle}>Activity Log</Text>
                    {keyLogs[key.id]?.length ? (
                      keyLogs[key.id]!.map((log) => (
                        <View key={log.id} style={styles.logRow}>
                          <View style={[styles.logDot, { backgroundColor: log.status === "success" ? "#2DC653" : "#E63946" }]} />
                          <View style={styles.logInfo}>
                            <Text style={styles.logAction}>{log.action}</Text>
                            {log.detail ? <Text style={styles.logDetail}>{log.detail}</Text> : null}
                          </View>
                          <Text style={styles.logTime}>
                            {new Date(log.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.logEmpty}>No activity yet</Text>
                    )}
                  </Animated.View>
                )}

                <Pressable testID={`delete-key-${key.id}`} style={styles.deleteBtn} onPress={() => deleteKey(key.id)}>
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
    borderRadius: 20,
    backgroundColor: NAVY_CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  title: { fontFamily: "Nunito_700Bold", fontSize: 20, color: "#FFFFFF" },
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
  explainerText: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 13, color: "#CDDAED", lineHeight: 20 },
  createCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  createTitle: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFFFFF", marginBottom: 4 },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#0D1830",
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 7,
  },
  typeOptionActive: { backgroundColor: "#172040" },
  typeOptionText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: "#4A6080" },
  input: {
    backgroundColor: "#0D1830",
    borderRadius: 10,
    padding: 14,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: "#CDDAED",
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  createBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  createBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  createBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#FFF" },
  centerState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: "#4A6080" },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 16, color: "#8FA3C8" },
  emptySubtitle: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "#4A6080", textAlign: "center" },
  keysList: { gap: 12 },
  keyCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  keyHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  keyIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(147,51,234,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyInfo: { flex: 1, gap: 2 },
  keyName: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFFFFF" },
  keyDate: { fontFamily: "Nunito_400Regular", fontSize: 11, color: "#4A6080" },
  limitsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  limitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(201,162,77,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(201,162,77,0.3)",
  },
  limitBadgeText: { fontFamily: "Nunito_500Medium", fontSize: 11, color: GOLD },
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
  uriText: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080", letterSpacing: 0.3 },
  uriCopyBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  logsSection: {
    backgroundColor: "#0D1830",
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#1E2D50",
  },
  logsSectionTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: "#8FA3C8" },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D50",
  },
  logDot: { width: 6, height: 6, borderRadius: 3 },
  logInfo: { flex: 1, gap: 1 },
  logAction: { fontFamily: "Nunito_500Medium", fontSize: 12, color: "#CDDAED" },
  logDetail: { fontFamily: "Nunito_400Regular", fontSize: 11, color: "#4A6080" },
  logTime: { fontFamily: "Nunito_400Regular", fontSize: 10, color: "#4A6080" },
  logEmpty: { fontFamily: "Nunito_400Regular", fontSize: 12, color: "#4A6080", textAlign: "center", paddingVertical: 8 },
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
  deleteBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: "#E63946" },
});
