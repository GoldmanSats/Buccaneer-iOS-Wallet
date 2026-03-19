import * as breezSdk from "@breeztech/breez-sdk-liquid";
import { db } from "@workspace/db";
import { transactionCacheTable } from "@workspace/db";

let sdk: breezSdk.BindingLiquidSdk | null = null;
let initializationError: string | null = null;
let initialized = false;
let listenerAdded = false;

const pendingEvents: breezSdk.SdkEvent[] = [];
let lastPaymentTimestamp = 0;

async function addSdkListener(s: breezSdk.BindingLiquidSdk) {
  if (listenerAdded) return;
  listenerAdded = true;
  try {
    await s.addEventListener({
      onEvent: (event: breezSdk.SdkEvent) => {
        console.log("[Breez] Event:", JSON.stringify(event));
        pendingEvents.push(event);

        if (event.type === "paymentSucceeded") {
          const p = event.details;
          lastPaymentTimestamp = Date.now();
          db.insert(transactionCacheTable)
            .values({
              txId: p.txId ?? p.destination ?? String(p.timestamp),
              type: p.paymentType === "send" ? "send" : "receive",
              amountSats: p.amountSat,
              feeSats: p.feesSat ?? 0,
              description: "",
              paymentHash: p.destination ?? "",
              status: "complete",
            })
            .onConflictDoNothing()
            .catch((e: unknown) => console.error("[Breez] Cache write error:", e));
        }
      },
    });
    console.log("[Breez] Event listener registered");
  } catch (e) {
    console.error("[Breez] Failed to add event listener:", e);
  }
}

export async function getBreezSdk(): Promise<breezSdk.BindingLiquidSdk | null> {
  if (initialized) return sdk;
  if (initializationError) return null;

  const apiKey = process.env["BREEZ_API_KEY"];
  const mnemonic = process.env["WALLET_MNEMONIC"];

  if (!apiKey || !mnemonic) {
    initializationError = "Missing BREEZ_API_KEY or WALLET_MNEMONIC";
    console.error("[Breez] Missing env vars:", initializationError);
    initialized = true;
    return null;
  }

  try {
    const config = breezSdk.defaultConfig("mainnet", apiKey);
    const path = await import("path");
    config.workingDir = path.resolve(process.cwd(), "breez-data");
    console.log("[Breez] Using working dir:", config.workingDir);

    sdk = await breezSdk.connect({
      mnemonic,
      config,
    });

    initialized = true;
    console.log("[Breez] SDK initialized successfully");

    await addSdkListener(sdk);

    try {
      await sdk.sync();
      console.log("[Breez] Initial sync complete");
    } catch (syncErr) {
      console.warn("[Breez] Initial sync warning:", syncErr);
    }

    return sdk;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Breez] Initialization error:", msg);
    initializationError = msg;
    initialized = true;
    return null;
  }
}

export function getSdkStatus(): { initialized: boolean; error: string | null } {
  return { initialized, error: initializationError };
}

export async function syncWallet(): Promise<void> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized");
  await breez.sync();
}

export async function getBalance(): Promise<{
  balanceSats: number;
  pendingSendSats: number;
  pendingReceiveSats: number;
}> {
  const breez = await getBreezSdk();
  if (!breez) {
    return { balanceSats: 0, pendingSendSats: 0, pendingReceiveSats: 0 };
  }

  try {
    const info = await breez.getInfo();
    console.log("[Breez] getInfo raw:", JSON.stringify(info));
    const w = info.walletInfo;
    return {
      balanceSats: w.balanceSat,
      pendingSendSats: w.pendingSendSat,
      pendingReceiveSats: w.pendingReceiveSat,
    };
  } catch (err) {
    console.error("[Breez] getBalance error:", err);
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
  const breez = await getBreezSdk();
  if (!breez) {
    return { pubkey: "", network: "mainnet", blockHeight: 0, balanceSat: 0, pendingSendSat: 0, pendingReceiveSat: 0 };
  }
  const info = await breez.getInfo();
  const w = info.walletInfo;
  return {
    pubkey: w.pubkey ?? "",
    network: "mainnet",
    blockHeight: w.blockHeight ?? 0,
    balanceSat: w.balanceSat,
    pendingSendSat: w.pendingSendSat,
    pendingReceiveSat: w.pendingReceiveSat,
  };
}

export interface ParsedInput {
  type: "bolt11" | "lnurl" | "lightning_address" | "bitcoin" | "unknown";
  invoice?: string;
  address?: string;
  amountSats?: number;
  description?: string;
  lnurlData?: unknown;
}

export async function parseInput(input: string): Promise<ParsedInput> {
  const trimmed = input.trim();

  if (trimmed.startsWith("lightning:")) {
    return parseInput(trimmed.replace("lightning:", ""));
  }

  if (trimmed.startsWith("bitcoin:")) {
    const url = new URL(trimmed);
    const address = url.pathname;
    const amountBtc = url.searchParams.get("amount");
    const lightning = url.searchParams.get("lightning");
    if (lightning) {
      return parseInput(lightning);
    }
    return {
      type: "bitcoin",
      address,
      amountSats: amountBtc ? Math.round(parseFloat(amountBtc) * 100_000_000) : undefined,
    };
  }

  if (trimmed.includes("@") && !trimmed.startsWith("lnurl") && !trimmed.startsWith("lnbc")) {
    return {
      type: "lightning_address",
      address: trimmed.toLowerCase(),
    };
  }

  if (trimmed.toLowerCase().startsWith("lnurl")) {
    return {
      type: "lnurl",
      address: trimmed,
    };
  }

  if (trimmed.toLowerCase().startsWith("lnbc") || trimmed.toLowerCase().startsWith("lntb")) {
    try {
      const decoded = breezSdk.parseInvoice(trimmed);
      return {
        type: "bolt11",
        invoice: trimmed,
        amountSats: decoded.amountMsat ? Math.floor(decoded.amountMsat / 1000) : undefined,
        description: decoded.description,
      };
    } catch {
      return { type: "bolt11", invoice: trimmed };
    }
  }

  return { type: "unknown" };
}

export async function prepareSendPayment(destination: string, amountSats?: number): Promise<{
  feesSat: number;
  destination: string;
  amountSat: number;
  prepareResponse: unknown;
}> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized");

  const prepareResp = await breez.prepareSendPayment({
    destination,
    ...(amountSats ? { amount: { type: "bitcoin", amountMsat: amountSats * 1000 } } : {}),
  });

  return {
    feesSat: (prepareResp as any).feesSat ?? 0,
    destination,
    amountSat: amountSats ?? (prepareResp as any).amountSat ?? 0,
    prepareResponse: prepareResp,
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
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized — check BREEZ_API_KEY and WALLET_MNEMONIC");

  const prepareResp = await breez.prepareSendPayment({
    destination: bolt11,
    ...(amountSats ? { amount: { type: "bitcoin", amountMsat: amountSats * 1000 } } : {}),
  });

  const result = await breez.sendPayment({ prepareResponse: prepareResp });

  const payment = result.payment;
  const paidAmountSats = payment.amountSat;
  const feeSats = payment.feesSat ?? 0;

  try {
    await db.insert(transactionCacheTable).values({
      txId: payment.txId ?? payment.destination ?? Date.now().toString(),
      type: "send",
      amountSats: paidAmountSats,
      feeSats,
      description: "",
      paymentHash: payment.destination ?? "",
      status: "complete",
    }).onConflictDoNothing();
  } catch (e) {
    console.error("[Breez] Failed to cache transaction:", e);
  }

  return {
    success: true,
    paymentHash: payment.destination ?? "",
    feeSats,
    amountSats: paidAmountSats,
  };
}

export async function receivePayment(
  amountSats: number,
  description?: string
): Promise<{
  bolt11: string;
  paymentHash: string;
}> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized — check BREEZ_API_KEY and WALLET_MNEMONIC");

  const prepareResp = await breez.prepareReceivePayment({
    paymentMethod: "bolt11Invoice",
    amount: { type: "bitcoin", amountMsat: amountSats * 1000 },
  });

  const receiveResp = await breez.receivePayment({
    prepareResponse: prepareResp,
    description: description ?? "Buccaneer Wallet payment",
  });

  return {
    bolt11: receiveResp.destination,
    paymentHash: receiveResp.destination,
  };
}

export async function listPayments(): Promise<
  {
    id: string;
    type: "send" | "receive";
    amountSats: number;
    feeSats: number;
    description: string;
    timestamp: string;
    status: string;
    paymentHash: string;
  }[]
> {
  const breez = await getBreezSdk();
  if (!breez) return [];

  try {
    const payments = await breez.listPayments({});
    return payments.map((p) => ({
      id: p.txId ?? p.destination ?? String(p.timestamp),
      type: p.paymentType === "send" ? "send" : "receive",
      amountSats: p.amountSat,
      feeSats: p.feesSat ?? 0,
      description: "",
      timestamp: new Date(p.timestamp * 1000).toISOString(),
      status: p.status === "complete" ? "complete" : p.status === "pending" ? "pending" : "failed",
      paymentHash: p.destination ?? "",
    }));
  } catch (err) {
    console.error("[Breez] listPayments error:", err);
    return [];
  }
}

export async function decodeInvoice(bolt11: string): Promise<{
  amountSats?: number;
  description?: string;
  expiry?: number;
  paymentHash?: string;
  isExpired: boolean;
}> {
  try {
    const invoice = breezSdk.parseInvoice(bolt11);
    const now = Math.floor(Date.now() / 1000);
    const expiry = invoice.expiry ?? 3600;
    const timestamp = invoice.timestamp ?? 0;
    return {
      amountSats: invoice.amountMsat ? Math.floor(invoice.amountMsat / 1000) : undefined,
      description: invoice.description,
      expiry,
      paymentHash: invoice.paymentHash,
      isExpired: now > timestamp + expiry,
    };
  } catch (err) {
    throw new Error(
      "Failed to decode invoice: " + (err instanceof Error ? err.message : String(err))
    );
  }
}

export function getNewPayments(): { hasNew: boolean; timestamp: number } {
  const events = pendingEvents.filter(e => e.type === "paymentSucceeded");
  const hasNew = events.length > 0;
  pendingEvents.length = 0;
  return { hasNew, timestamp: lastPaymentTimestamp };
}
