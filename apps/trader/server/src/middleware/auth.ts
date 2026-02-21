/**
 * Session-based EIP-712 authentication middleware.
 *
 * Flow:
 *   1. POST /api/auth/session — verify EIP-712 signature, issue session token
 *   2. All other requests — check Authorization: Bearer <token>
 *
 * Sessions are stored in-memory. Restarting the server invalidates all sessions
 * (users just sign once more — acceptable for a self-hosted app).
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { verifyTypedData, getAddress } from "viem";
import {
  AUTH_DOMAIN,
  AUTH_TYPES,
  AUTH_SIGNATURE_MAX_AGE_MS,
  SESSION_TTL_MS,
  type SessionRequest,
  type SessionResponse,
} from "../../../shared/auth.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";

// ── Session store ──────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  auth?: {
    address: string;
    token: string;
    expiresAt: number;
  };
}

function stateStore() {
  return getRuntimeStateStore();
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** @internal test helper */
export function __createSessionTokenForTests(address: string, expiresAt = Date.now() + SESSION_TTL_MS): string {
  const token = generateToken();
  stateStore().putSession({ token, address: getAddress(address), expiresAt });
  return token;
}

/** @internal test helper */
export function __resetSessionsForTests(): void {
  stateStore().clearAllForTests();
}

function pruneExpired(): void {
  stateStore().cleanupSessions();
}

// Prune every 10 minutes
setInterval(pruneExpired, 10 * 60 * 1000).unref();

// ── Session creation route ─────────────────────────────────────────────

export function authRoutes(): Router {
  const router = Router();

  router.post("/session", async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionRequest>;

    if (!body.address || !body.timestamp || !body.nonce || !body.signature) {
      res.status(400).json({ error: "Missing fields", code: "BAD_REQUEST" });
      return;
    }

    // Validate timestamp freshness
    const age = Date.now() - body.timestamp;
    if (age > AUTH_SIGNATURE_MAX_AGE_MS || age < -60_000) {
      res.status(401).json({ error: "Signature expired or clock skew too large", code: "AUTH_FAILED" });
      return;
    }

    // Validate address format
    let checksumAddress: `0x${string}`;
    try {
      checksumAddress = getAddress(body.address);
    } catch {
      res.status(401).json({ error: "Invalid address format", code: "AUTH_FAILED" });
      return;
    }

    // Verify EIP-712 signature
    try {
      const valid = await verifyTypedData({
        address: checksumAddress,
        domain: AUTH_DOMAIN,
        types: AUTH_TYPES,
        primaryType: "Auth",
        message: {
          address: checksumAddress,
          timestamp: BigInt(body.timestamp),
          nonce: body.nonce,
        },
        signature: body.signature as `0x${string}`,
      });

      if (!valid) {
        res.status(401).json({ error: "Invalid signature", code: "AUTH_FAILED" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Signature verification failed", code: "AUTH_FAILED" });
      return;
    }

    // Issue session token
    const token = generateToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    stateStore().putSession({ token, address: checksumAddress, expiresAt });

    const response: SessionResponse = { token, expiresAt };
    res.json(response);
  });

  return router;
}

// ── Bearer token middleware ────────────────────────────────────────────

export function sessionAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header", code: "AUTH_FAILED" });
      return;
    }

    const token = authHeader.slice(7);
    const session = stateStore().getSession(token);

    if (!session) {
      res.status(401).json({ error: "Invalid session token", code: "AUTH_FAILED" });
      return;
    }

    if (session.expiresAt <= Date.now()) {
      stateStore().deleteSession(token);
      res.status(401).json({ error: "Session expired", code: "AUTH_FAILED" });
      return;
    }

    authReq.auth = {
      address: session.address,
      token,
      expiresAt: session.expiresAt,
    };

    // Bind requests to the authenticated address when masterAddress is provided.
    const bodyAddress = typeof authReq.body?.masterAddress === "string"
      ? authReq.body.masterAddress
      : undefined;
    const queryAddress = typeof authReq.query?.masterAddress === "string"
      ? authReq.query.masterAddress
      : undefined;
    const requestedAddress = bodyAddress ?? queryAddress;
    if (requestedAddress && requestedAddress.toLowerCase() !== session.address.toLowerCase()) {
      res.status(403).json({ error: "masterAddress does not match authenticated session", code: "FORBIDDEN" });
      return;
    }

    next();
  };
}
