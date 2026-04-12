import type { NextFunction, Request, Response } from "express";
import {
  getWalletAgentSessionFailure,
  lookupWalletAgentSession,
  WALLET_AGENT_SESSION_HEADER,
} from "./agentAccessSession.js";

export interface WalletAgentAuthenticatedRequest extends Request {
  walletAgentSession?: {
    sessionId: number;
    identityId: number;
    walletPublicKey: string;
    walletMode: string;
    walletLabel: string | null;
    expiresAt: Date;
  };
}

export async function requireWalletAgentSession(
  req: WalletAgentAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.header(WALLET_AGENT_SESSION_HEADER) ?? req.header(WALLET_AGENT_SESSION_HEADER.toUpperCase());
  const token = raw?.trim();

  if (!token) {
    res.status(401).json({
      error: "missing_wallet_agent_session",
      message: "Bellamy needs a wallet agent session for this action.",
    });
    return;
  }

  const session = await lookupWalletAgentSession(token);
  const failure = getWalletAgentSessionFailure(session);
  if (failure) {
    res.status(failure.status).json({ error: failure.error, message: failure.message });
    return;
  }

  req.walletAgentSession = {
    sessionId: session!.sessionId,
    identityId: session!.identityId,
    walletPublicKey: session!.walletPublicKey,
    walletMode: session!.walletMode,
    walletLabel: session!.walletLabel,
    expiresAt: session!.expiresAt,
  };

  next();
}
