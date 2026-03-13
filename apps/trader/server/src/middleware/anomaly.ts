/**
 * Lightweight anomaly detection for authenticated sessions.
 *
 * Tracks per-user (Privy user ID) activity windows and emits audit warnings
 * when usage patterns exceed configurable thresholds. This is a monitoring
 * layer — it logs but does NOT block requests, leaving enforcement to the
 * existing rate limiter.
 *
 * Tracked signals:
 *  - Rapid trade/swap execution bursts from a single user
 *  - Multiple distinct IPs using the same session within a short window
 */

import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import { audit } from "../utils/audit.js";

interface UserWindow {
  /** Timestamps of trade/swap execute requests in the current window. */
  executionTimestamps: number[];
  /** Distinct client IPs observed in the current window. */
  ips: Set<string>;
  /** Window start. */
  windowStart: number;
}

const WINDOW_MS = 5 * 60_000; // 5-minute rolling window
const EXECUTION_BURST_THRESHOLD = 20; // >20 trade/swap executions in 5 min
const MULTI_IP_THRESHOLD = 3; // >=3 distinct IPs in 5 min

/** Paths that count as "executions" for burst detection. */
const EXECUTION_PATHS = new Set([
  "/api/trade/execute",
  "/api/trade/quick",
  "/api/trade/close",
  "/api/swap/execute",
]);

const windows = new Map<string, UserWindow>();

// Prune stale windows every 2 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of windows.entries()) {
    if (now - win.windowStart > WINDOW_MS * 2) {
      windows.delete(key);
    }
  }
}, 2 * 60_000).unref();

function getOrCreateWindow(userId: string, now: number): UserWindow {
  let win = windows.get(userId);
  if (!win || now - win.windowStart > WINDOW_MS) {
    win = { executionTimestamps: [], ips: new Set(), windowStart: now };
    windows.set(userId, win);
  }
  return win;
}

/**
 * Anomaly detection middleware. Must be mounted AFTER sessionAuth so that
 * `req.auth` is populated.
 */
export function anomalyDetection() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth?.privyUserId;
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const win = getOrCreateWindow(userId, now);
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    win.ips.add(clientIp);

    // Track execution timestamps for burst detection.
    const path = req.originalUrl.split("?")[0];
    if (EXECUTION_PATHS.has(path)) {
      win.executionTimestamps.push(now);

      // Prune timestamps older than the window.
      while (win.executionTimestamps.length > 0 && win.executionTimestamps[0] < now - WINDOW_MS) {
        win.executionTimestamps.shift();
      }

      if (win.executionTimestamps.length > EXECUTION_BURST_THRESHOLD) {
        audit({
          event: "rate_limit.exceeded",
          ip: clientIp,
          privyUserId: userId,
          wallet: authReq.auth?.masterAddress,
          meta: {
            anomaly: "execution_burst",
            count: win.executionTimestamps.length,
            windowMinutes: WINDOW_MS / 60_000,
          },
        });
      }
    }

    // Multi-IP detection.
    if (win.ips.size >= MULTI_IP_THRESHOLD) {
      audit({
        event: "auth.session_failed",
        ip: clientIp,
        privyUserId: userId,
        meta: {
          anomaly: "multi_ip_session",
          distinctIps: win.ips.size,
          windowMinutes: WINDOW_MS / 60_000,
        },
      });
    }

    next();
  };
}
