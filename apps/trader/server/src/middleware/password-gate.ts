import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { ServerConfig } from "../config.js";

const APP_ACCESS_TOKEN_HEADER = "x-trader-access-token";

interface AccessTokenPayload {
  exp: number;
}

function hashPassword(password: string): Buffer {
  return createHash("sha256").update(password, "utf8").digest();
}

function passwordMatches(provided: string, expected: string): boolean {
  const providedHash = hashPassword(provided);
  const expectedHash = hashPassword(expected);
  return timingSafeEqual(providedHash, expectedHash);
}

function signPayload(payloadBase64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function createAccessToken(expiresAt: number, secret: string): string {
  const payload = JSON.stringify({ exp: expiresAt } satisfies AccessTokenPayload);
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
    return { exp: parsed.exp };
  } catch {
    return null;
  }
}

function sendLocked(res: Response): void {
  res.status(401).json({ error: "App access required", code: "APP_LOCKED" });
}

export function passwordGateRoutes(config: ServerConfig): Router {
  const router = Router();

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
    const token = createAccessToken(expiresAt, config.appPassword);
    res.json({ token, expiresAt });
  });

  return router;
}

export function requireAppAccess(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.get(APP_ACCESS_TOKEN_HEADER);
    if (!token) {
      sendLocked(res);
      return;
    }

    const payload = verifyAccessToken(token, config.appPassword);
    if (!payload || payload.exp <= Date.now()) {
      sendLocked(res);
      return;
    }

    next();
  };
}
