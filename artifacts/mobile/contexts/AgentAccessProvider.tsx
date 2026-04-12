import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useSettings } from "@/contexts/SettingsContext";
import { useWallet } from "@/contexts/WalletContext";
import {
  confirmWalletAgentAction,
  hasStoredWalletAgentIdentity,
  walletAgentFetch,
} from "@/utils/walletAgentAccess";

type PendingAgentRequest = {
  id: number;
  requestType: "send_payment" | "create_invoice";
  requestPayload: {
    bolt11?: string;
    amountSats?: number;
    description?: string;
  };
  amountSats: number | null;
  requiresFreshApproval: boolean;
  policyName: string;
  approvalMode: "session" | "per_action";
};

export function AgentAccessProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { balance, transactions, sdkReady, isOffline, sendPayment, createInvoice, decodeInvoice } = useWallet();
  const syncInFlight = useRef(false);
  const processInFlight = useRef(false);
  const agentAccessEnabled = process.env.EXPO_PUBLIC_ENABLE_PER_USER_AGENT_ACCESS !== "0";

  useEffect(() => {
    if (!agentAccessEnabled) return;
    if (Platform.OS === "web") return;
    if (!settings.onboardingDone || !sdkReady || isOffline) return;

    let cancelled = false;

    const syncSnapshot = async () => {
      if (cancelled || syncInFlight.current) return;
      if (!(await hasStoredWalletAgentIdentity())) return;
      syncInFlight.current = true;
      try {
        await walletAgentFetch("/api/agent-access/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            balance,
            transactions,
          }),
        }, {
          requireLocalAuth: false,
          retryOnAuthFailure: true,
        });
      } catch (error) {
        console.warn("[AgentAccess] Snapshot sync failed:", error);
      } finally {
        syncInFlight.current = false;
      }
    };

    const rejectRequest = async (requestId: number, message: string) => {
      await walletAgentFetch(`/api/agent-access/requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }, {
        requireLocalAuth: false,
        retryOnAuthFailure: true,
      });
    };

    const completeRequest = async (requestId: number, responsePayload: unknown, settledAmountSats?: number) => {
      await walletAgentFetch(`/api/agent-access/requests/${requestId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsePayload,
          settledAmountSats,
        }),
      }, {
        requireLocalAuth: false,
        retryOnAuthFailure: true,
      });
      await syncSnapshot();
    };

    const processRequest = async (request: PendingAgentRequest) => {
      if (request.requiresFreshApproval || request.approvalMode === "per_action") {
        await confirmWalletAgentAction(
          request.requestType === "send_payment"
            ? `Approve ${request.policyName} payment`
            : `Approve ${request.policyName} invoice`,
        );
      }

      if (request.requestType === "send_payment") {
        if (!request.requestPayload.bolt11) {
          throw new Error("Bellamy received a payment request without an invoice.");
        }
        const result = await sendPayment(request.requestPayload.bolt11, request.requestPayload.amountSats);
        await completeRequest(request.id, {
          success: result.success,
          feeSats: result.feeSats,
          amountSats: result.amountSats,
        }, result.amountSats);
        return;
      }

      if (request.requestType === "create_invoice") {
        if (!request.requestPayload.amountSats || request.requestPayload.amountSats <= 0) {
          throw new Error("Bellamy received an invoice request without a valid amount.");
        }
        const invoice = await createInvoice(request.requestPayload.amountSats, request.requestPayload.description);
        const decoded = await decodeInvoice(invoice.bolt11);
        await completeRequest(request.id, {
          bolt11: invoice.bolt11,
          amountSats: request.requestPayload.amountSats,
          description: decoded.description ?? request.requestPayload.description ?? "",
        });
      }
    };

    const pollPendingRequests = async () => {
      if (cancelled || processInFlight.current) return;
      if (!(await hasStoredWalletAgentIdentity())) return;
      processInFlight.current = true;
      try {
        const res = await walletAgentFetch("/api/agent-access/requests/pending", {}, {
          requireLocalAuth: false,
          retryOnAuthFailure: true,
        });
        if (!res.ok) {
          return;
        }
        const data = await res.json() as { requests?: PendingAgentRequest[] };
        for (const request of data.requests ?? []) {
          try {
            await processRequest(request);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Bellamy couldn't complete this agent request.";
            await rejectRequest(request.id, message);
          }
        }
      } catch (error) {
        console.warn("[AgentAccess] Pending request poll failed:", error);
      } finally {
        processInFlight.current = false;
      }
    };

    void syncSnapshot();
    void pollPendingRequests();

    const syncTimer = setInterval(() => {
      void syncSnapshot();
    }, 20_000);
    const requestTimer = setInterval(() => {
      void pollPendingRequests();
    }, 4_000);

    return () => {
      cancelled = true;
      clearInterval(syncTimer);
      clearInterval(requestTimer);
    };
  }, [
    balance,
    createInvoice,
    decodeInvoice,
    isOffline,
    sdkReady,
    sendPayment,
    settings.onboardingDone,
    transactions,
    agentAccessEnabled,
  ]);

  return <>{children}</>;
}
