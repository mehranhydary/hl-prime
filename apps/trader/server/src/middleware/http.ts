import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /** Enable exponential backoff: each breach doubles the window (up to 4x). */
  backoff?: boolean;
}

interface HitState {
  count: number;
  resetAt: number;
  /** Number of consecutive windows where the limit was exceeded. */
  breaches: number;
}

function contentSecurityPolicy(insecure = false): string {
  // Keep styles inline-compatible for existing React style attrs.
  const styleSrc = "'self' 'unsafe-inline'";
  // Privy uses Cloudflare challenges during auth flows, in addition to our
  // existing Cloudflare Web Analytics beacon.
  const scriptSrc = [
    "'self'",
    "https://static.cloudflareinsights.com",
    "https://challenges.cloudflare.com",
  ].join(" ");
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://app.hyperliquid.xyz",
    "https://cloudflareinsights.com",
  ].join(" ");
  const childSrc = [
    "https://auth.privy.io",
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
  ].join(" ");
  const frameSrc = [
    childSrc,
    "https://challenges.cloudflare.com",
  ].join(" ");
  const connectSrc = [
    "'self'",
    insecure ? "ws:" : null,
    "wss:",
    "https://api.hyperliquid.xyz",
    "https://api.hyperliquid-testnet.xyz",
    "https://cloudflareinsights.com",
    "https://auth.privy.io",
    "https://explorer-api.walletconnect.com",
    "https://*.rpc.privy.systems",
  ].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "font-src 'self'",
    `img-src ${imgSrc}`,
    `child-src ${childSrc}`,
    `frame-src ${frameSrc}`,
    `connect-src ${connectSrc}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
}

function clientKey(req: Request): string {
  // Never trust raw forwarding headers here; Express resolves req.ip using
  // the configured trusted proxy policy in app.ts.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function securityHeaders(insecure = false) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Content-Security-Policy", contentSecurityPolicy(insecure));
    if (!insecure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const elapsedMs = Date.now() - startedAt;
      const payload = {
        level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        type: "http_request",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        elapsedMs,
      };
      const line = JSON.stringify(payload);
      if (payload.level === "error") {
        console.error(line);
      } else if (payload.level === "warn") {
        console.warn(line);
      } else {
        console.info(line);
      }
    });
    next();
  };
}

/**
 * In-memory rate limiter — state is per-process. In a multi-process or
 * clustered deployment each worker maintains its own counters, so effective
 * limits are multiplied by the number of workers. For single-process
 * deployments (the current architecture) this is a non-issue. If horizontal
 * scaling is needed, swap to a shared store (e.g. Redis) for rate-limit state.
 */
export function memoryRateLimit(options: RateLimitOptions) {
  const hits = new Map<string, HitState>();

  // Periodic cleanup to avoid unbounded key growth.
  setInterval(() => {
    const now = Date.now();
    for (const [key, state] of hits.entries()) {
      if (state.resetAt <= now) hits.delete(key);
    }
  }, Math.max(10_000, options.windowMs)).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${options.keyPrefix}:${clientKey(req)}`;
    const state = hits.get(key);
    if (!state || state.resetAt <= now) {
      // When a window expires, carry forward breach count if previously breached.
      const prevBreaches = state?.breaches ?? 0;
      hits.set(key, { count: 1, resetAt: now + options.windowMs, breaches: prevBreaches > 0 ? prevBreaches - 1 : 0 });
      next();
      return;
    }

    state.count += 1;
    if (state.count > options.max) {
      if (options.backoff) {
        state.breaches = Math.min((state.breaches ?? 0) + 1, 4);
        // Double the remaining lockout per breach, up to 4x window.
        const multiplier = Math.pow(2, state.breaches - 1);
        state.resetAt = Math.max(state.resetAt, now + options.windowMs * multiplier);
      }
      const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Too many requests",
        code: "RATE_LIMITED",
      });
      return;
    }

    next();
  };
}
