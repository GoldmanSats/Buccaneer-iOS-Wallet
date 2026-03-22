import { createRequire } from "module";
import { db } from "@workspace/db";
import { transactionCacheTable } from "@workspace/db";

const require = createRequire(import.meta.url);

let sdkInstance: any = null;
let sdkInitializing: Promise<any> | null = null;
let lastPrepareResponse: any = null;
let lastLnurlPrepareResponse: any = null;
let pendingIncomingPayments: any[] = [];
let lastKnownPaymentCount = 0;
let pendingDeposits: any[] = [];

class BreezLogger {
  log = (logEntry: any) => {
    if (logEntry.level === "ERROR" || logEntry.level === "WARN") {
      console.log(`[Breez ${logEntry.level}] ${logEntry.line}`);
    }
  };
}

class BreezEventListener {
  onEvent = (event: any) => {
    try {
      const sanitized = sanitizeBigInt(event);
      console.log(`[Breez event] ${JSON.stringify(sanitized)}`);

      if (event.type === "unclaimedDeposits" && event.unclaimedDeposits) {
        const deposits = sanitizeBigInt(event.unclaimedDeposits);
        pendingDeposits = deposits;
        console.log(`[Breez] Unclaimed on-chain deposits detected: ${deposits.length} deposit(s), total ${deposits.reduce((s: number, d: any) => s + (d.amountSats || 0), 0)} sats`);
        autoClaimDeposits(deposits);
      }

      if (event.type === "claimedDeposits" && event.claimedDeposits) {
        const claimed = sanitizeBigInt(event.claimedDeposits);
        const claimedKeys = new Set(claimed.map((d: any) => `${d.txid}:${d.vout}`));
        pendingDeposits = pendingDeposits.filter(d => !claimedKeys.has(`${d.txid}:${d.vout}`));
        const totalClaimed = claimed.reduce((s: number, d: any) => s + (d.amountSats || 0), 0);
        console.log(`[Breez] Deposits claimed: ${claimed.length} deposit(s), ${totalClaimed} sats`);
        pendingIncomingPayments.push({
          id: `deposit-${Date.now()}`,
          amount: totalClaimed,
          timestamp: Math.floor(Date.now() / 1000),
          description: "On-chain deposit confirmed",
        });
      }

      const paymentData = event.payment || event.details;
      if (event.type === "paymentSucceeded" && paymentData) {
        const payment = sanitizeBigInt(paymentData);
        if (payment.paymentType === "receive") {
          pendingIncomingPayments.push({
            id: payment.id,
            amount: payment.amount || 0,
            timestamp: payment.timestamp || Math.floor(Date.now() / 1000),
            description: payment.details?.description || "Incoming payment",
          });
          console.log(`[Breez] Incoming payment detected: ${payment.amount} sats`);
        }
      }
    } catch {
      console.log(`[Breez event] ${event?.type || "unknown"}`);
    }
  };
}

async function autoClaimDeposits(deposits: any[]) {
  if (!sdkInstance || deposits.length === 0) return;
  const feeRates = [10, 25, 50];
  for (const deposit of deposits) {
    for (const rate of feeRates) {
      try {
        console.log(`[Breez] Auto-claiming deposit ${deposit.txid}:${deposit.vout} (${deposit.amountSats} sats) at ${rate} sat/vB`);
        await sdkInstance.claimDeposit({
          txid: deposit.txid,
          vout: deposit.vout,
          maxFee: { type: "rate", satPerVbyte: rate }
        });
        console.log(`[Breez] Auto-claim succeeded for ${deposit.txid}:${deposit.vout} at ${rate} sat/vB`);
        break;
      } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("already claimed")) {
          console.log(`[Breez] Deposit ${deposit.txid}:${deposit.vout} already claimed`);
          break;
        }
        if (msg.includes("maxDepositClaimFeeExceeded") || msg.includes("Max deposit claim fee")) {
          console.log(`[Breez] Fee ${rate} sat/vB too low for ${deposit.txid}:${deposit.vout}, trying higher`);
          continue;
        }
        console.log(`[Breez] Auto-claim failed for ${deposit.txid}:${deposit.vout}: ${msg}`);
        break;
      }
    }
  }
}

function sanitizeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeBigInt(value);
    }
    return result;
  }
  return obj;
}

export async function initBreezSdk(): Promise<any> {
  if (sdkInstance) return sdkInstance;
  if (sdkInitializing) return sdkInitializing;

  sdkInitializing = (async () => {
    try {
      const breez = require("@breeztech/breez-sdk-spark/nodejs");

      await breez.initLogging(new BreezLogger());

      const apiKey = process.env.BREEZ_API_KEY;
      if (!apiKey) {
        throw new Error("BREEZ_API_KEY environment variable is not set");
      }

      const mnemonic = process.env.WALLET_MNEMONIC;
      if (!mnemonic) {
        throw new Error("WALLET_MNEMONIC environment variable is not set");
      }

      const config = breez.defaultConfig("mainnet");
      config.apiKey = apiKey;
      config.maxDepositClaimFee = { type: "rate", satPerVbyte: 10 };

      const seed = { type: "mnemonic" as const, mnemonic };

      const storageDir = "./.breez-data";
      const { mkdirSync } = await import("fs");
      try { mkdirSync(storageDir, { recursive: true }); } catch {}

      const sdkBuilder = breez.SdkBuilder.new(config, seed);
      const builderWithStorage = await sdkBuilder.withDefaultStorage(storageDir);
      const sdk = await builderWithStorage.build();

      await sdk.addEventListener(new BreezEventListener());

      sdkInstance = sdk;
      console.log("[Breez] SDK initialized successfully on mainnet");

      try {
        const unclaimedResp = await sdk.listUnclaimedDeposits({});
        if (unclaimedResp?.deposits?.length > 0) {
          pendingDeposits = sanitizeBigInt(unclaimedResp.deposits);
          console.log(`[Breez] Found ${pendingDeposits.length} unclaimed deposit(s) on startup`);
          autoClaimDeposits(pendingDeposits);
        }
      } catch (err: any) {
        console.log(`[Breez] Could not check unclaimed deposits: ${err.message}`);
      }

      return sdk;
    } catch (err: any) {
      console.error(`[Breez] SDK initialization failed: ${err.message}`);
      sdkInitializing = null;
      throw err;
    }
  })();

  return sdkInitializing;
}

export function getAndClearPendingPayments(): any[] {
  const payments = [...pendingIncomingPayments];
  pendingIncomingPayments = [];
  return payments;
}

export function hasPendingPayments(): boolean {
  return pendingIncomingPayments.length > 0;
}

export function getPendingDeposits(): any[] {
  return [...pendingDeposits];
}

export function isBreezReady(): boolean {
  return sdkInstance !== null;
}

export function getSdkStatus(): { initialized: boolean; error: string | null } {
  return { initialized: sdkInstance !== null, error: null };
}

export async function getBreezWalletInfo() {
  const sdk = await initBreezSdk();
  const info = await sdk.getInfo({});
  return sanitizeBigInt(info);
}

export async function getBalance(): Promise<{
  balanceSats: number;
  pendingSendSats: number;
  pendingReceiveSats: number;
}> {
  const sdk = await initBreezSdk();
  try {
    const info = await sdk.getInfo({});
    const sanitized = sanitizeBigInt(info);
    console.log("[Breez] getInfo:", JSON.stringify(sanitized));
    return {
      balanceSats: sanitized.balanceSats || sanitized.balanceSat || 0,
      pendingSendSats: sanitized.pendingSendSats || 0,
      pendingReceiveSats: sanitized.pendingReceiveSats || sanitized.pendingReceive || 0,
    };
  } catch (err: any) {
    console.error(`[Breez] getBalance error: ${err.message}`);
    return { balanceSats: 0, pendingSendSats: 0, pendingReceiveSats: 0 };
  }
}

export async function getNodeInfo(): Promise<{
  pubkey: string;
  network: string;
  blockHeight: number;
  balanceSat: number;
  pendingSendSat: number;
  pendingReceiveSat: number;
}> {
  const sdk = await initBreezSdk();
  try {
    const info = await sdk.getInfo({});
    const sanitized = sanitizeBigInt(info);
    return {
      pubkey: sanitized.pubkey || sanitized.nodeId || "",
      network: "mainnet",
      blockHeight: sanitized.blockHeight || 0,
      balanceSat: sanitized.balanceSats || sanitized.balanceSat || 0,
      pendingSendSat: sanitized.pendingSendSats || 0,
      pendingReceiveSat: sanitized.pendingReceiveSats || sanitized.pendingReceive || 0,
    };
  } catch (err: any) {
    console.error(`[Breez] getNodeInfo error: ${err.message}`);
    return { pubkey: "", network: "mainnet", blockHeight: 0, balanceSat: 0, pendingSendSat: 0, pendingReceiveSat: 0 };
  }
}

function normalizeInput(raw: string): string {
  let s = raw.trim();
  if (/^lightning:/i.test(s)) s = s.replace(/^lightning:/i, "");
  if (/^bitcoin:/i.test(s)) {
    const qIdx = s.indexOf("?");
    if (qIdx > -1) {
      const params = new URLSearchParams(s.slice(qIdx + 1));
      const lightningParam = params.get("lightning") || params.get("LIGHTNING");
      if (lightningParam) return lightningParam;
    }
  }
  return s;
}

export async function parseInput(input: string) {
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    throw new Error("input must be a non-empty string");
  }
  const sdk = await initBreezSdk();
  const trimmed = normalizeInput(input);
  const result = await sdk.parse(trimmed);
  const sanitized = sanitizeBigInt(result);
  console.log(`[Breez parseInput] type=${sanitized?.type}, keys=${JSON.stringify(Object.keys(sanitized || {}))}, full=${JSON.stringify(sanitized).slice(0, 500)}`);

  if (sanitized?.type === "bolt11" || sanitized?.type === "bolt11Invoice") {
    let amountSats: number | undefined;
    if (typeof sanitized.amountMsat === "number" && sanitized.amountMsat > 0) {
      amountSats = Math.floor(sanitized.amountMsat / 1000);
    } else if (typeof sanitized.invoice?.amountMsat === "number" && sanitized.invoice.amountMsat > 0) {
      amountSats = Math.floor(sanitized.invoice.amountMsat / 1000);
    } else if (typeof sanitized.amountSats === "number" && sanitized.amountSats > 0) {
      amountSats = sanitized.amountSats;
    }
    const bolt11Str = sanitized.invoice?.bolt11 || trimmed;
    console.log(`[Breez parseInput bolt11] amountSats=${amountSats}, amountMsat=${sanitized.amountMsat}`);
    return {
      type: "bolt11",
      invoice: bolt11Str,
      amountSats,
      description: sanitized.description || sanitized.invoice?.description,
      paymentHash: sanitized.paymentHash || sanitized.invoice?.paymentHash,
      expiry: sanitized.expiry || sanitized.invoice?.expiry,
      raw: sanitized,
    };
  }

  if (sanitized?.type === "lightningAddress") {
    return {
      type: "lightning_address",
      address: sanitized.address || trimmed,
      raw: sanitized,
    };
  }

  if (sanitized?.type === "lnurlPay") {
    return {
      type: "lnurl",
      address: trimmed,
      raw: sanitized,
    };
  }

  if (sanitized?.type === "bitcoinAddress") {
    return {
      type: "bitcoin",
      address: sanitized.address || trimmed,
      amountSats: sanitized.amountSat,
      raw: sanitized,
    };
  }

  return {
    type: sanitized?.type || "unknown",
    address: trimmed,
    raw: sanitized,
  };
}

export async function prepareSendPayment(destination: string, amountSats?: number): Promise<{
  feesSat: number;
  destination: string;
  amountSat: number;
  prepareResponse: unknown;
}> {
  if (!destination || typeof destination !== "string") {
    throw new Error("paymentRequest must be a non-empty string");
  }

  const sdk = await initBreezSdk();
  const request: any = {
    paymentRequest: destination,
    amount: amountSats ? BigInt(amountSats) : undefined,
  };

  const prepared = await sdk.prepareSendPayment(request);
  lastPrepareResponse = prepared;
  const sanitized = sanitizeBigInt(prepared);
  return {
    feesSat: sanitized.fees || sanitized.feeSat || 0,
    destination,
    amountSat: sanitized.amountSat || amountSats || 0,
    prepareResponse: prepared,
  };
}

export async function sendPayment(
  bolt11: string,
  amountSats?: number
): Promise<{
  success: boolean;
  paymentHash: string;
  feeSats: number;
  amountSats: number;
}> {
  const sdk = await initBreezSdk();
  const normalizedBolt11 = normalizeInput(bolt11);

  const prepRequest: any = {
    paymentRequest: normalizedBolt11,
    amount: amountSats ? BigInt(amountSats) : undefined,
  };
  const prepared = await sdk.prepareSendPayment(prepRequest);
  const prepSanitized = sanitizeBigInt(prepared);
  const prepareFee = prepSanitized.fees || prepSanitized.feeSat || prepSanitized.feesSat || 0;
  const result = await sdk.sendPayment({ prepareResponse: prepared });
  const sanitized = sanitizeBigInt(result);

  const payment = sanitized.payment || sanitized;
  const paidAmountSats = payment.amountSat || payment.amount || amountSats || 0;
  const feeSats = payment.fees || payment.feeSat || payment.feesSat || prepareFee || 0;

  try {
    await db.insert(transactionCacheTable).values({
      txId: payment.txId || payment.id || Date.now().toString(),
      type: "send",
      amountSats: paidAmountSats,
      feeSats,
      description: "",
      paymentHash: payment.destination || payment.paymentHash || "",
      status: "complete",
    }).onConflictDoNothing();
  } catch (e) {
    console.error("[Breez] Failed to cache transaction:", e);
  }

  return {
    success: true,
    paymentHash: payment.destination || payment.paymentHash || "",
    feeSats,
    amountSats: paidAmountSats,
  };
}

export async function prepareLnurlPay(address: string, amountSats: number, comment?: string) {
  const sdk = await initBreezSdk();
  const parsed = await sdk.parse(address);
  console.log(`[Breez] LNURL parse result type: ${parsed?.type}`);

  let payRequest: any = null;
  if (parsed?.type === "lightningAddress" && parsed?.payRequest) {
    payRequest = parsed.payRequest;
  } else if (parsed?.type === "lnurlPay" && parsed?.payRequest) {
    payRequest = parsed.payRequest;
  } else if (parsed?.payRequest) {
    payRequest = parsed.payRequest;
  }

  if (!payRequest) {
    throw new Error("Could not resolve LNURL pay request from this address");
  }

  console.log(`[Breez] Preparing LNURL pay: ${amountSats} sats to ${address}`);
  const prepareResponse = await sdk.prepareLnurlPay({
    amountSats,
    payRequest,
    comment: comment || undefined,
  });

  lastLnurlPrepareResponse = prepareResponse;
  return sanitizeBigInt({
    feeSat: prepareResponse.feeSat || 0,
    amountSat: amountSats,
    ready: true,
  });
}

export async function executeLnurlPay() {
  if (!lastLnurlPrepareResponse) {
    throw new Error("No prepared LNURL payment — call prepare-lnurl-pay first");
  }
  const sdk = await initBreezSdk();
  const result = await sdk.lnurlPay({ prepareResponse: lastLnurlPrepareResponse });
  lastLnurlPrepareResponse = null;
  return sanitizeBigInt(result);
}

export async function receivePayment(
  amountSats: number,
  description?: string
): Promise<{
  bolt11: string;
  paymentHash: string;
  fee: number;
}> {
  const sdk = await initBreezSdk();

  const request: any = {
    paymentMethod: {
      type: "bolt11Invoice",
      description: description || "Payment to Buccaneer Wallet",
      amountSats: BigInt(amountSats),
      expirySecs: 3600,
    },
  };

  const response = await sdk.receivePayment(request);
  return {
    bolt11: response.paymentRequest,
    paymentHash: response.paymentRequest,
    fee: Number(response.fee || 0),
  };
}

export async function createBitcoinAddress() {
  const sdk = await initBreezSdk();
  const request: any = {
    paymentMethod: {
      type: "bitcoinAddress",
    },
  };
  const response = await sdk.receivePayment(request);
  return {
    address: response.paymentRequest,
    fee: Number(response.fee || 0),
  };
}

export async function getLightningAddress(): Promise<{ lightningAddress: string; lnurlBech32: string } | null> {
  const sdk = await initBreezSdk();
  try {
    const info = await sdk.getLightningAddress();
    if (info) {
      return {
        lightningAddress: info.lightningAddress,
        lnurlBech32: info.lnurl?.bech32 || "",
      };
    }
    return null;
  } catch (err: any) {
    console.log(`[Breez] Failed to get lightning address: ${err.message}`);
    return null;
  }
}

export async function ensureLightningAddress(preferredUsername?: string): Promise<{ lightningAddress: string; lnurlBech32: string }> {
  const sdk = await initBreezSdk();
  const existing = await sdk.getLightningAddress().catch(() => null);
  if (existing) {
    return {
      lightningAddress: existing.lightningAddress,
      lnurlBech32: existing.lnurl?.bech32 || "",
    };
  }

  const username = preferredUsername || `buccaneer${Date.now().toString(36).slice(-6)}`;
  console.log(`[Breez] Registering lightning address with username: ${username}`);
  const info = await sdk.registerLightningAddress({
    username,
    description: "Buccaneer Wallet",
  });
  return {
    lightningAddress: info.lightningAddress,
    lnurlBech32: info.lnurl?.bech32 || "",
  };
}

export async function listPayments(): Promise<any[]> {
  const sdk = await initBreezSdk();
  try {
    const payments = await sdk.listPayments({ limit: 50, offset: 0 });
    const sanitized = sanitizeBigInt(payments);
    const allPayments = Array.isArray(sanitized) ? sanitized : (sanitized?.payments || []);
    return allPayments.map((p: any) => {
      let status = "failed";
      const rawStatus = typeof p.status === "string" ? p.status.toLowerCase() : String(p.status ?? "");
      if (rawStatus === "complete" || rawStatus === "completed" || rawStatus === "succeeded" || rawStatus === "success") {
        status = "completed";
      } else if (rawStatus === "pending" || rawStatus === "created") {
        status = "pending";
      }
      return {
        id: p.id || p.details?.txId || String(p.timestamp),
        type: p.paymentType === "send" ? "send" : "receive",
        amountSats: p.amount || p.amountSat || 0,
        feeSats: p.fees || p.fee || p.feeSat || p.feesSat || 0,
        description: p.details?.description || p.description || "",
        timestamp: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : new Date().toISOString(),
        status,
        paymentHash: p.details?.htlcDetails?.paymentHash || p.details?.txId || p.id || "",
        method: p.method || undefined,
      };
    });
  } catch (err: any) {
    console.error(`[Breez] listPayments error: ${err.message}`);
    return [];
  }
}

export async function listUnclaimedDeposits() {
  const sdk = await initBreezSdk();
  try {
    const response = await sdk.listUnclaimedDeposits({});
    const deposits = sanitizeBigInt(response?.deposits || []);
    pendingDeposits = deposits;
    return deposits;
  } catch (err: any) {
    console.log(`[Breez] Failed to list unclaimed deposits: ${err.message}`);
    return pendingDeposits;
  }
}

export async function syncWallet(): Promise<void> {
  const sdk = await initBreezSdk();
  await sdk.syncWallet({});
  console.log("[Breez] Wallet synced manually");
}

export async function decodeInvoice(bolt11: string): Promise<{
  amountSats?: number;
  description?: string;
  expiry?: number;
  paymentHash?: string;
  isExpired: boolean;
}> {
  const sdk = await initBreezSdk();
  try {
    const normalized = normalizeInput(bolt11);
    const parsed = await sdk.parse(normalized);
    const sanitized = sanitizeBigInt(parsed);
    const now = Math.floor(Date.now() / 1000);

    let amountSats: number | undefined;
    if (typeof sanitized.amountMsat === "number" && sanitized.amountMsat > 0) {
      amountSats = Math.floor(sanitized.amountMsat / 1000);
    } else if (typeof sanitized.invoice?.amountMsat === "number" && sanitized.invoice.amountMsat > 0) {
      amountSats = Math.floor(sanitized.invoice.amountMsat / 1000);
    } else if (typeof sanitized.amountSats === "number" && sanitized.amountSats > 0) {
      amountSats = sanitized.amountSats;
    }

    const expiry = sanitized.expiry ?? sanitized.invoice?.expiry ?? 3600;
    const timestamp = sanitized.timestamp || sanitized.invoice?.timestamp || 0;

    return {
      amountSats,
      description: sanitized.description || sanitized.invoice?.description,
      expiry,
      paymentHash: sanitized.paymentHash || sanitized.invoice?.paymentHash,
      isExpired: timestamp > 0 ? now > timestamp + expiry : false,
    };
  } catch (err: any) {
    throw new Error("Failed to decode invoice: " + err.message);
  }
}

export function getNewPayments(): { hasNew: boolean; timestamp: number } {
  const hasNew = pendingIncomingPayments.length > 0;
  return { hasNew, timestamp: hasNew ? Date.now() : 0 };
}

export async function tryClaimDeposit(txid: string, vout: number, amountSats: number, maxFeeSatPerVbyte?: number) {
  const sdk = await initBreezSdk();
  const feeRate = maxFeeSatPerVbyte || 10;
  console.log(`[Breez] Attempting manual deposit claim: txid=${txid}, vout=${vout}, amount=${amountSats}, maxFee=${feeRate} sat/vB`);
  try {
    const request: any = {
      txid,
      vout,
      maxFee: { type: "rate", satPerVbyte: feeRate }
    };
    const result = await sdk.claimDeposit(request);
    console.log(`[Breez] claimDeposit result: ${JSON.stringify(sanitizeBigInt(result))}`);
    return sanitizeBigInt(result);
  } catch (err: any) {
    console.log(`[Breez] claimDeposit failed: ${err.message}`);
    throw err;
  }
}

export async function getBreezSdk(): Promise<any> {
  return initBreezSdk();
}
