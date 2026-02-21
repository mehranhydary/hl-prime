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

function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;
  return ip || "unknown";
}

export function securityHeaders(insecure = false) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
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

