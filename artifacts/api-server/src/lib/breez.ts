import * as breezSdk from "@breeztech/breez-sdk-liquid";
import { db } from "@workspace/db";
import { transactionCacheTable } from "@workspace/db";

let sdk: breezSdk.BindingLiquidSdk | null = null;
let initializationError: string | null = null;
let initialized = false;
let listenerAdded = false;

// Called by the event listener when a payment comes in
const pendingEvents: breezSdk.SdkEvent[] = [];

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
          // Cache the received payment
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
    // defaultConfig is synchronous in v0.12.x
    const config = breezSdk.defaultConfig("mainnet", apiKey);

    sdk = await breezSdk.connect({
      mnemonic,
      config,
    });

    initialized = true;
    console.log("[Breez] SDK initialized successfully");

    // Register event listener and trigger sync
    await addSdkListener(sdk);

    // Force sync to pick up any payments that arrived while offline
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

export async function syncWallet(): Promise<void> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized");
  await breez.sync();
  console.log("[Breez] Manual sync complete");
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

export async function sendPayment(
  bolt11: string,
  _amountSats?: number
): Promise<{
  success: boolean;
  paymentHash: string;
  feeSats: number;
  amountSats: number;
}> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized — check BREEZ_API_KEY and WALLET_MNEMONIC");

  // Step 1: Prepare
  const prepareResp = await breez.prepareSendPayment({
    destination: bolt11,
  });

  // Step 2: Send
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

  // Step 1: Prepare — get fee quote
  const prepareResp = await breez.prepareReceivePayment({
    paymentMethod: "bolt11Invoice",
    amount: { type: "bitcoin", amountMsat: amountSats * 1000 },
  });

  // Step 2: Create the invoice
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
    // parseInvoice is synchronous in v0.12.x
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
