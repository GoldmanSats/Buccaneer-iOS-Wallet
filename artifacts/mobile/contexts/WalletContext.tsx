import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  timestamp: string;
  status: string;
  paymentHash: string;
}

interface BtcPrice {
  currency: string;
  price: number;
  symbol: string;
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
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useQuery<Balance>({
    queryKey: ["balance"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/balance`);
      if (!res.ok) throw new Error("Failed to fetch balance");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: txData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ["transactions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/transactions`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: btcPrice } = useQuery<BtcPrice>({
    queryKey: ["btc-price"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wallet/btc-price`);
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
  }), [balance, txData, btcPrice, isBalanceLoading, isTransactionsLoading, sendPayment, createInvoice, decodeInvoice]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
