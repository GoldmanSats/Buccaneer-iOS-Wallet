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
import { APP_SUBPAGE_TITLE } from "@/constants/typography";
import {
  ensureWalletAgentEnabled,
  hasValidWalletAgentSession,
  walletAgentFetch,
} from "@/utils/walletAgentAccess";

const API_PATH = "/api/agent-access/policies";

interface AgentConnection {
  id: number;
  name: string;
  nwcUri: string | null;
  servicePubkey?: string | null;
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

async function formatError(error: unknown, fallback: string): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Bellamy server URL is not configured")) return message;
  if (message.includes("not available on web")) return "Agent Access currently works only in the native app.";
  if (message.includes("Authentication was cancelled")) return "Authentication was cancelled.";
  return message || fallback;
}

export default function AgentKeysScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const colors = settings.isDarkMode ? MIDNIGHT : DAYLIGHT;
  const isDark = settings.isDarkMode;
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [newDaily, setNewDaily] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState<number | null>(null);
  const [editLimits, setEditLimits] = useState<number | null>(null);
  const [editLimitVal, setEditLimitVal] = useState("");
  const [editDailyVal, setEditDailyVal] = useState("");
  const [connLogs, setConnLogs] = useState<Record<number, AgentLog[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<AgentConnection | null>(null);
  const [newRevealed, setNewRevealed] = useState<AgentConnection | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<"checking" | "setup" | "ready">("checking");
  const agentAccessEnabled = process.env.EXPO_PUBLIC_ENABLE_PER_USER_AGENT_ACCESS !== "0";

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  useEffect(() => {
    void (async () => {
      if (!agentAccessEnabled) {
        setSetupError("Per-user Agent Access is turned off in this app build.");
        setAccessState("setup");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const hasSession = await hasValidWalletAgentSession();
        if (hasSession) {
          await loadConnections("Unlock Agent Access");
        } else {
          setAccessState("setup");
          setIsLoading(false);
        }
      } catch (_e) {
        setAccessState("setup");
        setIsLoading(false);
      }
    })();
  }, [agentAccessEnabled]);

  useEffect(() => {
    if (loadError) setShowCreateForm(false);
  }, [loadError]);

  const loadConnections = async (promptMessage = "Unlock Agent Access") => {
    setIsLoading(true);
    setLoadError(null);
    setSetupError(null);
    setCreateError(null);
    try {
      const res = await walletAgentFetch(API_PATH, {}, { promptMessage });
      if (!res.ok) {
        setConnections([]);
        const data = await res.json().catch(() => null);
        const message = data?.message ?? "Couldn't load agent access right now.";
        setLoadError(message);
        setSetupError(message);
        setAccessState("setup");
        return;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        setConnections([]);
        setLoadError("Bellamy returned an unexpected response.");
        setSetupError("Bellamy returned an unexpected response.");
        setAccessState("setup");
        return;
      }
      const data = await res.json();
      setConnections(data.policies ?? []);
      setAccessState("ready");
    } catch (e) {
      setConnections([]);
      const message = await formatError(e, "Couldn't load agent access right now.");
      setLoadError(message);
      setSetupError(message);
      setAccessState("setup");
    } finally {
      setIsLoading(false);
    }
  };

  const enableAgentAccess = async () => {
    await ensureWalletAgentEnabled("Enable Agent Access");
    await loadConnections("Enable Agent Access");
  };

  const loadLogs = async (connId: number) => {
    try {
      const res = await walletAgentFetch(`${API_PATH}/${connId}/logs`, {}, { promptMessage: "Reconfirm Agent Access" });
      if (res.ok) {
        const data = await res.json();
        setConnLogs(prev => ({ ...prev, [connId]: data.logs ?? [] }));
      }
    } catch (_e) {}
  };

  const createConnection = async () => {
    if (!newName.trim()) return;
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreateError(null);
    setCreating(true);
    try {
      const res = await walletAgentFetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          spendingLimitSats: newLimit ? parseInt(newLimit) : undefined,
          maxDailySats: newDaily ? parseInt(newDaily) : undefined,
          connectionType: "nwc",
        }),
      }, { promptMessage: "Approve Agent Access" });
      if (res.ok) {
        const conn = await res.json();
        conn.spentToday = conn.spentToday ?? 0;
        setConnections((prev) => [...prev, conn]);
        setNewName("");
        setNewLimit("");
        setNewDaily("");
        setShowCreateForm(false);
        setNewRevealed(conn);
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        let message = "Couldn't create this connection right now.";
        try {
          const data = await res.json();
          if (typeof data?.message === "string" && data.message.trim()) message = data.message;
        } catch (_err) {}
        setCreateError(message);
      }
    } catch (e) {
      console.error("Failed to create connection", e);
      setCreateError(await formatError(e, "Couldn't reach the server to create this connection."));
    } finally {
      setCreating(false);
    }
  };

  const toggleConnection = async (conn: AgentConnection) => {
    try {
      const res = await walletAgentFetch(`${API_PATH}/${conn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !conn.isActive }),
      }, { promptMessage: "Approve Agent Access" });
      if (res.ok) {
        const updated = await res.json();
        setConnections(prev => prev.map(c => c.id === conn.id ? updated : c));
      }
    } catch (_e) {}
  };

  const deleteConnection = async (id: number) => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await walletAgentFetch(`${API_PATH}/${id}`, {
        method: "DELETE",
      }, { promptMessage: "Approve Agent Access" });
      if (res.ok) setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete connection", e);
    }
    setDeleteTarget(null);
  };

  const copyNwcUri = async (conn: AgentConnection) => {
    await Clipboard.setStringAsync(conn.nwcUri ?? "");
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedId(conn.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const spentPercent = (conn: AgentConnection) => {
    if (!conn.maxDailySats || conn.maxDailySats === 0) return 0;
    return Math.min(100, ((conn.spentToday ?? 0) / conn.maxDailySats) * 100);
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
          <Text style={[st.subtitle, { color: colors.textMuted }]}>Connect AI agents to your wallet via Nostr Wallet Connect</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[st.content, { paddingBottom: bottomPad + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {newRevealed && (
          <Animated.View entering={FadeInDown.duration(300)} style={[st.revealCard, {
            backgroundColor: "rgba(139,92,246,0.1)",
            borderColor: "rgba(139,92,246,0.3)",
          }]}>
            <View style={st.revealHeader}>
              <View style={[st.revealIcon, { backgroundColor: "rgba(139,92,246,0.2)" }]}>
                <Ionicons name="flash" size={18} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.revealTitle, { color: colors.text }]}>Connection Ready</Text>
                <Text style={[st.revealDesc, { color: colors.textMuted }]}>Copy this now -- it won't be shown again</Text>
              </View>
            </View>
            <View style={[st.revealUri, { backgroundColor: colors.bg + "99" }]}>
              <Text selectable style={[st.revealUriText, { color: colors.text }]} numberOfLines={4}>{newRevealed.nwcUri ?? ""}</Text>
            </View>
            <View style={st.revealActions}>
              <Pressable
                style={[st.revealCopyBtn, { backgroundColor: colors.purple }]}
                onPress={() => copyNwcUri(newRevealed)}
              >
                <Ionicons name={copiedId === newRevealed.id ? "checkmark" : "copy-outline"} size={16} color="#FFF" />
                <Text style={st.revealCopyText}>{copiedId === newRevealed.id ? "Copied!" : "Copy"}</Text>
              </Pressable>
              <Pressable style={[st.revealDoneBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setNewRevealed(null)}>
                <Text style={[st.revealDoneText, { color: colors.textSecondary }]}>Done</Text>
              </Pressable>
            </View>

            <View style={[st.usageCard, { backgroundColor: colors.bg + "99", borderColor: colors.border + "40" }]}>
              <View style={st.usageHeader}>
                <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
                <Text style={[st.usageTitle, { color: colors.text }]}>Quick Start</Text>
              </View>
              <Text style={[st.usageDesc, { color: colors.textMuted }]}>
                Copy this connection string and paste it into your chat with your AI agent. Just tell it "here's your wallet" -- that's all it needs to start sending and receiving sats.
              </Text>
              <View style={st.stepList}>
                <View style={st.step}>
                  <Text style={[st.stepNum, { color: colors.purple }]}>1</Text>
                  <Text style={[st.stepText, { color: colors.textSecondary }]}>Copy the connection string above</Text>
                </View>
                <View style={st.step}>
                  <Text style={[st.stepNum, { color: colors.purple }]}>2</Text>
                  <Text style={[st.stepText, { color: colors.textSecondary }]}>Paste it into your chat with your agent (Telegram, Discord, etc.)</Text>
                </View>
                <View style={st.step}>
                  <Text style={[st.stepNum, { color: colors.purple }]}>3</Text>
                  <Text style={[st.stepText, { color: colors.textSecondary }]}>Tell the agent "this is your NWC wallet connection"</Text>
                </View>
              </View>
              <View style={[st.tipBox, { backgroundColor: `${colors.purple}0F`, borderColor: `${colors.purple}33` }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.purple} />
                <Text style={[st.tipText, { color: colors.textSecondary }]}>
                  Spending limits you set are enforced automatically. Your phone stays the signer -- the agent can only spend what you allow.
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {accessState === "setup" && !showCreateForm && !newRevealed && (
          <View style={[st.introCard, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>
            <View style={st.introHeader}>
              <View style={[st.introIcon, { backgroundColor: `${colors.purple}26` }]}>
                <MaterialCommunityIcons name="shield-key-outline" size={20} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.introTitle, { color: colors.text }]}>Enable Agent Access</Text>
                <Text style={[st.introDesc, { color: colors.textMuted }]}>
                  Face ID confirms it's really you before Bellamy links agent access to this wallet and starts relaying requests back to your phone.
                </Text>
              </View>
            </View>

            {setupError ? (
              <Text style={st.inlineError}>{setupError}</Text>
            ) : null}

            <Pressable
              testID="enable-agent-access"
              style={[st.enableBtn, { backgroundColor: colors.purple }]}
              onPress={enableAgentAccess}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={[st.enableBtnText, { color: "#FFF" }]}>Enable Agent Access</Text>
              )}
            </Pressable>
          </View>
        )}

        {accessState === "ready" && !showCreateForm && !newRevealed && (
          <View style={[st.introCard, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>
            <View style={st.introHeader}>
              <View style={[st.introIcon, { backgroundColor: `${colors.purple}26` }]}>
                <MaterialCommunityIcons name="robot" size={20} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.introTitle, { color: colors.text }]}>Connect an Agent</Text>
                <Text style={[st.introDesc, { color: colors.textMuted }]}>
                  Create a Nostr Wallet Connect link for your AI agent. Your phone stays the signer -- Bellamy enforces the limits you set.
                </Text>
              </View>
            </View>

            <Pressable
              testID="start-create-connection"
              style={[st.createTriggerBtn, { backgroundColor: `${colors.purple}1A`, borderColor: `${colors.purple}33` }]}
              onPress={() => setShowCreateForm(true)}
            >
              <View style={[st.createTriggerIcon, { backgroundColor: `${colors.purple}33` }]}>
                <Ionicons name="add" size={20} color={colors.purple} />
              </View>
              <View style={st.createTriggerText}>
                <Text style={[st.createTriggerLabel, { color: colors.text }]}>New NWC Connection</Text>
                <Text style={[st.createTriggerSub, { color: colors.textMuted }]}>One connection string is all your agent needs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {accessState === "ready" && showCreateForm && !newRevealed && (
          <Animated.View entering={FadeInDown.duration(300)} style={[st.createCard, {
            backgroundColor: colors.bgCard,
            borderColor: `${colors.purple}4D`,
          }]}>
            <View style={st.createHeader}>
              <View style={[st.createHeaderIcon, { backgroundColor: `${colors.purple}33` }]}>
                <Ionicons name="flash" size={18} color={colors.purple} />
              </View>
              <Text style={[st.createTitle, { color: colors.text }]}>New NWC Connection</Text>
            </View>

            <View style={st.formField}>
              <Text style={[st.formLabel, { color: colors.textMuted }]}>AGENT NAME</Text>
              <TextInput
                testID="agent-key-name-input"
                style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                placeholder="e.g. My OpenClaw Bot"
                placeholderTextColor={colors.textMuted}
                value={newName}
                onChangeText={setNewName}
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
                  value={newLimit}
                  onChangeText={setNewLimit}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[st.formField, { flex: 1 }]}>
                <Text style={[st.formLabel, { color: colors.textMuted }]}>MAX PER DAY (SATS)</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.bgElevated + "80", borderColor: colors.border + "80", color: colors.text }]}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  value={newDaily}
                  onChangeText={setNewDaily}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {createError ? (
              <Text style={st.inlineError}>{createError}</Text>
            ) : null}

            <View style={st.createActions}>
              <Pressable style={[st.cancelBtn, { backgroundColor: colors.bgElevated }]} onPress={() => { setShowCreateForm(false); setNewName(""); setNewLimit(""); setNewDaily(""); setCreateError(null); }}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="confirm-create-key"
                style={[st.submitBtn, { backgroundColor: colors.purple }]}
                onPress={createConnection}
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

        {accessState === "checking" && isLoading ? (
          <View style={st.centerState}>
            <ActivityIndicator color={colors.purple} />
          </View>
        ) : accessState === "ready" && loadError && connections.length === 0 && !newRevealed ? (
          <View style={[st.emptyState, st.unavailableState, { backgroundColor: colors.bgCard, borderColor: colors.border + "80" }]}>
            <MaterialCommunityIcons name="server-off" size={40} color={colors.textMuted} />
            <Text style={[st.emptyTitle, { color: colors.text }]}>Agent access unavailable</Text>
            <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>{loadError}</Text>
          </View>
        ) : accessState === "ready" && connections.length === 0 && !showCreateForm && !newRevealed ? (
          <View style={st.emptyState}>
            <MaterialCommunityIcons name="robot" size={48} color={colors.textMuted + "4D"} />
            <Text style={[st.emptyTitle, { color: colors.textMuted }]}>Create your first agent connection above</Text>
          </View>
        ) : connections.length > 0 ? (
          <View style={st.connList}>
            {connections.map((conn) => {
              const pct = spentPercent(conn);
              return (
                <Animated.View key={conn.id} entering={FadeInDown} style={[st.connCard, {
                  backgroundColor: colors.bgCard,
                  borderColor: conn.isActive ? colors.border + "80" : "rgba(239,68,68,0.2)",
                  opacity: conn.isActive ? 1 : 0.6,
                }]}>
                  <View style={st.connRow1}>
                    <View style={[st.connIcon, { backgroundColor: conn.isActive ? `${colors.purple}26` : "rgba(239,68,68,0.15)" }]}>
                      <MaterialCommunityIcons name="robot" size={20} color={conn.isActive ? colors.purple : "#EF4444"} />
                    </View>
                    <View style={st.connMeta}>
                      <View style={st.connNameRow}>
                        <Text style={[st.connName, { color: colors.text }]}>{conn.name}</Text>
                        <View style={[st.nwcBadge, { backgroundColor: `${colors.purple}33` }]}>
                          <Text style={[st.nwcBadgeText, { color: colors.purple }]}>NWC</Text>
                        </View>
                      </View>
                      <Text style={[st.connPreview, { color: colors.textMuted }]}>Nostr Wallet Connect</Text>
                    </View>
                    <Switch
                      value={conn.isActive}
                      trackColor={{ false: isDark ? "#243354" : colors.border, true: colors.purple }}
                      thumbColor="#FFF"
                      onValueChange={() => toggleConnection(conn)}
                      style={{ transform: [{ scale: 0.8 }] }}
                    />
                  </View>

                  <View style={st.limitsGrid}>
                    <View style={[st.limitBox, { backgroundColor: colors.bgElevated + "66" }]}>
                      <Text style={[st.limitLabel, { color: colors.textMuted }]}>PER TX LIMIT</Text>
                      <Text style={[st.limitValue, { color: colors.text }]}>{conn.spendingLimitSats ? conn.spendingLimitSats.toLocaleString() + " sats" : "None"}</Text>
                    </View>
                    <View style={[st.limitBox, { backgroundColor: colors.bgElevated + "66" }]}>
                      <Text style={[st.limitLabel, { color: colors.textMuted }]}>DAILY LIMIT</Text>
                      <Text style={[st.limitValue, { color: colors.text }]}>{conn.maxDailySats ? conn.maxDailySats.toLocaleString() + " sats" : "None"}</Text>
                    </View>
                  </View>

                  {conn.maxDailySats ? (
                    <View style={st.progressSection}>
                      <View style={st.progressHeader}>
                        <Text style={[st.progressLabel, { color: colors.textMuted }]}>SPENT TODAY</Text>
                        <Text style={[st.progressValue, { color: colors.text }]}>{(conn.spentToday ?? 0).toLocaleString()} / {(conn.maxDailySats ?? 0).toLocaleString()}</Text>
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
                        if (showLogs === conn.id) { setShowLogs(null); } else { setShowLogs(conn.id); if (!connLogs[conn.id]) loadLogs(conn.id); }
                      }}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={[st.actionBtnText, { color: colors.textSecondary }]}>{showLogs === conn.id ? "Hide Log" : "Activity Log"}</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { backgroundColor: colors.bgElevated + "80" }]}
                      onPress={() => {
                        if (editLimits === conn.id) { setEditLimits(null); } else {
                          setEditLimits(conn.id);
                          setEditLimitVal(conn.spendingLimitSats?.toString() ?? "");
                          setEditDailyVal(conn.maxDailySats?.toString() ?? "");
                        }
                      }}
                    >
                      <Ionicons name="shield-outline" size={14} color={colors.textSecondary} />
                      <Text style={[st.actionBtnText, { color: colors.textSecondary }]}>{editLimits === conn.id ? "Cancel" : "Edit Limits"}</Text>
                    </Pressable>
                    <Pressable
                      testID={`delete-conn-${conn.id}`}
                      style={[st.deleteSmallBtn, { backgroundColor: "rgba(239,68,68,0.1)" }]}
                      onPress={() => setDeleteTarget(conn)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </Pressable>
                  </View>

                  {editLimits === conn.id && (
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
                        style={[st.saveLimitsBtn, { backgroundColor: colors.purple }]}
                        onPress={async () => {
                          try {
                            const res = await walletAgentFetch(`${API_PATH}/${conn.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                spendingLimitSats: editLimitVal ? parseInt(editLimitVal) : null,
                                maxDailySats: editDailyVal ? parseInt(editDailyVal) : null,
                              }),
                            }, { promptMessage: "Approve Agent Access" });
                            if (res.ok) {
                              const updated = await res.json();
                              setConnections(prev => prev.map(c => c.id === conn.id ? updated : c));
                              setEditLimits(null);
                            }
                          } catch (_e) {}
                        }}
                      >
                        <Text style={st.saveLimitsText}>Save Limits</Text>
                      </Pressable>
                    </Animated.View>
                  )}

                  {showLogs === conn.id && (
                    <Animated.View entering={FadeInDown.duration(200)} style={[st.logsPanel, { borderTopColor: colors.border + "50" }]}>
                      {connLogs[conn.id]?.length ? (
                        connLogs[conn.id]!.slice(0, 20).map((log) => (
                          <View key={log.id} style={st.logRow}>
                            <View style={[st.logDot, { backgroundColor: log.status === "success" || log.status === "completed" ? "#22C55E" : log.status === "denied" || log.status === "rejected" ? "#EAB308" : "#EF4444" }]} />
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

        {connections.length > 0 && !newRevealed && (
          <>
            <View style={[st.howItWorksCard, { backgroundColor: colors.bgCard, borderColor: `${colors.purple}1A` }]}>
              <View style={st.usageHeader}>
                <Ionicons name="flash-outline" size={16} color={colors.purple} />
                <Text style={[st.usageTitle, { color: colors.text }]}>How It Works</Text>
              </View>
              <View style={st.stepList}>
                <View style={st.step}>
                  <View style={[st.howStepDot, { backgroundColor: `${colors.purple}33` }]}>
                    <Text style={[st.howStepNum, { color: colors.purple }]}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.howStepTitle, { color: colors.text }]}>Agent sends an NWC request</Text>
                    <Text style={[st.howStepDesc, { color: colors.textMuted }]}>Your agent connects directly to Bellamy using the NWC string. Balance and transaction lookups return instantly.</Text>
                  </View>
                </View>
                <View style={st.step}>
                  <View style={[st.howStepDot, { backgroundColor: `${colors.purple}33` }]}>
                    <Text style={[st.howStepNum, { color: colors.purple }]}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.howStepTitle, { color: colors.text }]}>Bellamy checks your limits</Text>
                    <Text style={[st.howStepDesc, { color: colors.textMuted }]}>Spending limits you set are enforced automatically. If the request exceeds them, it's rejected before reaching your phone.</Text>
                  </View>
                </View>
                <View style={st.step}>
                  <View style={[st.howStepDot, { backgroundColor: `${colors.purple}33` }]}>
                    <Text style={[st.howStepNum, { color: colors.purple }]}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.howStepTitle, { color: colors.text }]}>Your phone signs the transaction</Text>
                    <Text style={[st.howStepDesc, { color: colors.textMuted }]}>Payments are relayed to your phone for execution. Your wallet keys never leave your device -- self-custody is preserved.</Text>
                  </View>
                </View>
              </View>
              <View style={[st.tipBox, { backgroundColor: `${colors.purple}0F`, borderColor: `${colors.purple}33` }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.purple} />
                <Text style={[st.tipText, { color: colors.textSecondary }]}>
                  Your wallet keys never leave your phone. Bellamy only routes encrypted messages between your agent and your device.
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
            <Pressable style={st.modalDeleteBtn} onPress={() => deleteTarget && deleteConnection(deleteTarget.id)}>
              <Text style={st.modalDeleteText}>Revoke Connection</Text>
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
  title: APP_SUBPAGE_TITLE,
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

  introCard: { borderRadius: 32, padding: 24, borderWidth: 1, gap: 12 },
  introHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 4 },
  introIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  introTitle: { fontFamily: "Nunito_700Bold", fontSize: 18 },
  introDesc: { fontFamily: "Nunito_400Regular", fontSize: 13, lineHeight: 20, marginTop: 4 },
  enableBtn: { borderRadius: 20, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  enableBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15 },

  createTriggerBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, padding: 14, borderWidth: 1 },
  createTriggerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  createTriggerText: { flex: 1, gap: 2 },
  createTriggerLabel: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  createTriggerSub: { fontFamily: "Nunito_400Regular", fontSize: 10, lineHeight: 14 },

  createCard: { borderRadius: 32, padding: 24, borderWidth: 1, gap: 16 },
  createHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  createHeaderIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  createTitle: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  formField: { gap: 6 },
  formLabel: { fontFamily: "Nunito_700Bold", fontSize: 10, letterSpacing: 1.5 },
  formRow: { flexDirection: "row", gap: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, letterSpacing: 0.5 },
  inlineError: { fontFamily: "Nunito_600SemiBold", fontSize: 12, lineHeight: 18, color: "#EF4444" },
  createActions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 20, paddingVertical: 12, alignItems: "center" },
  cancelText: { fontFamily: "Nunito_600SemiBold", fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 20, paddingVertical: 12, alignItems: "center" },
  submitText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#FFF" },

  centerState: { alignItems: "center", paddingVertical: 48 },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 16 },
  emptySubtitle: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 280 },
  unavailableState: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 24 },

  connList: { gap: 16 },
  connCard: { borderRadius: 32, padding: 20, borderWidth: 1, gap: 12 },
  connRow1: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  connIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  connMeta: { flex: 1, gap: 2 },
  connNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  connName: { fontFamily: "Nunito_700Bold", fontSize: 14 },
  nwcBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  nwcBadgeText: { fontFamily: "Nunito_700Bold", fontSize: 8 },
  connPreview: { fontFamily: "Nunito_400Regular", fontSize: 10 },

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
  saveLimitsText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#FFF" },

  logsPanel: { borderTopWidth: 1, paddingTop: 12, gap: 6, maxHeight: 240 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  logDot: { width: 6, height: 6, borderRadius: 3 },
  logAction: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 12 },
  logTime: { fontFamily: "Nunito_400Regular", fontSize: 10 },
  logEmpty: { fontFamily: "Nunito_400Regular", fontSize: 12, textAlign: "center", paddingVertical: 12 },

  howItWorksCard: { borderRadius: 32, padding: 20, borderWidth: 1, gap: 16 },
  stepList: { gap: 14, paddingLeft: 2 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: { fontFamily: "Nunito_700Bold", fontSize: 14, width: 20 },
  stepText: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },
  howStepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  howStepNum: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  howStepTitle: { fontFamily: "Nunito_700Bold", fontSize: 13, marginBottom: 2 },
  howStepDesc: { fontFamily: "Nunito_400Regular", fontSize: 11, lineHeight: 16 },

  tipBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  tipText: { fontFamily: "Nunito_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

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
