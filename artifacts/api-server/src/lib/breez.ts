import * as breezSdk from "@breeztech/breez-sdk-liquid";
import { db } from "@workspace/db";
import { transactionCacheTable } from "@workspace/db";

let sdk: breezSdk.BindingLiquidSdk | null = null;
let initializationError: string | null = null;
let initialized = false;

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
    const config = await breezSdk.defaultConfig(
      breezSdk.LiquidNetwork.MAINNET,
      apiKey
    );

    sdk = await breezSdk.connect({
      mnemonic,
      config,
    });

    initialized = true;
    console.log("[Breez] SDK initialized successfully");
    return sdk;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Breez] Initialization error:", msg);
    initializationError = msg;
    initialized = true;
    return null;
  }
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
    return {
      balanceSats: Number(info.balanceSat),
      pendingSendSats: Number(info.pendingSendSat),
      pendingReceiveSats: Number(info.pendingReceiveSat),
    };
  } catch (err) {
    console.error("[Breez] getBalance error:", err);
    return { balanceSats: 0, pendingSendSats: 0, pendingReceiveSats: 0 };
  }
}

export async function sendPayment(bolt11: string, amountSats?: number): Promise<{
  success: boolean;
  paymentHash: string;
  feeSats: number;
  amountSats: number;
}> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized");

  const result = await breez.sendPayment({
    bolt11,
    ...(amountSats ? { amountMsat: amountSats * 1000 } : {}),
  });

  const payment = result.payment;
  const paidAmountSats = Number(payment.amountSat);
  const feeSats = Number(payment.feesSat ?? 0);

  try {
    await db.insert(transactionCacheTable).values({
      txId: payment.txId ?? payment.destination ?? Date.now().toString(),
      type: "send",
      amountSats: paidAmountSats,
      feeSats,
      description: payment.description ?? "",
      paymentHash: payment.destination,
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

export async function receivePayment(amountSats: number, description?: string): Promise<{
  bolt11: string;
  paymentHash: string;
}> {
  const breez = await getBreezSdk();
  if (!breez) throw new Error("Wallet not initialized");

  const amountMsat = BigInt(amountSats * 1000);
  const prepareResp = await breez.prepareReceivePayment({
    paymentMethod: breezSdk.PaymentMethod.LIGHTNING,
    payerAmountSat: amountSats,
  });

  const receiveResp = await breez.receivePayment({
    prepareResponse: prepareResp,
    description: description ?? "Buccaneer payment",
  });

  return {
    bolt11: receiveResp.destination,
    paymentHash: receiveResp.destination,
  };
}

export async function listPayments(): Promise<{
  id: string;
  type: "send" | "receive";
  amountSats: number;
  feeSats: number;
  description: string;
  timestamp: string;
  status: string;
  paymentHash: string;
}[]> {
  const breez = await getBreezSdk();
  if (!breez) return [];

  try {
    const payments = await breez.listPayments({});
    return payments.map((p) => ({
      id: p.txId ?? p.destination ?? Date.now().toString(),
      type: p.paymentType === breezSdk.PaymentType.SEND ? "send" : "receive",
      amountSats: Number(p.amountSat),
      feeSats: Number(p.feesSat ?? 0),
      description: p.description ?? "",
      timestamp: new Date(Number(p.timestamp) * 1000).toISOString(),
      status: p.status === breezSdk.PaymentState.COMPLETE ? "complete" :
        p.status === breezSdk.PaymentState.PENDING ? "pending" : "failed",
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
    const decoded = await breezSdk.parseInput(bolt11);
    if (decoded.type === breezSdk.InputType.BOLT11) {
      const invoice = decoded.invoice;
      const now = Math.floor(Date.now() / 1000);
      const expiry = Number(invoice.expiry ?? 3600);
      const timestamp = Number(invoice.timestamp ?? 0);
      return {
        amountSats: invoice.amountMsat ? Math.floor(Number(invoice.amountMsat) / 1000) : undefined,
        description: invoice.description,
        expiry,
        paymentHash: invoice.paymentHash,
        isExpired: now > timestamp + expiry,
      };
    }
    throw new Error("Not a BOLT11 invoice");
  } catch (err) {
    throw new Error("Failed to decode invoice: " + (err instanceof Error ? err.message : String(err)));
  }
}
