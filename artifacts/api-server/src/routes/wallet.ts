import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  GetBalanceResponse,
  GetTransactionsResponse,
  SendPaymentBodyRequest,
  SendPaymentResponse,
  CreateInvoiceBodyRequest,
  CreateInvoiceResponse,
  GetLightningAddressResponse,
  GetBtcPriceResponse,
  DecodeInvoiceBodyRequest,
  DecodedInvoiceResponse,
  GetSeedPhraseResponse,
} from "@workspace/api-zod";
import {
  getBalance,
  sendPayment,
  receivePayment,
  listPayments,
  decodeInvoice,
} from "../lib/breez.js";

const router: IRouter = Router();

const LIGHTNING_ADDRESS = "buccaneeradiciw@breez.tips";

// GET /wallet/balance
router.get("/balance", async (_req, res) => {
  try {
    const balance = await getBalance();
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

// GET /wallet/transactions
router.get("/transactions", async (req, res) => {
  try {
    const limit = parseInt(String(req.query["limit"] ?? "50"));
    const offset = parseInt(String(req.query["offset"] ?? "0"));
    const txs = await listPayments();
    const paginated = txs.slice(offset, offset + limit);
    res.json({ transactions: paginated, total: txs.length });
  } catch (err) {
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

// POST /wallet/send
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

// POST /wallet/decode-invoice
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

// POST /wallet/receive
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

// GET /wallet/lightning-address
router.get("/lightning-address", (_req, res) => {
  res.json({
    address: LIGHTNING_ADDRESS,
    lnurlp: `https://breez.tips/.well-known/lnurlp/${LIGHTNING_ADDRESS.split("@")[0]}`,
  });
});

// GET /wallet/btc-price
router.get("/btc-price", async (req, res) => {
  const currency = String(req.query["currency"] ?? "USD").toUpperCase();
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`
    );
    if (!response.ok) throw new Error("Price fetch failed");
    const data = await response.json() as { bitcoin: Record<string, number> };
    const price = data.bitcoin[currency.toLowerCase()] ?? 0;

    const symbols: Record<string, string> = {
      USD: "$", EUR: "€", GBP: "£", NZD: "NZ$", AUD: "A$", CAD: "CA$", JPY: "¥", CHF: "Fr",
    };

    res.json({ currency, price, symbol: symbols[currency] ?? currency });
  } catch (_err) {
    // Fallback price
    res.json({ currency, price: 85000, symbol: "$" });
  }
});

// GET /wallet/seed-phrase
router.get("/seed-phrase", (_req, res) => {
  const mnemonic = process.env["WALLET_MNEMONIC"] ?? "";
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  res.json({ words });
});

export default router;
