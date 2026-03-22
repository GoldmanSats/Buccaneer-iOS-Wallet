import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "./SettingsContext";

const API_BASE = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

interface Balance {
  balanceSats: number;
  pendingSendSats: number;
  pendingReceiveSats: number;
}

interface Transaction {
  id: string;
  type: "send" | "receive";
  amountSats: number;
  feeSats: number;
  description: string;
  memo: string;
  timestamp: string;
  status: string;
  paymentHash: string;
}

interface BtcPrice {
  currency: string;
  price: number;
  symbol: string;
}

interface ParsedInput {
  type: "bolt11" | "lnurl" | "lightning_address" | "bitcoin" | "unknown";
  invoice?: string;
  address?: string;
  amountSats?: number;
  description?: string;
}

interface NodeInfo {
  pubkey: string;
  network: string;
  blockHeight: number;
  balanceSat: number;
}

interface WalletContextValue {
  balance: Balance | null;
  transactions: Transaction[];
  btcPrice: BtcPrice | null;
  isBalanceLoading: boolean;
  isTransactionsLoading: boolean;
  refetchBalance: () => void;
  refetchTransactions: () => void;
  sendPayment: (bolt11: string, amountSats?: number) => Promise<{ success: boolean; feeSats: number; amountSats: number }>;
  createInvoice: (amountSats: number, description?: string) => Promise<{ bolt11: string }>;
  decodeInvoice: (bolt11: string) => Promise<{ amountSats?: number; description?: string; isExpired: boolean }>;
  parseInput: (input: string) => Promise<ParsedInput>;
  updateMemo: (txId: string, memo: string) => Promise<void>;
  getNodeInfo: () => Promise<NodeInfo>;
  getSdkStatus: () => Promise<{ initialized: boolean; error: string | null }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useQuery<Balance>({
    queryKey: ["balance"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/balance`);
      if (!res.ok) throw new Error("Failed to fetch balance");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: txData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ["transactions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/transactions`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: btcPrice } = useQuery<BtcPrice>({
    queryKey: ["btc-price", settings.fiatCurrency],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/btc-price?currency=${encodeURIComponent(settings.fiatCurrency)}`);
      if (!res.ok) throw new Error("Failed to fetch price");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const sendPayment = useCallback(async (bolt11: string, amountSats?: number) => {
    const res = await fetch(`${API_BASE}/wallet/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bolt11, amountSats }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Payment failed");
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    return data;
  }, [queryClient]);

  const createInvoice = useCallback(async (amountSats: number, description?: string) => {
    const res = await fetch(`${API_BASE}/wallet/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSats, description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to create invoice");
    return data;
  }, []);

  const decodeInvoice = useCallback(async (bolt11: string) => {
    const res = await fetch(`${API_BASE}/wallet/decode-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bolt11 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to decode invoice");
    return data;
  }, []);

  const parseInputFn = useCallback(async (input: string): Promise<ParsedInput> => {
    const res = await fetch(`${API_BASE}/wallet/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to parse input");
    return data;
  }, []);

  const updateMemo = useCallback(async (txId: string, memo: string) => {
    const res = await fetch(`${API_BASE}/wallet/transactions/${encodeURIComponent(txId)}/memo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo }),
    });
    if (!res.ok) throw new Error("Failed to update memo");
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const getNodeInfoFn = useCallback(async (): Promise<NodeInfo> => {
    const res = await fetch(`${API_BASE}/wallet/node-info`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to get node info");
    return data;
  }, []);

  const getSdkStatusFn = useCallback(async () => {
    const res = await fetch(`${API_BASE}/wallet/status`);
    return res.json();
  }, []);

  const value = useMemo(() => ({
    balance: balance ?? null,
    transactions: txData?.transactions ?? [],
    btcPrice: btcPrice ?? null,
    isBalanceLoading,
    isTransactionsLoading,
    refetchBalance,
    refetchTransactions,
    sendPayment,
    createInvoice,
    decodeInvoice,
    parseInput: parseInputFn,
    updateMemo,
    getNodeInfo: getNodeInfoFn,
    getSdkStatus: getSdkStatusFn,
  }), [balance, txData, btcPrice, isBalanceLoading, isTransactionsLoading, sendPayment, createInvoice, decodeInvoice, parseInputFn, updateMemo, getNodeInfoFn, getSdkStatusFn]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
