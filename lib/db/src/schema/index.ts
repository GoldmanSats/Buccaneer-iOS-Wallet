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

export const agentKeysTable = pgTable("agent_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nwcUri: text("nwc_uri").notNull(),
  secretKey: text("secret_key").notNull(),
  spendingLimitSats: integer("spending_limit_sats"),
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
