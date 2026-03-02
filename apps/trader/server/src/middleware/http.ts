import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

interface HitState {
  count: number;
  resetAt: number;
}

function contentSecurityPolicy(insecure = false): string {
  // Keep styles inline-compatible for existing React style attrs.
  const styleSrc = "'self' 'unsafe-inline'";
  const imgSrc = "'self' data: https://app.hyperliquid.xyz";
  const connectSrc = insecure ? "'self' ws: wss:" : "'self'";

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    `style-src ${styleSrc}`,
    "font-src 'self'",
    `img-src ${imgSrc}`,
    `connect-src ${connectSrc}`,
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
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    state.count += 1;
    if (state.count > options.max) {
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
