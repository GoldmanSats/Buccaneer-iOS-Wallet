import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  fiatCurrency: text("fiat_currency").notNull().default("USD"),
  primaryDisplay: text("primary_display").notNull().default("sats"),
  soundEffectsEnabled: boolean("sound_effects_enabled").notNull().default(true),
  backupCompleted: boolean("backup_completed").notNull().default(false),
  lightningAddress: text("lightning_address").notNull().default("buccaneeradiciw@breez.tips"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;

export const ownerDevicesTable = pgTable("owner_devices", {
  id: serial("id").primaryKey(),
  publicKey: text("public_key").notNull().unique(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const insertOwnerDeviceSchema = createInsertSchema(ownerDevicesTable).omit({ id: true, createdAt: true });
export type InsertOwnerDevice = z.infer<typeof insertOwnerDeviceSchema>;
export type OwnerDevice = typeof ownerDevicesTable.$inferSelect;

export const ownerAuthChallengesTable = pgTable("owner_auth_challenges", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  nonce: text("nonce").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
});

export const insertOwnerAuthChallengeSchema = createInsertSchema(ownerAuthChallengesTable).omit({ id: true, createdAt: true });
export type InsertOwnerAuthChallenge = z.infer<typeof insertOwnerAuthChallengeSchema>;
export type OwnerAuthChallenge = typeof ownerAuthChallengesTable.$inferSelect;

export const ownerSessionsTable = pgTable("owner_sessions", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  sessionHash: text("session_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const insertOwnerSessionSchema = createInsertSchema(ownerSessionsTable).omit({ id: true, createdAt: true });
export type InsertOwnerSession = z.infer<typeof insertOwnerSessionSchema>;
export type OwnerSession = typeof ownerSessionsTable.$inferSelect;

export const walletAgentIdentitiesTable = pgTable("wallet_agent_identities", {
  id: serial("id").primaryKey(),
  walletPublicKey: text("wallet_public_key").notNull().unique(),
  walletLabel: text("wallet_label"),
  walletMode: text("wallet_mode").notNull().default("seed"),
  pushToken: text("push_token"),
  pushPlatform: text("push_platform"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
  revokedAt: timestamp("revoked_at"),
});

export const walletAgentChallengesTable = pgTable("wallet_agent_challenges", {
  id: serial("id").primaryKey(),
  identityId: integer("identity_id").notNull(),
  nonce: text("nonce").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
});

export const walletAgentSessionsTable = pgTable("wallet_agent_sessions", {
  id: serial("id").primaryKey(),
  identityId: integer("identity_id").notNull(),
  sessionHash: text("session_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const walletAgentPoliciesTable = pgTable("wallet_agent_policies", {
  id: serial("id").primaryKey(),
  identityId: integer("identity_id").notNull(),
  name: text("name").notNull(),
  connectionType: text("connection_type").notNull().default("api"),
  tokenHash: text("token_hash").unique(),
  tokenPreview: text("token_preview"),
  nwcSecretKey: text("nwc_secret_key"),
  nwcClientPubkey: text("nwc_client_pubkey"),
  spendingLimitSats: integer("spending_limit_sats"),
  maxDailySats: integer("max_daily_sats"),
  spentToday: integer("spent_today").notNull().default(0),
  spentDate: text("spent_date"),
  approvalMode: text("approval_mode").notNull().default("session"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const walletAgentRequestsTable = pgTable("wallet_agent_requests", {
  id: serial("id").primaryKey(),
  identityId: integer("identity_id").notNull(),
  policyId: integer("policy_id").notNull(),
  requestType: text("request_type").notNull(),
  requestPayload: text("request_payload").notNull(),
  responsePayload: text("response_payload"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  amountSats: integer("amount_sats"),
  requiresFreshApproval: boolean("requires_fresh_approval").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),
});

export const walletAgentSnapshotsTable = pgTable("wallet_agent_snapshots", {
  id: serial("id").primaryKey(),
  identityId: integer("identity_id").notNull().unique(),
  balanceJson: text("balance_json"),
  transactionsJson: text("transactions_json"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WalletAgentIdentity = typeof walletAgentIdentitiesTable.$inferSelect;
export type WalletAgentChallenge = typeof walletAgentChallengesTable.$inferSelect;
export type WalletAgentSession = typeof walletAgentSessionsTable.$inferSelect;
export type WalletAgentPolicy = typeof walletAgentPoliciesTable.$inferSelect;
export type WalletAgentRequest = typeof walletAgentRequestsTable.$inferSelect;
export type WalletAgentSnapshot = typeof walletAgentSnapshotsTable.$inferSelect;

export const agentKeysTable = pgTable("agent_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nwcUri: text("nwc_uri").notNull(),
  secretKey: text("secret_key"),
  nwcClientPubkey: text("nwc_client_pubkey"),
  secretHash: text("secret_hash").unique(),
  spendingLimitSats: integer("spending_limit_sats"),
  maxDailySats: integer("max_daily_sats"),
  spentToday: integer("spent_today").notNull().default(0),
  spentDate: text("spent_date"),
  connectionType: text("connection_type").notNull().default("nwc"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const insertAgentKeySchema = createInsertSchema(agentKeysTable).omit({ id: true, createdAt: true });
export type InsertAgentKey = z.infer<typeof insertAgentKeySchema>;
export type AgentKey = typeof agentKeysTable.$inferSelect;

export const transactionCacheTable = pgTable("transaction_cache", {
  id: serial("id").primaryKey(),
  txId: text("tx_id").notNull().unique(),
  type: text("type").notNull(),
  amountSats: integer("amount_sats").notNull(),
  feeSats: integer("fee_sats").notNull().default(0),
  description: text("description"),
  paymentHash: text("payment_hash"),
  status: text("status").notNull().default("complete"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionCacheTable).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionCacheTable.$inferSelect;

export const transactionMemosTable = pgTable("transaction_memos", {
  txId: text("tx_id").primaryKey(),
  memo: text("memo").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TransactionMemo = typeof transactionMemosTable.$inferSelect;

export const agentLogsTable = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id").notNull(),
  action: text("action").notNull(),
  amount: integer("amount"),
  status: text("status").notNull().default("success"),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AgentLog = typeof agentLogsTable.$inferSelect;
