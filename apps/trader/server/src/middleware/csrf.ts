/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * - Server sets a non-HttpOnly cookie (`csrf_token`) so the frontend JS can
 *   read it and echo the value back as an `X-CSRF-Token` header.
 * - On state-changing requests (POST, PUT, DELETE, PATCH) the middleware
 *   verifies that the header matches the cookie.
 * - Cross-origin scripts cannot read SameSite cookies, so they cannot forge
 *   the header — this blocks CSRF even if CORS or SameSite checks are
 *   weakened by browser extensions or older engines.
 */

import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { readCookie } from "../utils/cookies.js";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

/** Generate a cryptographically random CSRF token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/** Set the CSRF cookie on a response. */
export function setCsrfCookie(
  res: Response,
  token: string,
  opts: { secure: boolean; expiresAt: number },
): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // must be readable by frontend JS
    secure: opts.secure,
    sameSite: "strict",
    path: "/",
    expires: new Date(opts.expiresAt),
  });
}

/** Clear the CSRF cookie (e.g. on logout). */
export function clearCsrfCookie(res: Response, secure: boolean): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Paths that are exempt from CSRF validation because they run before a session
 * (and therefore before a CSRF cookie) exists.
 */
const EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/access/",
  "/api/health",
  "/api/ready",
];

function isExempt(path: string): boolean {
  for (const prefix of EXEMPT_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Returns Express middleware that enforces double-submit CSRF on mutating
 * requests. Pass `{ disabled: true }` (e.g. in devInsecure mode) to skip
 * validation while still allowing the cookie to be set.
 */
export function csrfProtection(opts: { disabled?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (opts.disabled || SAFE_METHODS.has(req.method) || isExempt(req.path)) {
      next();
      return;
    }

    const cookieToken = readCookie(req, CSRF_COOKIE_NAME);
    const headerToken = req.headers[CSRF_HEADER_NAME];

    if (
      !cookieToken
      || typeof headerToken !== "string"
      || headerToken.length === 0
      || cookieToken !== headerToken
    ) {
      res.status(403).json({ error: "CSRF token missing or invalid", code: "CSRF_FAILED" });
      return;
    }

    next();
  };
}
