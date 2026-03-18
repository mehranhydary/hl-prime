import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.js";
import { authRoutes, sessionAuth } from "./middleware/auth.js";
import { ipAllowlist, memoryRateLimit, requestLogger, securityHeaders } from "./middleware/http.js";
import { passwordGateRoutes, requireAppAccess, requireWebAppAccess } from "./middleware/password-gate.js";
import { anomalyDetection } from "./middleware/anomaly.js";
import { agentRoutes } from "./routes/agent.js";
import { accountRoutes } from "./routes/account.js";
import { tradeRoutes } from "./routes/trade.js";
import { swapRoutes } from "./routes/swap.js";
import { bridgeRoutes } from "./routes/bridge.js";
import { healthRoutes } from "./routes/health.js";
import { marketRoutes } from "./routes/market.js";
import { referralRoutes } from "./routes/referral.js";
import { earnRoutes } from "./routes/earn.js";
import { getRuntimeStateStore } from "./services/runtime-state.js";

const PUBLIC_WEB_PATHS = new Set(["/", "/v2", "/unlock"]);

function normalizeWebPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function createApp(config: ServerConfig) {
  getRuntimeStateStore(config);
  const app = express();
  // Trust only local/private proxy hops to prevent spoofed forwarded IP headers.
  // This works with common PaaS ingress (including Railway) while avoiding
  // trusting arbitrary internet clients as proxies.
  app.set("trust proxy", "loopback, linklocal, uniquelocal");

  app.use(requestLogger());
  app.use(securityHeaders(config.devInsecure));
  app.use(ipAllowlist(config.allowedIps));

  app.use(cors({
    origin: config.devInsecure ? true : config.allowedOrigins,
    credentials: true,
  }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/auth/ws-ticket", memoryRateLimit({
    keyPrefix: "auth_ws_ticket",
    windowMs: 60_000,
    max: 30,
    backoff: true,
  }));
  app.use("/api/access/verify", memoryRateLimit({
    keyPrefix: "access_verify",
    windowMs: 5 * 60_000,
    max: 5,
    backoff: true,
  }));
  app.use("/api/agent/init", memoryRateLimit({
    keyPrefix: "agent_init",
    windowMs: 60_000,
    max: 10,
    backoff: true,
  }));
  app.use("/api/agent", memoryRateLimit({
    keyPrefix: "agent",
    windowMs: 60_000,
    max: 60,
  }));
  app.use("/api/trade", memoryRateLimit({
    keyPrefix: "trade",
    windowMs: 60_000,
    max: 60,
    backoff: true,
  }));
  app.use("/api/swap", memoryRateLimit({
    keyPrefix: "swap",
    windowMs: 60_000,
    max: 30,
    backoff: true,
  }));
  app.use("/api/bridge", memoryRateLimit({
    keyPrefix: "bridge",
    windowMs: 60_000,
    max: 60,
    backoff: true,
  }));
  app.use("/api/earn", memoryRateLimit({
    keyPrefix: "earn",
    windowMs: 60_000,
    max: 30,
  }));

  app.use("/api", healthRoutes(config));
  if (config.passwordGateEnabled) {
    app.use("/api/access", passwordGateRoutes(config));
    app.use("/api", requireAppAccess(config));
  }
  app.use("/api/auth", authRoutes(config));

  if (config.authEnabled) {
    app.use("/api", sessionAuth(config));
    app.use("/api", anomalyDetection());
    console.log("Privy bearer-token auth enabled");
  }

  app.use("/api/agent", agentRoutes(config));
  app.use("/api/account", accountRoutes(config));
  app.use("/api/trade", tradeRoutes(config));
  app.use("/api/swap", swapRoutes(config));
  app.use("/api/bridge", bridgeRoutes(config));
  app.use("/api/market", marketRoutes(config));
  app.use("/api/referral", referralRoutes(config));
  app.use("/api/earn", earnRoutes(config));

  const webDist = path.join(process.cwd(), "dist", "web");
  const webIndex = path.join(webDist, "index.html");
  if (fs.existsSync(webIndex)) {
    app.get("/index.html", (_req, res) => {
      res.redirect(302, "/");
    });

    app.use(express.static(webDist, { index: false }));

    if (config.passwordGateEnabled) {
      const gateWebRoutes = requireWebAppAccess(config);
      app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
        const reqPath = normalizeWebPath(req.path);
        if (PUBLIC_WEB_PATHS.has(reqPath)) {
          res.sendFile(webIndex);
          return;
        }

        gateWebRoutes(req, res, () => {
          res.sendFile(webIndex);
        });
      });
    } else {
      app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
        res.sendFile(webIndex);
      });
    }
  }

  // Global catch-all error handler — prevents unhandled errors from leaking
  // stack traces or internal details to the client.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error("[unhandled]", err.message ?? String(err));
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
    }
  });

  return app;
}
