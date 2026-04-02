import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { useSettings } from "./SettingsContext";
import * as BreezService from "@/utils/breezService";

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
  agentName?: string;
  agentKeyId?: number;
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
  isOffline: boolean;
  sdkReady: boolean;
}

const FIAT_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", NZD: "NZ$", AUD: "A$", CAD: "C$", JPY: "¥", CHF: "CHF",
};

const WalletContext = createContext<WalletContextValue | null>(null);

const API_BASE = `${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
const USE_ON_DEVICE = Platform.OS !== "web";
const OWNER_TOKEN = process.env.EXPO_PUBLIC_WALLET_OWNER_TOKEN ?? "";

function walletHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (OWNER_TOKEN) h["X-Wallet-Owner"] = OWNER_TOKEN;
  return h;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [isOffline, setIsOffline] = useState(false);
  const [sdkReady, setSdkReady] = useState(!USE_ON_DEVICE);

  useEffect(() => {
    if (!USE_ON_DEVICE) return;
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;

    const tryInit = async () => {
      try {
        await BreezService.initBreezSdk();
        if (!cancelled) {
          setSdkReady(true);
          setIsOffline(false);
        }
      } catch (err) {
        console.error("[WalletContext] SDK init failed (attempt " + (retryCount + 1) + "):", err);
        retryCount++;
        if (!cancelled && retryCount < maxRetries) {
          setTimeout(tryInit, 3000 * retryCount);
        } else if (!cancelled) {
          setIsOffline(true);
        }
      }
    };

    tryInit();
    return () => { cancelled = true; };
  }, []);

  const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useQuery<Balance>({
    queryKey: ["balance"],
    queryFn: async () => {
      try {
        if (USE_ON_DEVICE) {
          const b = await BreezService.getBalance();
          setIsOffline(false);
          return b;
        }
        const res = await fetch(`${API_BASE}/wallet/balance`, { headers: walletHeaders() });
        if (!res.ok) throw new Error("Failed to fetch balance");
        setIsOffline(false);
        return res.json();
      } catch (err) {
        setIsOffline(true);
        throw err;
      }
    },
    refetchInterval: 5000,
    retry: 1,
    enabled: USE_ON_DEVICE ? sdkReady : true,
  });

  const { data: txData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ["transactions"],
    queryFn: async () => {
      if (USE_ON_DEVICE) {
        const payments = await BreezService.listPayments();
        const memos = await BreezService.getMemos();
        const transactions: Transaction[] = payments.map((p: any) => ({
          id: p.id,
          type: p.type,
          amountSats: p.amountSats,
          feeSats: p.feeSats,
          description: p.description,
          memo: memos[p.id] || "",
          timestamp: p.timestamp,
          status: p.status,
          paymentHash: p.paymentHash,
        }));
        return { transactions, total: transactions.length };
      }
      const res = await fetch(`${API_BASE}/wallet/transactions`, { headers: walletHeaders() });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: USE_ON_DEVICE ? sdkReady : true,
  });

  const { data: btcPrice } = useQuery<BtcPrice>({
    queryKey: ["btc-price", settings.fiatCurrency],
    queryFn: async () => {
      try {
        const currency = settings.fiatCurrency || "USD";
        const res = await fetch(
          `https://api.coinbase.com/v2/prices/BTC-${currency}/spot`
        );
        if (res.ok) {
          const data = await res.json();
          const price = parseFloat(data.data?.amount || "0");
          if (price > 0) {
            return {
              currency,
              price,
              symbol: FIAT_SYMBOLS[currency] || currency,
            };
          }
        }
      } catch {}
      try {
        const currency = (settings.fiatCurrency || "USD").toLowerCase();
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency}`
        );
        if (res.ok) {
          const data = await res.json();
          const price = data.bitcoin?.[currency] || 0;
          return {
            currency: settings.fiatCurrency || "USD",
            price,
            symbol: FIAT_SYMBOLS[settings.fiatCurrency || "USD"] || settings.fiatCurrency,
          };
        }
      } catch {}
      return { currency: settings.fiatCurrency || "USD", price: 0, symbol: "$" };
    },
    refetchInterval: 60000,
  });

  const sendPaymentFn = useCallback(async (bolt11: string, amountSats?: number) => {
    if (USE_ON_DEVICE) {
      const result = await BreezService.sendPayment(bolt11, amountSats);
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      return result;
    }
    const res = await fetch(`${API_BASE}/wallet/send`, {
      method: "POST",
      headers: walletHeaders(),
      body: JSON.stringify({ bolt11, amountSats }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Payment failed");
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    return data;
  }, [queryClient]);

  const createInvoice = useCallback(async (amountSats: number, description?: string) => {
    if (USE_ON_DEVICE) {
      return BreezService.receivePayment(amountSats, description);
    }
    const res = await fetch(`${API_BASE}/wallet/receive`, {
      method: "POST",
      headers: walletHeaders(),
      body: JSON.stringify({ amountSats, description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to create invoice");
    return data;
  }, []);

  const decodeInvoiceFn = useCallback(async (bolt11: string) => {
    if (USE_ON_DEVICE) {
      return BreezService.decodeInvoice(bolt11);
    }
    const res = await fetch(`${API_BASE}/wallet/decode-invoice`, {
      method: "POST",
      headers: walletHeaders(),
      body: JSON.stringify({ bolt11 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to decode invoice");
    return data;
  }, []);

  const parseInputFn = useCallback(async (input: string): Promise<ParsedInput> => {
    if (USE_ON_DEVICE) {
      return BreezService.parseInput(input) as Promise<ParsedInput>;
    }
    const res = await fetch(`${API_BASE}/wallet/parse`, {
      method: "POST",
      headers: walletHeaders(),
      body: JSON.stringify({ input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to parse input");
    return data;
  }, []);

  const updateMemo = useCallback(async (txId: string, memo: string) => {
    if (USE_ON_DEVICE) {
      await BreezService.saveMemo(txId, memo);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      return;
    }
    const res = await fetch(`${API_BASE}/wallet/transactions/${encodeURIComponent(txId)}/memo`, {
      method: "PATCH",
      headers: walletHeaders(),
      body: JSON.stringify({ memo }),
    });
    if (!res.ok) throw new Error("Failed to update memo");
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const getNodeInfoFn = useCallback(async (): Promise<NodeInfo> => {
    if (USE_ON_DEVICE) {
      return BreezService.getNodeInfo();
    }
    const res = await fetch(`${API_BASE}/wallet/node-info`, { headers: walletHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Failed to get node info");
    return data;
  }, []);

  const getSdkStatusFn = useCallback(async () => {
    if (USE_ON_DEVICE) {
      return BreezService.getSdkStatus();
    }
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
    sendPayment: sendPaymentFn,
    createInvoice,
    decodeInvoice: decodeInvoiceFn,
    parseInput: parseInputFn,
    updateMemo,
    getNodeInfo: getNodeInfoFn,
    getSdkStatus: getSdkStatusFn,
    isOffline,
    sdkReady,
  }), [balance, txData, btcPrice, isBalanceLoading, isTransactionsLoading, sendPaymentFn, createInvoice, decodeInvoiceFn, parseInputFn, updateMemo, getNodeInfoFn, getSdkStatusFn, isOffline, sdkReady]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
