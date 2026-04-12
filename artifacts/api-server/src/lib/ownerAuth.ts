import type { NextFunction, Request, Response } from "express";
import {
  OWNER_BOOTSTRAP_HEADER,
  OWNER_SESSION_HEADER,
  getOwnerSessionFailure,
  lookupOwnerSession,
} from "./ownerSession.js";

export interface OwnerAuthenticatedRequest extends Request {
  ownerSession?: {
    sessionId: number;
    deviceId: number;
    label: string;
    publicKey: string;
    expiresAt: Date;
  };
}

export function requireOwnerBootstrapAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers[OWNER_BOOTSTRAP_HEADER];
  const expected = process.env["WALLET_OWNER_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "not_configured", message: "Wallet owner bootstrap authentication is not configured" });
    return;
  }
  if (!token || token !== expected) {
    res.status(403).json({ error: "forbidden", message: "Wallet owner bootstrap authentication required" });
    return;
  }
  next();
}

export async function requireOwnerSession(
  req: OwnerAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const headerValue = req.headers[OWNER_SESSION_HEADER];
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "owner_session_required", message: "Owner session required" });
    return;
  }

  try {
    const session = await lookupOwnerSession(token);
    const failure = getOwnerSessionFailure(session);
    if (failure) {
      res.status(failure.status).json({ error: failure.error, message: failure.message });
      return;
    }
    req.ownerSession = {
      sessionId: session!.sessionId,
      deviceId: session!.deviceId,
      label: session!.label,
      publicKey: session!.publicKey,
      expiresAt: session!.expiresAt,
    };
    next();
    return;
  } catch (err) {
    res.status(500).json({ error: "owner_session_error", message: String(err) });
    return;
  }
}
