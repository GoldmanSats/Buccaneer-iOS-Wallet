import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionMemosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getBalance,
  sendPayment,
  receivePayment,
  listPayments,
  decodeInvoice,
  syncWallet,
  parseInput,
  getNodeInfo,
  getSdkStatus,
  getNewPayments,
  getLightningAddress,
  ensureLightningAddress,
  createBitcoinAddress,
  listUnclaimedDeposits,
  initBreezSdk,
} from "../lib/breez.js";

const router: IRouter = Router();

router.get("/balance", async (_req, res) => {
  try {
    const balance = await getBalance();
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const limit = parseInt(String(req.query["limit"] ?? "50"));
    const offset = parseInt(String(req.query["offset"] ?? "0"));
    const txs = await listPayments();

    const memos = await db.select().from(transactionMemosTable);
    const memoMap = new Map(memos.map(m => [m.txId, m.memo]));

    const enriched = txs.map(tx => ({
      ...tx,
      memo: memoMap.get(tx.id) ?? "",
    }));

    const paginated = enriched.slice(offset, offset + limit);
    res.json({ transactions: paginated, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

router.patch("/transactions/:id/memo", async (req, res) => {
  try {
    const txId = req.params["id"] ?? "";
    const { memo } = req.body as { memo: string };
    if (memo === undefined) {
      return res.status(400).json({ error: "missing_memo" });
    }
    await db.insert(transactionMemosTable)
      .values({ txId, memo, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: transactionMemosTable.txId,
        set: { memo, updatedAt: new Date() },
      });
    res.json({ txId, memo });
  } catch (err) {
    res.status(500).json({ error: "memo_error", message: String(err) });
  }
});

router.post("/send", async (req, res) => {
  const body = req.body as { bolt11: string; amountSats?: number };
  if (!body.bolt11) {
    return res.status(400).json({ error: "missing_bolt11", message: "BOLT11 invoice is required" });
  }
  try {
    const result = await sendPayment(body.bolt11, body.amountSats);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "payment_failed", message: String(err) });
  }
});

router.post("/decode-invoice", async (req, res) => {
  const body = req.body as { bolt11: string };
  if (!body.bolt11) {
    return res.status(400).json({ error: "missing_bolt11", message: "BOLT11 invoice is required" });
  }
  try {
    const decoded = await decodeInvoice(body.bolt11);
    res.json(decoded);
  } catch (err) {
    res.status(400).json({ error: "decode_failed", message: String(err) });
  }
});

router.post("/parse", async (req, res) => {
  const body = req.body as { input: string };
  if (!body.input) {
    return res.status(400).json({ error: "missing_input" });
  }
  try {
    const parsed = await parseInput(body.input);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: "parse_failed", message: String(err) });
  }
});

router.post("/receive", async (req, res) => {
  const body = req.body as { amountSats: number; description?: string };
  if (!body.amountSats || body.amountSats <= 0) {
    return res.status(400).json({ error: "invalid_amount", message: "Valid amountSats required" });
  }
  try {
    const result = await receivePayment(body.amountSats, body.description);
    res.json({ ...result, expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() });
  } catch (err) {
    res.status(500).json({ error: "receive_failed", message: String(err) });
  }
});

router.get("/lightning-address", async (_req, res) => {
  try {
    const info = await getLightningAddress();
    if (info) {
      res.json({
        address: info.lightningAddress,
        lnurlp: `https://breez.tips/.well-known/lnurlp/${info.lightningAddress.split("@")[0]}`,
      });
    } else {
      const ensured = await ensureLightningAddress();
      res.json({
        address: ensured.lightningAddress,
        lnurlp: `https://breez.tips/.well-known/lnurlp/${ensured.lightningAddress.split("@")[0]}`,
      });
    }
  } catch (err) {
    res.json({
      address: "unknown@breez.tips",
      lnurlp: "",
    });
  }
});

router.get("/btc-address", async (_req, res) => {
  try {
    const result = await createBitcoinAddress();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "btc_address_failed", message: String(err) });
  }
});

router.get("/unclaimed-deposits", async (_req, res) => {
  try {
    const deposits = await listUnclaimedDeposits();
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: "deposits_error", message: String(err) });
  }
});

router.get("/btc-price", async (req, res) => {
  const currency = String(req.query["currency"] ?? "USD").toUpperCase();
  const symbols: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", NZD: "NZ$", AUD: "A$", CAD: "CA$", JPY: "¥", CHF: "Fr",
    BRL: "R$", MXN: "MX$", SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł", CZK: "Kč",
    HUF: "Ft", SGD: "S$", HKD: "HK$", INR: "₹", KRW: "₩", THB: "฿", ZAR: "R",
  };
  try {
    const response = await fetch(
      `https://api.coinbase.com/v2/exchange-rates?currency=BTC`
    );
    if (!response.ok) throw new Error("Price fetch failed");
    const data = await response.json() as { data: { rates: Record<string, string> } };
    const rateStr = data.data.rates[currency];
    if (!rateStr) throw new Error(`Currency ${currency} not found`);
    const price = parseFloat(rateStr);

    res.json({ currency, price, symbol: symbols[currency] ?? currency });
  } catch (_err) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`
      );
      if (!response.ok) throw new Error("CoinGecko failed");
      const data = await response.json() as { bitcoin: Record<string, number> };
      const price = data.bitcoin[currency.toLowerCase()] ?? 0;
      res.json({ currency, price, symbol: symbols[currency] ?? currency });
    } catch (_err2) {
      res.json({ currency, price: 0, symbol: symbols[currency] ?? currency });
    }
  }
});

router.post("/sync", async (_req, res) => {
  try {
    await syncWallet();
    res.json({ success: true, message: "Synced" });
  } catch (err) {
    res.status(500).json({ error: "sync_failed", message: String(err) });
  }
});

router.get("/seed-phrase", (_req, res) => {
  const mnemonic = process.env["WALLET_MNEMONIC"] ?? "";
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  res.json({ words });
});

router.get("/node-info", async (_req, res) => {
  try {
    const info = await getNodeInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: "node_info_error", message: String(err) });
  }
});

router.get("/status", (_req, res) => {
  const status = getSdkStatus();
  res.json(status);
});

router.get("/new-payments", (_req, res) => {
  const result = getNewPayments();
  res.json(result);
});

export default router;
