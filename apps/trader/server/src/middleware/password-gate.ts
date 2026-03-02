import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { ServerConfig } from "../config.js";
import { clearAuthCookie, readCookie, setAuthCookie } from "../utils/cookies.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";

const APP_ACCESS_TOKEN_HEADER = "x-trader-access-token";
const APP_ACCESS_TOKEN_COOKIE = "trader_access_token";

interface AccessTokenPayload {
  exp: number;
  id: string;
}

function stateStore() {
  return getRuntimeStateStore();
}

function hashPassword(password: string): Buffer {
  return createHash("sha256").update(password, "utf8").digest();
}

function deriveSigningKey(password: string): string {
  return createHmac("sha256", "trader_access_token_signing_v1")
    .update(password, "utf8")
    .digest("hex");
}

function passwordMatches(provided: string, expected: string): boolean {
  const providedHash = hashPassword(provided);
  const expectedHash = hashPassword(expected);
  return timingSafeEqual(providedHash, expectedHash);
}

function signPayload(payloadBase64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function createAccessToken(expiresAt: number, id: string, secret: string): string {
  const payload = JSON.stringify({ exp: expiresAt, id } satisfies AccessTokenPayload);
  const payloadBase64 = Buffer.from(payload, "utf8").toString("base64url");
  const signature = signPayload(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = signPayload(payloadBase64, secret);
  const actualSignatureBuffer = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");
  if (actualSignatureBuffer.length !== expectedSignatureBuffer.length) return null;
  if (!timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as
      Partial<AccessTokenPayload>;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    if (typeof parsed.id !== "string" || parsed.id.length < 8) return null;
    return { exp: parsed.exp, id: parsed.id };
  } catch {
    return null;
  }
}

function readAccessToken(req: Request): string | null {
  return req.get(APP_ACCESS_TOKEN_HEADER) ?? readCookie(req, APP_ACCESS_TOKEN_COOKIE);
}

function readValidAccessPayload(req: Request, config: Pick<ServerConfig, "appPassword">): AccessTokenPayload | null {
  const token = readAccessToken(req);
  if (!token) return null;

  const payload = verifyAccessToken(token, deriveSigningKey(config.appPassword));
  if (!payload || payload.exp <= Date.now()) return null;
  if (!stateStore().hasAccessGrant(payload.id)) return null;
  return payload;
}

function unlockRedirect(req: Request): string {
  const from = req.originalUrl.startsWith("/") ? req.originalUrl : req.path;
  return `/unlock?from=${encodeURIComponent(from || "/markets")}`;
}

function sendLocked(res: Response): void {
  res.status(401).json({ error: "App access required", code: "APP_LOCKED" });
}

// Prune expired grants every 10 minutes.
setInterval(() => {
  stateStore().cleanupAccessGrants();
}, 10 * 60 * 1000).unref();

/** @internal test helper */
export function __createAppAccessTokenForTests(secret: string, expiresAt = Date.now() + 60_000): string {
  const id = randomBytes(16).toString("hex");
  stateStore().putAccessGrant(id, expiresAt);
  return createAccessToken(expiresAt, id, deriveSigningKey(secret));
}

export function passwordGateRoutes(config: ServerConfig): Router {
  const router = Router();
  const secureCookie = !config.devInsecure;

  router.post("/verify", (req: Request, res: Response) => {
    const body = req.body as { password?: unknown } | undefined;
    if (!body || typeof body.password !== "string" || body.password.length === 0) {
      res.status(400).json({ error: "Missing password", code: "BAD_REQUEST" });
      return;
    }

    if (!passwordMatches(body.password, config.appPassword)) {
      res.status(401).json({ error: "Invalid password", code: "APP_AUTH_FAILED" });
      return;
    }

    const expiresAt = Date.now() + config.appPasswordTtlMs;
    const accessGrantId = randomBytes(16).toString("hex");
    stateStore().putAccessGrant(accessGrantId, expiresAt);
    const token = createAccessToken(expiresAt, accessGrantId, deriveSigningKey(config.appPassword));
    setAuthCookie(res, {
      name: APP_ACCESS_TOKEN_COOKIE,
      value: token,
      expiresAt,
      secure: secureCookie,
      path: "/",
    });
    res.json({ expiresAt });
  });

  router.post("/logout", (req: Request, res: Response) => {
    const token = readAccessToken(req);
    if (token) {
      const payload = verifyAccessToken(token, deriveSigningKey(config.appPassword));
      if (payload) {
        stateStore().deleteAccessGrant(payload.id);
      }
    }
    clearAuthCookie(res, {
      name: APP_ACCESS_TOKEN_COOKIE,
      secure: secureCookie,
      path: "/",
    });
    res.json({ success: true });
  });

  return router;
}

export function requireAppAccess(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!readValidAccessPayload(req, config)) {
      sendLocked(res);
      return;
    }

    next();
  };
}

export function requireWebAppAccess(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (readValidAccessPayload(req, config)) {
      next();
      return;
    }
    res.redirect(302, unlockRedirect(req));
  };
}
