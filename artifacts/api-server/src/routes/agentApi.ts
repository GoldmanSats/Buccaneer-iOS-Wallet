import { Router, type IRouter } from "express";
import {
  agentAuthMiddleware,
  recordAgentSpend,
  checkSpendingLimits,
  logAgentAction,
  type AuthenticatedRequest,
} from "../lib/agentAuth.js";
import {
  getBalance,
  sendPayment,
  receivePayment,
  listPayments,
  decodeInvoice,
} from "../lib/breez.js";

const router: IRouter = Router();

router.use(agentAuthMiddleware as any);

router.get("/balance", async (req: AuthenticatedRequest, res) => {
  try {
    const balance = await getBalance();
    await logAgentAction(req.agentKey!.id, "balance_check", "success", "Checked wallet balance");
    res.json(balance);
  } catch (err) {
    await logAgentAction(req.agentKey!.id, "balance_check", "error", String(err));
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

router.get("/transactions", async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(String(req.query["limit"] ?? "50"));
    const offset = parseInt(String(req.query["offset"] ?? "0"));
    const txs = await listPayments();
    const paginated = txs.slice(offset, offset + limit);
    await logAgentAction(req.agentKey!.id, "list_transactions", "success", `Listed ${paginated.length} transactions`);
    res.json({ transactions: paginated, total: txs.length });
  } catch (err) {
    await logAgentAction(req.agentKey!.id, "list_transactions", "error", String(err));
    res.status(500).json({ error: "wallet_error", message: String(err) });
  }
});

router.post("/send", async (req: AuthenticatedRequest, res) => {
  const body = req.body as { bolt11: string; amountSats?: number };
  if (!body.bolt11) {
    return res.status(400).json({ error: "missing_bolt11", message: "BOLT11 invoice is required" });
  }

  try {
    const decoded = await decodeInvoice(body.bolt11);
    const amountSats = body.amountSats ?? (decoded as any).amountSats ?? (decoded as any).amountMsat ? Math.ceil(((decoded as any).amountMsat ?? 0) / 1000) : 0;

    const limitError = await checkSpendingLimits(req.agentKey, amountSats);
    if (limitError) {
      await logAgentAction(req.agentKey!.id, "send", "rejected", limitError, amountSats);
      return res.status(403).json({ error: "spending_limit", message: limitError });
    }

    const result = await sendPayment(body.bolt11, body.amountSats);
    await recordAgentSpend(req.agentKey!.id, amountSats);
    await logAgentAction(req.agentKey!.id, "send", "success", `txhash:${result.paymentHash}|Sent ${amountSats} sats`, amountSats);
    res.json(result);
  } catch (err) {
    await logAgentAction(req.agentKey!.id, "send", "error", String(err));
    res.status(500).json({ error: "payment_failed", message: String(err) });
  }
});

router.post("/receive", async (req: AuthenticatedRequest, res) => {
  const body = req.body as { amountSats: number; description?: string };
  if (!body.amountSats || body.amountSats <= 0) {
    return res.status(400).json({ error: "invalid_amount", message: "amountSats must be a positive number" });
  }

  try {
    const result = await receivePayment(body.amountSats, body.description ?? "Agent payment request");
    await logAgentAction(req.agentKey!.id, "receive", "success", `Created invoice for ${body.amountSats} sats`, body.amountSats);
    res.json(result);
  } catch (err) {
    await logAgentAction(req.agentKey!.id, "receive", "error", String(err));
    res.status(500).json({ error: "receive_failed", message: String(err) });
  }
});

router.post("/decode-invoice", async (req: AuthenticatedRequest, res) => {
  const body = req.body as { bolt11: string };
  if (!body.bolt11) {
    return res.status(400).json({ error: "missing_bolt11", message: "BOLT11 invoice is required" });
  }
  try {
    const decoded = await decodeInvoice(body.bolt11);
    await logAgentAction(req.agentKey!.id, "decode_invoice", "success", "Decoded invoice");
    res.json(decoded);
  } catch (err) {
    await logAgentAction(req.agentKey!.id, "decode_invoice", "error", String(err));
    res.status(400).json({ error: "decode_failed", message: String(err) });
  }
});

export default router;
