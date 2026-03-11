/**
 * Session-based EIP-712 authentication middleware.
 *
 * Flow:
 *   1. POST /api/auth/challenge — issue a one-time challenge nonce
 *   2. POST /api/auth/session — verify EIP-712 signature over that challenge
 *   3. All other requests — check Authorization: Bearer <token>
 *
 * Sessions and auth challenges are stored in runtime state.
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { verifyTypedData, getAddress, recoverTypedDataAddress } from "viem";
import {
  AUTH_AUDIENCE,
  AUTH_ALLOWED_CHAIN_IDS,
  AUTH_CHALLENGE_TTL_MS,
  isAuthChainId,
  AUTH_DOMAIN,
  AUTH_TYPES,
  AUTH_SIGNATURE_MAX_AGE_MS,
  SESSION_TTL_MS,
  type SessionChallengeRequest,
  type SessionChallengeResponse,
  type SessionRequest,
  type SessionResponse,
} from "../../../shared/auth.js";
import type { ServerConfig } from "../config.js";
import { getRuntimeStateStore, type AuthChallengeState } from "../services/runtime-state.js";
import { clearAuthCookie, readCookie, setAuthCookie } from "../utils/cookies.js";

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

function generateChallengeNonce(): string {
  return randomBytes(24).toString("hex");
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    const parsed = trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? parseInt(trimmed, 16)
      : parseInt(trimmed, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function authDomain(chainId: number): typeof AUTH_DOMAIN & { chainId: bigint } {
  return {
    ...AUTH_DOMAIN,
    chainId: BigInt(chainId),
  };
}

function normalizeSignatureV(signature: string): `0x${string}` {
  if (!signature.startsWith("0x")) return signature as `0x${string}`;
  if (signature.length !== 132) return signature as `0x${string}`;
  const v = signature.slice(-2).toLowerCase();
  if (v === "00") return `${signature.slice(0, -2)}1b` as `0x${string}`;
  if (v === "01") return `${signature.slice(0, -2)}1c` as `0x${string}`;
  return signature as `0x${string}`;
}

const SESSION_TOKEN_COOKIE = "trader_session_token";
const SUPPORTED_CHAIN_IDS_LABEL = AUTH_ALLOWED_CHAIN_IDS.join(", ");

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
  stateStore().cleanupAuthChallenges();
}

// Prune every 10 minutes
setInterval(pruneExpired, 10 * 60 * 1000).unref();

// ── Session creation route ─────────────────────────────────────────────

export function authRoutes(config: Pick<ServerConfig, "devInsecure">): Router {
  const router = Router();
  const secureCookie = !config.devInsecure;

  router.post("/challenge", (req: Request, res: Response) => {
    const body = req.body as Partial<SessionChallengeRequest>;

    if (!body.address || body.chainId === undefined) {
      res.status(400).json({ error: "Missing fields", code: "BAD_REQUEST" });
      return;
    }

    let checksumAddress: `0x${string}`;
    try {
      checksumAddress = getAddress(body.address);
    } catch {
      res.status(401).json({ error: "Invalid address format", code: "AUTH_FAILED" });
      return;
    }

    const chainId = parseChainId(body.chainId);
    if (chainId === null || !isAuthChainId(chainId)) {
      res.status(401).json({
        error: `Unsupported chainId. Supported chainIds: ${SUPPORTED_CHAIN_IDS_LABEL}`,
        code: "AUTH_FAILED",
      });
      return;
    }

    const issuedAt = Date.now();
    const challenge: AuthChallengeState = {
      nonce: generateChallengeNonce(),
      address: checksumAddress,
      chainId,
      issuedAt,
    };
    stateStore().putAuthChallenge(challenge, AUTH_CHALLENGE_TTL_MS);

    const response: SessionChallengeResponse = {
      address: checksumAddress,
      chainId,
      nonce: challenge.nonce,
      issuedAt,
      expiresAt: issuedAt + AUTH_CHALLENGE_TTL_MS,
      audience: AUTH_AUDIENCE,
    };
    res.json(response);
  });

  router.post("/session", async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionRequest>;

    if (
      !body.address
      || body.chainId === undefined
      || typeof body.nonce !== "string"
      || typeof body.signature !== "string"
      || body.nonce.length === 0
      || body.signature.length === 0
    ) {
      res.status(400).json({ error: "Missing fields", code: "BAD_REQUEST" });
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

    const chainId = parseChainId(body.chainId);
    if (chainId === null || !isAuthChainId(chainId)) {
      res.status(401).json({
        error: `Unsupported chainId. Supported chainIds: ${SUPPORTED_CHAIN_IDS_LABEL}`,
        code: "AUTH_FAILED",
      });
      return;
    }

    const challenge = stateStore().takeAuthChallenge(body.nonce);
    if (!challenge) {
      res.status(401).json({ error: "Challenge expired or already used", code: "AUTH_FAILED" });
      return;
    }
    if (
      challenge.address.toLowerCase() !== checksumAddress.toLowerCase()
      || challenge.chainId !== chainId
    ) {
      res.status(401).json({ error: "Challenge does not match request", code: "AUTH_FAILED" });
      return;
    }

    const age = Date.now() - challenge.issuedAt;
    if (age > AUTH_SIGNATURE_MAX_AGE_MS || age < -60_000) {
      res.status(401).json({ error: "Challenge expired or clock skew too large", code: "AUTH_FAILED" });
      return;
    }

    // Verify EIP-712 signature
    try {
      const normalizedSignature = normalizeSignatureV(body.signature);
      const recovered = await recoverTypedDataAddress({
        domain: authDomain(chainId),
        types: AUTH_TYPES,
        primaryType: "Auth",
        message: {
          address: checksumAddress,
          nonce: challenge.nonce,
          issuedAt: BigInt(challenge.issuedAt),
          audience: AUTH_AUDIENCE,
        },
        signature: normalizedSignature,
      });

      const valid = await verifyTypedData({
        address: checksumAddress,
        domain: authDomain(chainId),
        types: AUTH_TYPES,
        primaryType: "Auth",
        message: {
          address: checksumAddress,
          nonce: challenge.nonce,
          issuedAt: BigInt(challenge.issuedAt),
          audience: AUTH_AUDIENCE,
        },
        signature: normalizedSignature,
      });

      if (!valid) {
        console.warn(
          `[auth] Invalid signature: expected=${checksumAddress.toLowerCase()} recovered=${recovered.toLowerCase()} chainId=${chainId}`,
        );
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
    setAuthCookie(res, {
      name: SESSION_TOKEN_COOKIE,
      value: token,
      expiresAt,
      secure: secureCookie,
    });

    const response: SessionResponse = { expiresAt };
    res.json(response);
  });

  router.post("/logout", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      stateStore().deleteSession(authHeader.slice(7));
    }

    const cookieToken = readCookie(req, SESSION_TOKEN_COOKIE);
    if (cookieToken) {
      stateStore().deleteSession(cookieToken);
    }

    clearAuthCookie(res, {
      name: SESSION_TOKEN_COOKIE,
      secure: secureCookie,
    });
    res.json({ success: true });
  });

  return router;
}

// ── Bearer token middleware ────────────────────────────────────────────

export function sessionAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken = readCookie(req, SESSION_TOKEN_COOKIE);
    const token = bearerToken ?? cookieToken;
    if (!token) {
      res.status(401).json({ error: "Missing authentication token", code: "AUTH_FAILED" });
      return;
    }

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
