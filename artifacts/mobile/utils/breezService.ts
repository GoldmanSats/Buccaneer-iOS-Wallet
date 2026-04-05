import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SEED_KEY = "buccaneer_wallet_seed";
const MEMO_STORE_KEY = "buccaneer_wallet_memos";

let sdkInstance: any = null;
let sdkInitializing: Promise<any> | null = null;
let pendingIncomingPayments: any[] = [];
let pendingDeposits: any[] = [];

export function sanitizeBigIntPublic(obj: any): any {
  return sanitizeBigInt(obj);
}

function sanitizeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) return obj;
  if (obj instanceof Map) {
    const result: Record<string, any> = {};
    obj.forEach((v: any, k: any) => {
      result[String(k)] = sanitizeBigInt(v);
    });
    return result;
  }
  if (Array.isArray(obj)) return obj.map(sanitizeBigInt);
  if (typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeBigInt(value);
    }
    return result;
  }
  return obj;
}

async function autoClaimDeposits(deposits: any[]) {
  if (!sdkInstance || deposits.length === 0) return;
  const { MaxFee } = await import("@breeztech/breez-sdk-spark-react-native");
  for (const deposit of deposits) {
    for (const rate of [10n, 25n, 50n]) {
      try {
        await sdkInstance.claimDeposit({
          txid: deposit.txid,
          vout: deposit.vout,
          maxFee: MaxFee.Rate.new({ satPerVbyte: rate }),
        });
        break;
      } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("already claimed")) break;
        if (
          msg.includes("maxDepositClaimFeeExceeded") ||
          msg.includes("Max deposit claim fee")
        ) {
          continue;
        }
        break;
      }
    }
  }
}

export async function saveSeedToSecureStore(mnemonic: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(SEED_KEY, mnemonic, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function getSeedFromSecureStore(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(SEED_KEY);
}

export async function deleteSeedFromSecureStore(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(SEED_KEY);
  } catch {}
}

export async function generateMnemonic(): Promise<string> {
  const bip39 = await import("bip39");
  return bip39.generateMnemonic();
}

export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  const bip39 = await import("bip39");
  return bip39.validateMnemonic(mnemonic);
}

export function isBreezReady(): boolean {
  return sdkInstance !== null;
}

export function getSdkStatus(): { initialized: boolean; error: string | null } {
  return { initialized: sdkInstance !== null, error: null };
}

export async function initBreezSdk(mnemonic?: string): Promise<any> {
  if (sdkInstance) return sdkInstance;
  if (sdkInitializing) return sdkInitializing;

  sdkInitializing = (async () => {
    try {
      if (Platform.OS === "web") {
        throw new Error("Breez SDK is not available on web");
      }

      const breez = await import("@breeztech/breez-sdk-spark-react-native");
      const RNFS = await import("react-native-fs");

      const seed = mnemonic || (await getSeedFromSecureStore());
      if (!seed) {
        throw new Error("No wallet seed found. Please create or restore a wallet first.");
      }

      const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
      console.log(`[Breez] API key present: ${!!apiKey}, length: ${apiKey?.length ?? 0}`);
      if (!apiKey) {
        throw new Error("BREEZ_API_KEY is not configured. The app was built without a valid API key.");
      }

      console.log("[Breez] Step 1: Getting default config...");
      let defaults: any;
      try {
        defaults = breez.defaultConfig(breez.Network.Mainnet);
        console.log("[Breez] Step 1 OK. Network:", defaults.network, "syncInterval:", defaults.syncIntervalSecs);
      } catch (configErr: any) {
        const msg = configErr?.inner?.[0] || configErr?.message || String(configErr);
        throw new Error(`defaultConfig failed: ${msg}`);
      }

      console.log("[Breez] Step 2: Creating config via Config.new() with API key (length=" + apiKey.length + ")...");
      let config: any;
      try {
        config = (breez as any).Config.new({
          ...defaults,
          apiKey,
          maxDepositClaimFee: breez.MaxFee.Rate.new({ satPerVbyte: 10n }),
        });
        console.log("[Breez] Step 2 OK. Config created via factory.");
      } catch (cfgErr: any) {
        console.warn("[Breez] Config.new() failed, falling back to plain object:", cfgErr?.message || cfgErr);
        config = {
          ...defaults,
          apiKey,
          maxDepositClaimFee: breez.MaxFee.Rate.new({ satPerVbyte: 10n }),
        };
      }

      console.log("[Breez] Step 3: Creating seed object...");
      let seedObj: any;
      try {
        seedObj = breez.Seed.Mnemonic.new({
          mnemonic: seed,
          passphrase: undefined,
        });
        console.log("[Breez] Step 3 OK. Seed created.");
      } catch (seedErr: any) {
        const msg = seedErr?.inner?.[0] || seedErr?.message || String(seedErr);
        throw new Error(`Seed creation failed: ${msg}`);
      }

      const storageDir = `${RNFS.DocumentDirectoryPath}/breez-data`;
      try {
        await RNFS.mkdir(storageDir);
      } catch {}

      console.log("[Breez] Step 4: Building SDK via SdkBuilder (storageDir=" + storageDir + ")...");
      let sdk: any;
      try {
        const builder = new (breez as any).SdkBuilder(config, seedObj);
        console.log("[Breez] Step 4a: SdkBuilder created OK.");
        await builder.withDefaultStorage(storageDir);
        console.log("[Breez] Step 4b: Storage configured OK.");
        const buildPromise = builder.build();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("SDK build timed out after 60 seconds")), 60000)
        );
        sdk = await Promise.race([buildPromise, timeoutPromise]);
        console.log("[Breez] Step 5: SDK built successfully!");
      } catch (buildErr: any) {
        const msg = buildErr?.inner?.[0] || buildErr?.message || String(buildErr);
        const step = !sdk ? "build" : "unknown";
        throw new Error(`SdkBuilder.${step} failed: ${msg}`);
      }

      const eventListener: any = {
        async onEvent(event: any) {
          try {
            const sanitized = sanitizeBigInt(event);
            console.log(`[Breez event] ${JSON.stringify(sanitized)}`);

            if (event.tag === "UnclaimedDeposits" && event.inner?.deposits) {
              const deposits = sanitizeBigInt(event.inner.deposits);
              pendingDeposits = deposits;
              autoClaimDeposits(deposits);
            }

            if (event.tag === "ClaimedDeposits" && event.inner?.deposits) {
              const claimed = sanitizeBigInt(event.inner.deposits);
              const claimedKeys = new Set(claimed.map((d: any) => `${d.txid}:${d.vout}`));
              pendingDeposits = pendingDeposits.filter(
                (d: any) => !claimedKeys.has(`${d.txid}:${d.vout}`)
              );
              const totalClaimed = claimed.reduce(
                (s: number, d: any) => s + (d.amountSats || 0),
                0
              );
              pendingIncomingPayments.push({
                id: `deposit-${Date.now()}`,
                amount: totalClaimed,
                timestamp: Math.floor(Date.now() / 1000),
                description: "On-chain deposit confirmed",
              });
            }

            if (event.tag === "PaymentSucceeded" && event.inner) {
              const payment = sanitizeBigInt(event.inner);
              const p = payment[0] || payment;
              if (p.paymentType === 1 || p.paymentType === "Receive") {
                pendingIncomingPayments.push({
                  id: p.id,
                  amount: p.amount || 0,
                  timestamp: p.timestamp || Math.floor(Date.now() / 1000),
                  description: p.details?.description || "Incoming payment",
                });
              }
            }
          } catch {
            console.log(`[Breez event] ${event?.tag || "unknown"}`);
          }
        },
      };

      await sdk.addEventListener(eventListener);

      sdkInstance = sdk;
      console.log("[Breez] SDK initialized on device (mainnet)");

      try {
        const unclaimedResp = await sdk.listUnclaimedDeposits({});
        const unclaimedList = Array.isArray(unclaimedResp) ? unclaimedResp : unclaimedResp?.deposits || [];
        if (unclaimedList.length > 0) {
          pendingDeposits = sanitizeBigInt(unclaimedList);
          autoClaimDeposits(pendingDeposits);
        }
      } catch {}

      return sdk;
    } catch (err: any) {
      const innerMsg = Array.isArray(err?.inner) ? err.inner[0] : (err?.inner?.message || err?.inner);
      const detail = innerMsg || err?.message || String(err);
      const fullDetail = JSON.stringify({
        message: err?.message,
        innerArray: Array.isArray(err?.inner) ? err.inner : undefined,
        innerMsg: innerMsg,
        tag: err?.tag,
        name: err?.constructor?.name,
        raw: String(err),
      });
      console.error(`[Breez] SDK init failed: ${detail}`);
      console.error(`[Breez] Full error: ${fullDetail}`);
      sdkInitializing = null;
      const friendlyError = new Error(detail || "Unknown SDK error");
      (friendlyError as any).sdkDetail = fullDetail;
      throw friendlyError;
    }
  })();

  return sdkInitializing;
}

export async function disconnectSdk(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.disconnect();
    } catch {}
    sdkInstance = null;
    sdkInitializing = null;
  }
}

export async function getBalance(): Promise<{
  balanceSats: number;
  pendingSendSats: number;
  pendingReceiveSats: number;
}> {
  const sdk = await initBreezSdk();
  try {
    const info = await sdk.getInfo({ ensureSynced: undefined });
    return {
      balanceSats: Number(info.balanceSats ?? 0),
      pendingSendSats: 0,
      pendingReceiveSats: 0,
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
}> {
  const sdk = await initBreezSdk();
  try {
    const info = await sdk.getInfo({ ensureSynced: undefined });
    return {
      pubkey: info.identityPubkey || "",
      network: "mainnet",
      blockHeight: 0,
      balanceSat: Number(info.balanceSats ?? 0),
    };
  } catch (err: any) {
    console.error(`[Breez] getNodeInfo error: ${err.message}`);
    return { pubkey: "", network: "mainnet", blockHeight: 0, balanceSat: 0 };
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

  if (sanitized?.tag === "Bolt11Invoice") {
    const details = sanitized.inner?.[0] || sanitized.inner;
    const invoice = details?.invoice;
    let amountSats: number | undefined;
    if (typeof details?.amountSats === "number" && details.amountSats > 0) {
      amountSats = details.amountSats;
    } else if (typeof invoice?.amountMsat === "number" && invoice.amountMsat > 0) {
      amountSats = Math.floor(invoice.amountMsat / 1000);
    }
    return {
      type: "bolt11" as const,
      invoice: invoice?.bolt11 || trimmed,
      amountSats,
      description: details?.description || invoice?.description,
      paymentHash: invoice?.paymentHash,
      expiry: invoice?.expiry,
    };
  }

  if (sanitized?.tag === "LightningAddress") {
    const details = sanitized.inner?.[0] || sanitized.inner;
    return {
      type: "lightning_address" as const,
      address: details?.address || trimmed,
      payRequest: result?.inner?.[0]?.payRequest || details?.payRequest,
    };
  }

  if (sanitized?.tag === "LnurlPay") {
    const details = result?.inner?.[0] || sanitized.inner?.[0] || sanitized.inner;
    return {
      type: "lnurl" as const,
      address: trimmed,
      payRequest: details,
      raw: sanitized,
    };
  }

  if (sanitized?.tag === "BitcoinAddress") {
    const details = sanitized.inner?.[0] || sanitized.inner;
    return {
      type: "bitcoin" as const,
      address: details?.address || trimmed,
      amountSats: details?.amountSat,
    };
  }

  if (sanitized?.tag === "SparkAddress") {
    return {
      type: "spark_address" as const,
      address: trimmed,
    };
  }

  return {
    type: (sanitized?.tag || "unknown") as "unknown",
    address: trimmed,
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
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const normalizedBolt11 = normalizeInput(bolt11);

  const prepRequest = breez.PrepareSendPaymentRequest.new({
    paymentRequest: normalizedBolt11,
    amount: amountSats ? BigInt(amountSats) : undefined,
    tokenIdentifier: undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const prepared = await sdk.prepareSendPayment(prepRequest);

  const sendRequest = breez.SendPaymentRequest.new({
    prepareResponse: prepared,
    options: undefined,
    idempotencyKey: undefined,
  });
  const result = await sdk.sendPayment(sendRequest);
  const payment = result.payment;

  return {
    success: true,
    paymentHash: payment.id || "",
    feeSats: Number(payment.fees ?? 0),
    amountSats: Number(payment.amount ?? amountSats ?? 0),
  };
}

export async function sendLnurlPayment(
  payRequest: any,
  amountSats: number
): Promise<{
  success: boolean;
  paymentHash: string;
  feeSats: number;
  amountSats: number;
}> {
  const sdk = await initBreezSdk();
  const breez = await import("@breeztech/breez-sdk-spark-react-native");

  console.log("[Breez] prepareLnurlPay amountSats:", amountSats);
  const prepRequest = breez.PrepareLnurlPayRequest.new({
    amountSats: BigInt(amountSats),
    payRequest,
    comment: undefined,
    validateSuccessActionUrl: undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const prepared = await sdk.prepareLnurlPay(prepRequest);
  console.log("[Breez] prepareLnurlPay OK, feeSats:", Number(prepared.feeSats ?? 0));

  const lnurlPayReq = breez.LnurlPayRequest.new({
    prepareResponse: prepared,
    idempotencyKey: undefined,
  });
  const result = await sdk.lnurlPay(lnurlPayReq);
  const payment = result?.payment;

  return {
    success: true,
    paymentHash: payment?.id || "",
    feeSats: Number(payment?.fees ?? prepared.feeSats ?? 0),
    amountSats: Number(payment?.amount ?? amountSats),
  };
}

export async function prepareSendPayment(
  bolt11: string,
  amountSats?: number
): Promise<{ feeSats: number; amountSats: number }> {
  const sdk = await initBreezSdk();
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const normalizedBolt11 = normalizeInput(bolt11);

  const prepRequest = breez.PrepareSendPaymentRequest.new({
    paymentRequest: normalizedBolt11,
    amount: amountSats ? BigInt(amountSats) : undefined,
    tokenIdentifier: undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const prepared = await sdk.prepareSendPayment(prepRequest);

  const sanitized = sanitizeBigInt(prepared);
  return {
    feeSats: Number(sanitized.fees ?? sanitized.feeSat ?? sanitized.feesSat ?? sanitized.estimatedFees ?? 0),
    amountSats: Number(prepared.amount ?? amountSats ?? 0),
  };
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
  const breez = await import("@breeztech/breez-sdk-spark-react-native");

  const paymentMethod = new breez.ReceivePaymentMethod.Bolt11Invoice({
    description: description || "Payment to Buccaneer Wallet",
    amountSats: BigInt(amountSats),
    expirySecs: 3600,
    paymentHash: undefined,
  });

  const request = breez.ReceivePaymentRequest.new({
    paymentMethod,
  });

  const response = await sdk.receivePayment(request);
  return {
    bolt11: response.paymentRequest,
    paymentHash: response.paymentRequest,
    fee: Number(response.fee ?? 0),
  };
}

export async function decodeInvoice(bolt11: string): Promise<{
  amountSats?: number;
  description?: string;
  expiry?: number;
  paymentHash?: string;
  isExpired: boolean;
}> {
  const sdk = await initBreezSdk();
  const normalized = normalizeInput(bolt11);
  const parsed = await sdk.parse(normalized);
  const sanitized = sanitizeBigInt(parsed);
  const now = Math.floor(Date.now() / 1000);

  if (sanitized?.tag === "Bolt11Invoice") {
    const details = sanitized.inner?.[0] || sanitized.inner;
    const invoice = details?.invoice;

    let amountSats: number | undefined;
    if (typeof details?.amountSats === "number" && details.amountSats > 0) {
      amountSats = details.amountSats;
    } else if (typeof invoice?.amountMsat === "number" && invoice.amountMsat > 0) {
      amountSats = Math.floor(invoice.amountMsat / 1000);
    }

    const expiry = invoice?.expiry ?? 3600;
    const timestamp = invoice?.timestamp || 0;

    return {
      amountSats,
      description: details?.description || invoice?.description,
      expiry,
      paymentHash: invoice?.paymentHash,
      isExpired: timestamp > 0 ? now > timestamp + expiry : false,
    };
  }

  return {
    isExpired: false,
  };
}

export async function listPayments(): Promise<any[]> {
  const sdk = await initBreezSdk();
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  try {
    const request = breez.ListPaymentsRequest.new({
      limit: 50 as any,
      offset: 0 as any,
      typeFilter: undefined,
      statusFilter: undefined,
      assetFilter: undefined,
      paymentDetailsFilter: undefined,
      fromTimestamp: undefined,
      toTimestamp: undefined,
      sortAscending: undefined,
    });
    const payments = await sdk.listPayments(request);
    console.log("[Breez] listPayments raw type:", typeof payments, "isArray:", Array.isArray(payments));

    let paymentList: any[];
    if (Array.isArray(payments)) {
      paymentList = payments;
    } else if (payments && typeof payments === "object" && typeof payments.length === "number") {
      paymentList = Array.from(payments);
    } else if (payments && Symbol.iterator in Object(payments)) {
      paymentList = [...payments];
    } else {
      console.warn("[Breez] listPayments returned unexpected type, keys:", payments ? Object.keys(payments) : "null");
      paymentList = [];
    }

    console.log("[Breez] listPayments count:", paymentList.length);
    if (paymentList.length > 0) {
      const first = paymentList[0];
      console.log("[Breez] first payment keys:", Object.keys(first || {}));
      console.log("[Breez] first payment status:", first?.status, "paymentType:", first?.paymentType, "amount:", first?.amount);
    }

    return paymentList.map((p: any) => {
      const statusVal = p.status;
      let status = "failed";
      const completedEnum = breez.PaymentStatus?.Completed;
      const pendingEnum = breez.PaymentStatus?.Pending;
      if (statusVal === completedEnum || statusVal === 0 || String(statusVal) === "Completed") {
        status = "completed";
      } else if (statusVal === pendingEnum || statusVal === 1 || String(statusVal) === "Pending") {
        status = "pending";
      }

      const typeVal = p.paymentType;
      const sendEnum = breez.PaymentType?.Send;
      const isSend = typeVal === sendEnum || typeVal === 0 || String(typeVal) === "Send";

      return {
        id: p.id || String(Number(p.timestamp ?? 0)),
        type: isSend ? "send" : "receive",
        amountSats: Number(p.amount ?? 0),
        feeSats: Number(p.fees ?? 0),
        description: p.details?.description || p.description || "",
        timestamp: p.timestamp
          ? new Date(Number(p.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
        status,
        paymentHash: p.id || "",
      };
    });
  } catch (err: any) {
    const errMsg = err?.inner?.[0] || err?.message || String(err);
    console.error("[Breez] listPayments error:", errMsg);
    return [];
  }
}

export async function createBitcoinAddress(): Promise<{
  address: string;
  fee: number;
}> {
  const sdk = await initBreezSdk();
  const breez = await import("@breeztech/breez-sdk-spark-react-native");
  const paymentMethod = new breez.ReceivePaymentMethod.BitcoinAddress();
  const request = breez.ReceivePaymentRequest.new({ paymentMethod });
  const response = await sdk.receivePayment(request);
  return {
    address: response.paymentRequest,
    fee: Number(response.fee ?? 0),
  };
}

export async function syncWallet(): Promise<void> {
  const sdk = await initBreezSdk();
  await sdk.syncWallet();
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

export async function saveMemo(txId: string, memo: string): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(MEMO_STORE_KEY);
    const memos: Record<string, string> = raw ? JSON.parse(raw) : {};
    memos[txId] = memo;
    await SecureStore.setItemAsync(MEMO_STORE_KEY, JSON.stringify(memos));
  } catch {}
}

export async function getMemos(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(MEMO_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
