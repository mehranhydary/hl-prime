import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { ServerConfig } from "./config.js";
import { authRoutes, sessionAuth } from "./middleware/auth.js";
import { memoryRateLimit, requestLogger, securityHeaders } from "./middleware/http.js";
import { passwordGateRoutes, requireAppAccess } from "./middleware/password-gate.js";
import { agentRoutes } from "./routes/agent.js";
import { accountRoutes } from "./routes/account.js";
import { tradeRoutes } from "./routes/trade.js";
import { healthRoutes } from "./routes/health.js";
import { marketRoutes } from "./routes/market.js";
import { referralRoutes } from "./routes/referral.js";
import { getRuntimeStateStore } from "./services/runtime-state.js";

export function createApp(config: ServerConfig) {
  getRuntimeStateStore(config);
  const app = express();
  app.set("trust proxy", 1);

  app.use(requestLogger());
  app.use(securityHeaders(config.devInsecure));

  app.use(cors({
    origin: config.devInsecure ? true : config.allowedOrigins,
  }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/auth/session", memoryRateLimit({
    keyPrefix: "auth_session",
    windowMs: 60_000,
    max: 20,
  }));
  app.use("/api/access/verify", memoryRateLimit({
    keyPrefix: "access_verify",
    windowMs: 60_000,
    max: 10,
  }));
  app.use("/api/agent", memoryRateLimit({
    keyPrefix: "agent",
    windowMs: 60_000,
    max: 60,
  }));
  app.use("/api/trade", memoryRateLimit({
    keyPrefix: "trade",
    windowMs: 60_000,
    max: 120,
  }));

  app.use("/api", healthRoutes(config));
  app.use("/api/access", passwordGateRoutes(config));
  app.use("/api", requireAppAccess(config));
  app.use("/api/auth", authRoutes());

  if (config.authEnabled) {
    app.use("/api", sessionAuth());
    console.log("EIP-712 session auth enabled");
  }

  app.use("/api/agent", agentRoutes(config));
  app.use("/api/account", accountRoutes(config));
  app.use("/api/trade", tradeRoutes(config));
  app.use("/api/market", marketRoutes(config));
  app.use("/api/referral", referralRoutes(config));

  const webDist = path.join(process.cwd(), "dist", "web");
  const webIndex = path.join(webDist, "index.html");
  if (fs.existsSync(webIndex)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(webIndex);
    });
  }

  return app;
}
