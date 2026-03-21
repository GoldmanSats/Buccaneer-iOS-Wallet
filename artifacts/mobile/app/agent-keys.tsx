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
  Modal,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { useSettings } from "@/contexts/SettingsContext";
import { MIDNIGHT, DAYLIGHT } from "@/constants/colors";
const API = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api/agent-keys`;

interface AgentKey {
  id: number;
  name: string;
  nwcUri: string | null;
  apiToken: string | null;
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

const AGENT_BASE = "/api/v1";

export default function AgentKeysScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<"nwc" | "api" | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyLimit, setNewKeyLimit] = useState("");
  const [newKeyDaily, setNewKeyDaily] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedBase, setCopiedBase] = useState(false);
  const [expandedKey, setExpandedKey] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState<number | null>(null);
  const [editLimits, setEditLimits] = useState<number | null>(null);
  const [editLimitVal, setEditLimitVal] = useState("");
  const [editDailyVal, setEditDailyVal] = useState("");
  const [keyLogs, setKeyLogs] = useState<Record<number, AgentLog[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<AgentKey | null>(null);
  const [newKeyRevealed, setNewKeyRevealed] = useState<AgentKey | null>(null);

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
    if (!newKeyName.trim() || !selectedType) return;
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
          connectionType: selectedType,
        }),
      });
      if (res.ok) {
        const key = await res.json();
        key.spentToday = key.spentToday ?? 0;
        setKeys((prev) => [...prev, key]);
        setNewKeyName("");
        setNewKeyLimit("");
        setNewKeyDaily("");
        setSelectedType(null);
        setNewKeyRevealed(key);
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
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete key", e);
    }
    setDeleteTarget(null);
  };

  const copyUri = async (key: AgentKey) => {
    const value = key.connectionType === "api" ? (key.apiToken ?? "") : (key.nwcUri ?? "");
    await Clipboard.setStringAsync(value);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyBaseUrl = async () => {
    const base = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    await Clipboard.setStringAsync(base);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedBase(true);
    setTimeout(() => setCopiedBase(false), 2000);
  };

  const spentPercent = (key: AgentKey) => {
    if (!key.maxDailySats || key.maxDailySats === 0) return 0;
    return Math.min(100, ((key.spentToday ?? 0) / key.maxDailySats) * 100);
  };

  const barColor = (pct: number) => pct > 80 ? "#EF4444" : pct > 50 ? "#EAB308" : "#22C55E";

  return (
    <View style={[st.container, { paddingTop: topPad, backgroundColor: colors.bg }]}>
      {isDark && <LinearGradient colors={[colors.bg, "#0A1020"]} style={StyleSheet.absoluteFill} />}

      <View style={st.header}>
        <Pressable testID="agent-keys-back-button" onPress={() => router.back()} style={[st.backBtn, { backgroundColor: colors.bgCard + "CC", borderColor: colors.border + "60" }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text + "B3"} />
        </Pressable>
        <View style={st.headerText}>
          <Text style={[st.title, { color: colors.text }]}>Agent Access</Text>
          <Text style={[st.subtitle, { color: colors.textMuted }]}>Let AI agents use your wallet</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[st.content, { paddingBottom: bottomPad + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {newKeyRevealed && (
          <Animated.View entering={FadeInDown.duration(300)} style={[st.revealCard, {
            backgroundColor: newKeyRevealed.connectionType === "nwc" ? "rgba(147,51,234,0.1)" : "rgba(34,197,94,0.1)",
            borderColor: newKeyRevealed.connectionType === "nwc" ? "rgba(147,51,234,0.3)" : "rgba(34,197,94,0.3)",
          }]}>
            <View style={st.revealHeader}>
              <View style={[st.revealIcon, { backgroundColor: newKeyRevealed.connectionType === "nwc" ? "rgba(147,51,234,0.2)" : "rgba(34,197,94,0.2)" }]}>
                <Ionicons name={newKeyRevealed.connectionType === "nwc" ? "link" : "checkmark"} size={18} color={newKeyRevealed.connectionType === "nwc" ? "#9333EA" : "#22C55E"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.revealTitle, { color: colors.text }]}>{newKeyRevealed.connectionType === "nwc" ? "NWC Connection Ready" : "API Key Created"}</Text>
                <Text style={[st.revealDesc, { color: colors.textMuted }]}>Copy this now — it won't be shown again</Text>
              </View>
            </View>
            <View style={[st.revealUri, { backgroundColor: colors.bg + "99" }]}>
              <Text selectable style={[st.revealUriText, { color: colors.text }]} numberOfLines={4}>{newKeyRevealed.connectionType === "api" ? (newKeyRevealed.apiToken ?? "") : (newKeyRevealed.nwcUri ?? "")}</Text>
            </View>
            <View style={st.revealActions}>
              <Pressable
                style={[st.revealCopyBtn, { backgroundColor: newKeyRevealed.connectionType === "nwc" ? "#9333EA" : "#22C55E" }]}
                onPress={() => copyUri(newKeyRevealed)}
              >
                <Ionicons name={copiedId === newKeyRevealed.id ? "checkmark" : "copy-outline"} size={16} color="#FFF" />
                <Text style={st.revealCopyText}>{copiedId === newKeyRevealed.id ? "Copied!" : "Copy"}</Text>
              </Pressable>
              <Pressable style={[st.revealDoneBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setNewKeyRevealed(null)}>
                <Text style={[st.revealDoneText, { color: colors.textSecondary }]}>Done</Text>
              </Pressable>
            </View>

            {newKeyRevealed.connectionType === "nwc" && (
              <View style={[st.usageCard, { backgroundColor: colors.bg + "99", borderColor: colors.border + "40" }]}>
                <View style={st.usageHeader}>
                  <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
                  <Text style={[st.usageTitle, { color: colors.text }]}>Quick Start</Text>
                </View>
                <Text style={[st.usageDesc, { color: colors.textMuted }]}>
                  Copy this string and paste it directly into your chat with your AI agent. Just tell it "here's your wallet" — that's all it needs to start sending and receiving sats.
                </Text>
                <View style={st.nwcStepList}>
                  <View style={st.nwcStep}>
                    <Text style={[st.nwcStepNum, { color: "#9333EA" }]}>1</Text>
                    <Text style={[st.nwcStepText, { color: colors.textSecondary }]}>Copy the connection string above</Text>
                  </View>
                  <View style={st.nwcStep}>
                    <Text style={[st.nwcStepNum, { color: "#9333EA" }]}>2</Text>
                    <Text style={[st.nwcStepText, { color: colors.textSecondary }]}>Paste it into your chat with your agent (Telegram, Discord, etc.)</Text>
                  </View>
                  <View style={st.nwcStep}>
                    <Text style={[st.nwcStepNum, { color: "#9333EA" }]}>3</Text>
                    <Text style={[st.nwcStepText, { color: colors.textSecondary }]}>Tell the agent "this is your NWC wallet connection"</Text>
                  </View>
                </View>
                <View style={[st.tipBox, { backgroundColor: "rgba(147,51,234,0.06)", borderColor: "rgba(147,51,234,0.2)" }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#9333EA" />
                  <Text style={[st.tipText, { color: colors.textSecondary }]}>
                    Spending limits you set are enforced automatically. The agent can only spend what you allow.
                  </Text>
                </View>
              </View>
            )}

            {newKeyRevealed.connectionType === "api" && (
              <View style={[st.usageCard, { backgroundColor: colors.bg + "99", borderColor: colors.border + "40" }]}>
                <View style={st.usageHeader}>
                  <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
                  <Text style={[st.usageTitle, { color: colors.text }]}>Quick Start</Text>
                </View>
                <Text style={[st.usageDesc, { color: colors.textMuted }]}>
                  Give your AI agent this key and the base URL below. It can then check your balance, send payments, create invoices, and view transactions — all within the spending limits you set.
                </Text>
                <View style={[st.usageEndpoint, { backgroundColor: colors.bgCard + "80" }]}>
                  <Text style={[st.usageLabel, { color: colors.textMuted }]}>Base URL</Text>
                  <Text selectable style={[st.usageCode, { color: colors.text }]}>{(process.env.EXPO_PUBLIC_DOMAIN ?? "") + "/api/v1"}</Text>
                </View>
                <View style={st.usageEndpoints}>
                  <Text style={[st.usageLabel, { color: colors.textMuted }]}>Available Endpoints</Text>
                  <View style={st.usageRow}>
                    <View style={[st.usageMethod, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                      <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#22C55E" }}>GET</Text>
                    </View>
                    <Text style={[st.usageEndpointText, { color: colors.textSecondary }]}>/balance</Text>
                    <Text style={[st.usageEndpointDesc, { color: colors.textMuted }]}>Check wallet balance</Text>
                  </View>
                  <View style={st.usageRow}>
                    <View style={[st.usageMethod, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
                      <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#3B82F6" }}>POST</Text>
                    </View>
                    <Text style={[st.usageEndpointText, { color: colors.textSecondary }]}>/send</Text>
                    <Text style={[st.usageEndpointDesc, { color: colors.textMuted }]}>Pay a Lightning invoice</Text>
                  </View>
                  <View style={st.usageRow}>
                    <View style={[st.usageMethod, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
                      <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#3B82F6" }}>POST</Text>
                    </View>
                    <Text style={[st.usageEndpointText, { color: colors.textSecondary }]}>/receive</Text>
                    <Text style={[st.usageEndpointDesc, { color: colors.textMuted }]}>Create a payment request</Text>
                  </View>
                  <View style={st.usageRow}>
                    <View style={[st.usageMethod, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                      <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#22C55E" }}>GET</Text>
                    </View>
                    <Text style={[st.usageEndpointText, { color: colors.textSecondary }]}>/transactions</Text>
                    <Text style={[st.usageEndpointDesc, { color: colors.textMuted }]}>List payment history</Text>
                  </View>
                </View>
                <View style={[st.usageEndpoint, { backgroundColor: colors.bgCard + "80" }]}>
                  <Text style={[st.usageLabel, { color: colors.textMuted }]}>Auth Header</Text>
                  <Text selectable style={[st.usageCode, { color: colors.text }]}>Authorization: Bearer {"<your-key>"}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {!selectedType && !newKeyRevealed && (
          <View style={[st.introCard, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>
            <View style={st.introHeader}>
              <View style={[st.introIcon, { backgroundColor: "rgba(147,51,234,0.15)" }]}>
                <MaterialCommunityIcons name="robot" size={20} color="#9333EA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.introTitle, { color: colors.text }]}>Give your AI agent a wallet</Text>
                <Text style={[st.introDesc, { color: colors.textMuted }]}>
                  Connect your AI agent to your wallet. It can send payments, create invoices, and check your balance — all within the spending limits you set.
                </Text>
              </View>
            </View>

            <Pressable
              testID="select-nwc-type"
              style={[st.typeBtn, { backgroundColor: "rgba(147,51,234,0.1)", borderColor: "rgba(147,51,234,0.2)" }]}
              onPress={() => setSelectedType("nwc")}
            >
              <View style={[st.typeBtnIcon, { backgroundColor: "rgba(147,51,234,0.2)" }]}>
                <Ionicons name="link" size={18} color="#9333EA" />
              </View>
              <View style={st.typeBtnText}>
                <Text style={[st.typeBtnLabel, { color: colors.text }]}>Nostr Wallet Connect</Text>
                <Text style={[st.typeBtnSub, { color: colors.textMuted }]}>One connection string — works with any NWC-compatible agent</Text>
              </View>
              <View style={st.recBadge}>
                <Text style={st.recBadgeText}>RECOMMENDED</Text>
              </View>
            </Pressable>

            <Pressable
              testID="select-api-type"
              style={[st.typeBtn, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "50" }]}
              onPress={() => setSelectedType("api")}
            >
              <View style={[st.typeBtnIcon, { backgroundColor: colors.bgElevated }]}>
                <Ionicons name="flash" size={18} color={colors.textSecondary} />
              </View>
              <View style={st.typeBtnText}>
                <Text style={[st.typeBtnLabel, { color: colors.text }]}>REST API Key</Text>
                <Text style={[st.typeBtnSub, { color: colors.textMuted }]}>Direct API access with Bearer token auth</Text>
              </View>
            </Pressable>
          </View>
        )}

        {selectedType && !newKeyRevealed && (
          <Animated.View entering={FadeInDown.duration(300)} style={[st.createCard, {
            backgroundColor: colors.bgCard,
            borderColor: selectedType === "nwc" ? "rgba(147,51,234,0.3)" : colors.border,
          }]}>
            <View style={st.createHeader}>
              <View style={[st.typeBtnIcon, { backgroundColor: selectedType === "nwc" ? "rgba(147,51,234,0.2)" : colors.bgElevated }]}>
                <Ionicons name={selectedType === "nwc" ? "link" : "flash"} size={18} color={selectedType === "nwc" ? "#9333EA" : colors.textSecondary} />
              </View>
              <Text style={[st.createTitle, { color: colors.text }]}>{selectedType === "nwc" ? "New NWC Connection" : "New API Key"}</Text>
            </View>

            <View style={st.formField}>
              <Text style={[st.formLabel, { color: colors.textMuted }]}>LABEL</Text>
              <TextInput
                testID="agent-key-name-input"
                style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                placeholder="e.g. My OpenClaw Bot"
                placeholderTextColor={colors.textMuted}
                value={newKeyName}
                onChangeText={setNewKeyName}
                autoCapitalize="words"
              />
            </View>

            <View style={st.formRow}>
              <View style={[st.formField, { flex: 1 }]}>
                <Text style={[st.formLabel, { color: colors.textMuted }]}>MAX PER TX (SATS)</Text>
                <TextInput
                  testID="agent-key-limit-input"
                  style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  value={newKeyLimit}
                  onChangeText={setNewKeyLimit}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[st.formField, { flex: 1 }]}>
                <Text style={[st.formLabel, { color: colors.textMuted }]}>MAX PER DAY (SATS)</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  value={newKeyDaily}
                  onChangeText={setNewKeyDaily}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={st.createActions}>
              <Pressable style={[st.cancelBtn, { backgroundColor: colors.bgElevated }]} onPress={() => { setSelectedType(null); setNewKeyName(""); setNewKeyLimit(""); setNewKeyDaily(""); }}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="confirm-create-key"
                style={[st.submitBtn, { backgroundColor: selectedType === "nwc" ? "#9333EA" : colors.gold }]}
                onPress={createKey}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={st.submitText}>Create</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        )}

        {isLoading ? (
          <View style={st.centerState}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : keys.length === 0 && !selectedType && !newKeyRevealed ? (
          <View style={st.emptyState}>
            <MaterialCommunityIcons name="robot" size={48} color={colors.textMuted + "4D"} />
            <Text style={[st.emptyTitle, { color: colors.textMuted }]}>No agent keys yet</Text>
          </View>
        ) : keys.length > 0 ? (
          <View style={st.keysList}>
            {keys.map((key) => {
              const pct = spentPercent(key);
              return (
                <Animated.View key={key.id} entering={FadeInDown} style={[st.keyCard, {
                  backgroundColor: colors.bgCard,
                  borderColor: key.isActive ? colors.border + "80" : "rgba(239,68,68,0.2)",
                  opacity: key.isActive ? 1 : 0.6,
                }]}>
                  <View style={st.keyRow1}>
                    <View style={[st.keyIcon, { backgroundColor: key.isActive ? "rgba(147,51,234,0.15)" : "rgba(239,68,68,0.15)" }]}>
                      <MaterialCommunityIcons name="robot" size={20} color={key.isActive ? "#9333EA" : "#EF4444"} />
                    </View>
                    <View style={st.keyMeta}>
                      <View style={st.keyNameRow}>
                        <Text style={[st.keyName, { color: colors.text }]}>{key.name}</Text>
                        {key.connectionType === "nwc" && (
                          <View style={st.nwcBadge}>
                            <Text style={st.nwcBadgeText}>NWC</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[st.keyPreview, { color: colors.textMuted }]}>
                        {key.connectionType === "nwc" ? "Nostr Wallet Connect" : key.nwcUri.slice(0, 24) + "…"}
                      </Text>
                    </View>
                    <Switch
                      value={key.isActive}
                      trackColor={{ false: isDark ? "#243354" : colors.border, true: "#9333EA" }}
                      thumbColor="#FFF"
                      onValueChange={() => toggleKey(key)}
                      style={{ transform: [{ scale: 0.8 }] }}
                    />
                  </View>

                  <View style={st.limitsGrid}>
                    <View style={[st.limitBox, { backgroundColor: colors.bgElevated + "66" }]}>
                      <Text style={[st.limitLabel, { color: colors.textMuted }]}>PER TX LIMIT</Text>
                      <Text style={[st.limitValue, { color: colors.text }]}>{key.spendingLimitSats ? key.spendingLimitSats.toLocaleString() + " sats" : "None"}</Text>
                    </View>
                    <View style={[st.limitBox, { backgroundColor: colors.bgElevated + "66" }]}>
                      <Text style={[st.limitLabel, { color: colors.textMuted }]}>DAILY LIMIT</Text>
                      <Text style={[st.limitValue, { color: colors.text }]}>{key.maxDailySats ? key.maxDailySats.toLocaleString() + " sats" : "None"}</Text>
                    </View>
                  </View>

                  {key.maxDailySats ? (
                    <View style={st.progressSection}>
                      <View style={st.progressHeader}>
                        <Text style={[st.progressLabel, { color: colors.textMuted }]}>SPENT TODAY</Text>
                        <Text style={[st.progressValue, { color: colors.text }]}>{(key.spentToday ?? 0).toLocaleString()} / {(key.maxDailySats ?? 0).toLocaleString()}</Text>
                      </View>
                      <View style={[st.progressBar, { backgroundColor: colors.bgElevated }]}>
                        <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: barColor(pct) }]} />
                      </View>
                    </View>
                  ) : null}

                  <View style={st.actionBtns}>
                    <Pressable
                      style={[st.actionBtn, { backgroundColor: colors.bgElevated + "80" }]}
                      onPress={() => {
                        if (showLogs === key.id) { setShowLogs(null); } else { setShowLogs(key.id); if (!keyLogs[key.id]) loadLogs(key.id); }
                      }}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={[st.actionBtnText, { color: colors.textSecondary }]}>{showLogs === key.id ? "Hide Log" : "Activity Log"}</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { backgroundColor: colors.bgElevated + "80" }]}
                      onPress={() => {
                        if (editLimits === key.id) { setEditLimits(null); } else {
                          setEditLimits(key.id);
                          setEditLimitVal(key.spendingLimitSats?.toString() ?? "");
                          setEditDailyVal(key.maxDailySats?.toString() ?? "");
                        }
                      }}
                    >
                      <Ionicons name="shield-outline" size={14} color={colors.textSecondary} />
                      <Text style={[st.actionBtnText, { color: colors.textSecondary }]}>{editLimits === key.id ? "Cancel" : "Edit Limits"}</Text>
                    </Pressable>
                    <Pressable
                      testID={`delete-key-${key.id}`}
                      style={[st.deleteSmallBtn, { backgroundColor: "rgba(239,68,68,0.1)" }]}
                      onPress={() => setDeleteTarget(key)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </Pressable>
                  </View>

                  {editLimits === key.id && (
                    <Animated.View entering={FadeInDown.duration(200)} style={st.editPanel}>
                      <View style={st.formRow}>
                        <View style={[st.formField, { flex: 1 }]}>
                          <Text style={[st.formLabel, { color: colors.textMuted }]}>MAX PER TX</Text>
                          <TextInput
                            style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                            value={editLimitVal}
                            onChangeText={setEditLimitVal}
                            keyboardType="number-pad"
                            placeholder="sats"
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                        <View style={[st.formField, { flex: 1 }]}>
                          <Text style={[st.formLabel, { color: colors.textMuted }]}>MAX PER DAY</Text>
                          <TextInput
                            style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                            value={editDailyVal}
                            onChangeText={setEditDailyVal}
                            keyboardType="number-pad"
                            placeholder="sats"
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                      </View>
                      <Pressable
                        style={[st.saveLimitsBtn, { backgroundColor: colors.gold }]}
                        onPress={async () => {
                          try {
                            const res = await fetch(`${API}/${key.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                spendingLimitSats: editLimitVal ? parseInt(editLimitVal) : null,
                                maxDailySats: editDailyVal ? parseInt(editDailyVal) : null,
                              }),
                            });
                            if (res.ok) {
                              const updated = await res.json();
                              setKeys(prev => prev.map(k => k.id === key.id ? updated : k));
                              setEditLimits(null);
                            }
                          } catch (_e) {}
                        }}
                      >
                        <Text style={[st.saveLimitsText, { color: isDark ? colors.bg : "#172331" }]}>Save Limits</Text>
                      </Pressable>
                    </Animated.View>
                  )}

                  {showLogs === key.id && (
                    <Animated.View entering={FadeInDown.duration(200)} style={[st.logsPanel, { borderTopColor: colors.border + "50" }]}>
                      {keyLogs[key.id]?.length ? (
                        keyLogs[key.id]!.slice(0, 20).map((log) => (
                          <View key={log.id} style={st.logRow}>
                            <View style={[st.logDot, { backgroundColor: log.status === "success" ? "#22C55E" : log.status === "denied" ? "#EAB308" : "#EF4444" }]} />
                            <Text style={[st.logAction, { color: colors.textSecondary }]} numberOfLines={1}>
                              {log.action}{log.amount ? ` ${log.amount.toLocaleString()} sats` : ""}
                            </Text>
                            <Text style={[st.logTime, { color: colors.textMuted }]}>{new Date(log.createdAt).toLocaleDateString()}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={[st.logEmpty, { color: colors.textMuted }]}>No activity yet</Text>
                      )}
                    </Animated.View>
                  )}
                </Animated.View>
              );
            })}
          </View>
        ) : null}

        {keys.some(k => k.connectionType === "nwc") && (
          <>
            <Text style={[st.sectionHeader, { color: colors.textMuted }]}>HOW TO USE NOSTR WALLET CONNECT</Text>
            <View style={[st.apiCard, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(147,51,234,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#9333EA" }]}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Copy the connection string</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Tap your NWC key above, then tap the copy button. The string starts with "nostr+walletconnect://".</Text>
                </View>
              </View>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(147,51,234,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#9333EA" }]}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Paste it into your agent chat</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Send the string directly to your AI agent — through Telegram, Discord, or however you talk to it.</Text>
                </View>
              </View>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(147,51,234,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#9333EA" }]}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Tell it "this is your wallet"</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>The agent will recognize the NWC string and use it to send payments, check balances, and create invoices on your behalf.</Text>
                </View>
              </View>

              <View style={[st.tipBox, { backgroundColor: "rgba(147,51,234,0.06)", borderColor: "rgba(147,51,234,0.2)" }]}>
                <Ionicons name="information-circle-outline" size={16} color="#9333EA" />
                <Text style={[st.tipText, { color: colors.textSecondary }]}>
                  No server URL or API setup needed — the connection string has everything. Your spending limits are enforced on every transaction automatically.
                </Text>
              </View>

            </View>
          </>
        )}

        {keys.some(k => k.connectionType === "api") && (
          <>
            <Text style={[st.sectionHeader, { color: colors.textMuted }]}>HOW TO USE YOUR API KEY</Text>
            <View style={[st.apiCard, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#22C55E" }]}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Copy your API key and base URL</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Your agent needs two things: the API key you created above, and this base URL.</Text>
                </View>
              </View>

              <Pressable style={[st.copyableBlock, { backgroundColor: colors.bg + "99" }]} onPress={copyBaseUrl}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.copyableLabel, { color: colors.textMuted }]}>BASE URL</Text>
                  <Text selectable style={[st.copyableValue, { color: colors.text }]}>{(process.env.EXPO_PUBLIC_DOMAIN ?? "") + AGENT_BASE}</Text>
                </View>
                <View style={[st.copyBtn, { backgroundColor: colors.bgElevated }]}>
                  <Ionicons name={copiedBase ? "checkmark" : "copy-outline"} size={14} color={copiedBase ? "#22C55E" : colors.textSecondary} />
                </View>
              </Pressable>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#22C55E" }]}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Tell your agent how to authenticate</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Every request must include this header. Replace the key with the one you copied above.</Text>
                </View>
              </View>

              <View style={[st.copyableBlock, { backgroundColor: colors.bg + "99" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.copyableLabel, { color: colors.textMuted }]}>AUTH HEADER</Text>
                  <Text selectable style={[st.copyableValue, { color: colors.text }]}>Authorization: Bearer bwk_your_key</Text>
                </View>
              </View>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#22C55E" }]}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Tell your agent what it can do</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Share these commands with your agent. All paths are relative to the base URL above.</Text>
                </View>
              </View>

              <View style={[st.endpointList, { backgroundColor: colors.bg + "99" }]}>
                <View style={st.endpointItem}>
                  <View style={[st.methodPill, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                    <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#22C55E" }}>GET</Text>
                  </View>
                  <Text style={[st.endpointPath, { color: colors.text }]}>/balance</Text>
                </View>
                <Text style={[st.endpointDesc, { color: colors.textMuted }]}>Returns sats balance. No body needed.</Text>

                <View style={[st.endpointDivider, { borderColor: colors.border + "40" }]} />

                <View style={st.endpointItem}>
                  <View style={[st.methodPill, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
                    <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#3B82F6" }}>POST</Text>
                  </View>
                  <Text style={[st.endpointPath, { color: colors.text }]}>/send</Text>
                </View>
                <Text style={[st.endpointDesc, { color: colors.textMuted }]}>Pay a Lightning invoice. Send: {`{ "bolt11": "lnbc1..." }`}</Text>

                <View style={[st.endpointDivider, { borderColor: colors.border + "40" }]} />

                <View style={st.endpointItem}>
                  <View style={[st.methodPill, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
                    <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#3B82F6" }}>POST</Text>
                  </View>
                  <Text style={[st.endpointPath, { color: colors.text }]}>/receive</Text>
                </View>
                <Text style={[st.endpointDesc, { color: colors.textMuted }]}>Create an invoice. Send: {`{ "amountSats": 1000 }`}</Text>

                <View style={[st.endpointDivider, { borderColor: colors.border + "40" }]} />

                <View style={st.endpointItem}>
                  <View style={[st.methodPill, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                    <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 9, color: "#22C55E" }}>GET</Text>
                  </View>
                  <Text style={[st.endpointPath, { color: colors.text }]}>/transactions</Text>
                </View>
                <Text style={[st.endpointDesc, { color: colors.textMuted }]}>Lists recent payments and invoices.</Text>
              </View>

              <View style={st.stepRow}>
                <View style={[st.stepNum, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                  <Text style={[st.stepNumText, { color: "#22C55E" }]}>4</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.stepTitle, { color: colors.text }]}>Example: check balance</Text>
                  <Text style={[st.stepDesc, { color: colors.textMuted }]}>Here's what a full request looks like. Copy this and give it to your agent as an example.</Text>
                </View>
              </View>

              <View style={[st.copyableBlock, { backgroundColor: colors.bg + "99" }]}>
                <Text selectable style={[st.exampleCode, { color: colors.text }]}>
{`curl ${(process.env.EXPO_PUBLIC_DOMAIN ?? "") + AGENT_BASE}/balance \\
  -H "Authorization: Bearer bwk_your_key"`}
                </Text>
              </View>

              <View style={[st.tipBox, { backgroundColor: "rgba(250,186,26,0.08)", borderColor: "rgba(250,186,26,0.2)" }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#FABA1A" />
                <Text style={[st.tipText, { color: colors.textSecondary }]}>
                  Spending limits you set on the key are enforced automatically. If your agent tries to spend more than allowed, the request will be rejected.
                </Text>
              </View>

            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={st.modalIconCircle}>
              <Ionicons name="warning-outline" size={32} color="#EF4444" />
            </View>
            <Text style={[st.modalTitle, { color: colors.text }]}>Revoke Access?</Text>
            <Text style={[st.modalDesc, { color: colors.textMuted }]}>
              This agent will immediately lose all access to your wallet. This action cannot be undone.
            </Text>
            <Pressable style={st.modalDeleteBtn} onPress={() => deleteTarget && deleteKey(deleteTarget.id)}>
              <Text style={st.modalDeleteText}>Revoke Key</Text>
            </Pressable>
            <Pressable style={[st.modalCancelBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setDeleteTarget(null)}>
              <Text style={[st.modalCancelText, { color: colors.text }]}>Keep It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: "Chewy_400Regular", fontSize: 24 },
  subtitle: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  content: { paddingHorizontal: 24, gap: 16 },

  revealCard: { borderRadius: 20, padding: 20, borderWidth: 1, gap: 12 },
  revealHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  revealIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  revealTitle: { fontFamily: "Nunito_700Bold", fontSize: 15 },
  revealDesc: { fontFamily: "Nunito_400Regular", fontSize: 12 },
  revealUri: { borderRadius: 12, padding: 12, maxHeight: 96 },
  revealUriText: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18 },
  revealActions: { flexDirection: "row", gap: 10 },
  revealCopyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 10 },
  revealCopyText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#FFF" },
  revealDoneBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  revealDoneText: { fontFamily: "Nunito_600SemiBold", fontSize: 14 },

  usageCard: { marginTop: 4, borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  usageHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  usageTitle: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  usageDesc: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18 },
  usageEndpoint: { borderRadius: 10, padding: 10, gap: 4 },
  usageLabel: { fontFamily: "Nunito_700Bold", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase" as const },
  usageCode: { fontFamily: "Nunito_400Regular", fontSize: 11, lineHeight: 16 },
  usageEndpoints: { gap: 8 },
  usageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  usageMethod: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  usageEndpointText: { fontFamily: "Nunito_700Bold", fontSize: 12, minWidth: 90 },
  usageEndpointDesc: { fontFamily: "Nunito_400Regular", fontSize: 10, flex: 1 },

  introCard: { borderRadius: 32, padding: 24, borderWidth: 1, gap: 12 },
  introHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 4 },
  introIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  introTitle: { fontFamily: "Nunito_700Bold", fontSize: 18 },
  introDesc: { fontFamily: "Nunito_400Regular", fontSize: 13, lineHeight: 20, marginTop: 4 },

  typeBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, padding: 14, borderWidth: 1 },
  typeBtnIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeBtnText: { flex: 1, gap: 2 },
  typeBtnLabel: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  typeBtnSub: { fontFamily: "Nunito_400Regular", fontSize: 10, lineHeight: 14 },
  recBadge: { backgroundColor: "rgba(147,51,234,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  recBadgeText: { fontFamily: "Nunito_700Bold", fontSize: 9, color: "#9333EA" },

  createCard: { borderRadius: 32, padding: 24, borderWidth: 1, gap: 16 },
  createHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  createTitle: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  formField: { gap: 6 },
  formLabel: { fontFamily: "Nunito_700Bold", fontSize: 10, letterSpacing: 1.5 },
  formRow: { flexDirection: "row", gap: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, letterSpacing: 0.5 },
  createActions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 20, paddingVertical: 12, alignItems: "center" },
  cancelText: { fontFamily: "Nunito_600SemiBold", fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 20, paddingVertical: 12, alignItems: "center" },
  submitText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#FFF" },

  centerState: { alignItems: "center", paddingVertical: 48 },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 16 },

  keysList: { gap: 16 },
  keyCard: { borderRadius: 32, padding: 20, borderWidth: 1, gap: 12 },
  keyRow1: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  keyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  keyMeta: { flex: 1, gap: 2 },
  keyNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyName: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  nwcBadge: { backgroundColor: "rgba(147,51,234,0.2)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  nwcBadgeText: { fontFamily: "Nunito_700Bold", fontSize: 8, color: "#9333EA" },
  keyPreview: { fontFamily: "Nunito_400Regular", fontSize: 10 },

  limitsGrid: { flexDirection: "row", gap: 12 },
  limitBox: { flex: 1, borderRadius: 12, padding: 10, gap: 2 },
  limitLabel: { fontFamily: "Nunito_700Bold", fontSize: 10, letterSpacing: 1 },
  limitValue: { fontFamily: "Nunito_700Bold", fontSize: 14 },

  progressSection: { gap: 6 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { fontFamily: "Nunito_700Bold", fontSize: 10, letterSpacing: 1 },
  progressValue: { fontFamily: "Nunito_700Bold", fontSize: 12 },
  progressBar: { height: 6, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },

  actionBtns: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12, paddingVertical: 8 },
  actionBtnText: { fontFamily: "Nunito_700Bold", fontSize: 11 },
  deleteSmallBtn: { width: 40, borderRadius: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },

  editPanel: { gap: 12, paddingTop: 4 },
  saveLimitsBtn: { borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  saveLimitsText: { fontFamily: "Nunito_700Bold", fontSize: 14 },

  logsPanel: { borderTopWidth: 1, paddingTop: 12, gap: 6, maxHeight: 240 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  logDot: { width: 6, height: 6, borderRadius: 3 },
  logAction: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12 },
  logTime: { fontFamily: "Nunito_400Regular", fontSize: 10 },
  logEmpty: { fontFamily: "Nunito_400Regular", fontSize: 12, textAlign: "center", paddingVertical: 12 },

  sectionHeader: { fontFamily: "Nunito_700Bold", fontSize: 11, letterSpacing: 2, marginLeft: 8, marginTop: 8 },
  apiCard: { borderRadius: 32, padding: 20, borderWidth: 1, gap: 16 },

  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  stepTitle: { fontFamily: "Nunito_700Bold", fontSize: 14, marginBottom: 2 },
  stepDesc: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18 },

  copyableBlock: { borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  copyableLabel: { fontFamily: "Nunito_700Bold", fontSize: 9, letterSpacing: 1.5, marginBottom: 4 },
  copyableValue: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 16 },
  copyBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  endpointList: { borderRadius: 12, padding: 12, gap: 8 },
  endpointItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  endpointPath: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  endpointDesc: { fontFamily: "Nunito_400Regular", fontSize: 11, color: "#888", paddingLeft: 46 },
  endpointDivider: { borderTopWidth: 1, marginVertical: 4 },
  methodPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },

  exampleCode: { fontFamily: "Nunito_400Regular", fontSize: 11, lineHeight: 18 },

  tipBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  tipText: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

  nwcStepList: { gap: 10, paddingLeft: 2 },
  nwcStep: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nwcStepNum: { fontFamily: "Nunito_700Bold", fontSize: 14, width: 20 },
  nwcStepText: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 384, borderRadius: 24, padding: 32, alignItems: "center", borderWidth: 1 },
  modalIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Chewy_400Regular", fontSize: 24, marginBottom: 8 },
  modalDesc: { fontFamily: "Nunito_400Regular", fontSize: 14, textAlign: "center", marginBottom: 20 },
  modalDeleteBtn: { width: "100%", backgroundColor: "#EF4444", borderRadius: 20, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  modalDeleteText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#FFFFFF" },
  modalCancelBtn: { width: "100%", borderRadius: 20, paddingVertical: 14, alignItems: "center" },
  modalCancelText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
});
