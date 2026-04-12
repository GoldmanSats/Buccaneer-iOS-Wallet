import * as BreezService from "@/utils/breezService";
import {
  hasStoredWalletAgentIdentity,
  walletAgentFetch,
} from "@/utils/walletAgentAccess";

interface ApprovedRequest {
  id: number;
  requestType: string;
  requestPayload: {
    bolt11?: string;
    amountSats?: number;
    description?: string;
  };
  amountSats: number | null;
  policyName: string;
  approvalMode: string;
}

async function completeRequest(requestId: number, responsePayload: unknown, settledAmountSats?: number) {
  await walletAgentFetch(`/api/agent-access/requests/${requestId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responsePayload, settledAmountSats }),
  }, { requireLocalAuth: false, retryOnAuthFailure: true });
}

async function rejectRequest(requestId: number, message: string) {
  await walletAgentFetch(`/api/agent-access/requests/${requestId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }, { requireLocalAuth: false, retryOnAuthFailure: true });
}

async function uploadSnapshot() {
  try {
    const balance = await BreezService.getBalance();
    const payments = await BreezService.listPayments();
    const transactions = payments.map((p: any) => ({
      id: p.id,
      type: p.type,
      amountSats: p.amountSats,
      feeSats: p.feeSats,
      description: p.description,
      timestamp: p.timestamp,
      status: p.status,
      paymentHash: p.paymentHash,
    }));

    await walletAgentFetch("/api/agent-access/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance, transactions }),
    }, { requireLocalAuth: false, retryOnAuthFailure: true });
  } catch (error) {
    console.warn("[AgentRequestHandler] Snapshot upload failed:", error);
  }
}

export async function processApprovedRequests(): Promise<void> {
  if (!(await hasStoredWalletAgentIdentity())) return;

  try {
    await BreezService.initBreezSdk();
  } catch (error) {
    console.error("[AgentRequestHandler] Breez SDK init failed:", error);
    return;
  }

  let requests: ApprovedRequest[];
  try {
    const res = await walletAgentFetch("/api/agent-access/requests/pending", {}, {
      requireLocalAuth: false,
      retryOnAuthFailure: true,
    });
    if (!res.ok) return;
    const data = await res.json() as { requests?: ApprovedRequest[] };
    requests = data.requests ?? [];
  } catch (error) {
    console.warn("[AgentRequestHandler] Failed to fetch pending requests:", error);
    return;
  }

  for (const request of requests) {
    try {
      if (request.requestType === "send_payment") {
        if (!request.requestPayload.bolt11) {
          await rejectRequest(request.id, "Missing invoice in payment request.");
          continue;
        }
        const result = await BreezService.sendPayment(
          request.requestPayload.bolt11,
          request.requestPayload.amountSats,
        );
        await completeRequest(request.id, {
          success: result.success,
          feeSats: result.feeSats,
          amountSats: result.amountSats,
        }, result.amountSats);
      } else if (request.requestType === "create_invoice") {
        if (!request.requestPayload.amountSats || request.requestPayload.amountSats <= 0) {
          await rejectRequest(request.id, "Invalid amount for invoice creation.");
          continue;
        }
        const invoice = await BreezService.receivePayment(
          request.requestPayload.amountSats,
          request.requestPayload.description,
        );
        await completeRequest(request.id, {
          bolt11: invoice.bolt11,
          amountSats: request.requestPayload.amountSats,
          description: request.requestPayload.description ?? "",
        });
      } else {
        await rejectRequest(request.id, `Unsupported request type: ${request.requestType}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background execution failed.";
      await rejectRequest(request.id, message).catch(() => {});
    }
  }

  if (requests.length > 0) {
    await uploadSnapshot();
  }
}
