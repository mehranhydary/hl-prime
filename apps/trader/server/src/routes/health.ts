import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { ServerConfig } from "../config.js";
import type { HealthResponse } from "../../../shared/types.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";

const startTime = Date.now();

async function canWrite(dir: string): Promise<boolean> {
  const probePath = path.join(dir, ".ready.tmp");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(probePath, String(Date.now()), "utf8");
    await fs.unlink(probePath).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function healthRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/health
  router.get("/health", async (_req, res) => {
    const response: HealthResponse = {
      status: "ok",
      sdkConnected: true,
      agentConfigured: false, // Will be overridden per-user queries
      network: config.defaultNetwork,
      uptime: Date.now() - startTime,
    };

    res.json(response);
  });

  // GET /api/ready
  router.get("/ready", async (_req, res) => {
    const dataDirWritable = await canWrite(config.dataDir);
    let runtimeStoreReady = true;
    try {
      getRuntimeStateStore(config);
    } catch {
      runtimeStoreReady = false;
    }

    const ready = dataDirWritable && runtimeStoreReady;
    const response: HealthResponse & {
      ready: boolean;
      checks: {
        dataDirWritable: boolean;
        runtimeStoreReady: boolean;
      };
    } = {
      status: ready ? "ok" : "error",
      sdkConnected: true,
      agentConfigured: false,
      network: config.defaultNetwork,
      uptime: Date.now() - startTime,
      ready,
      checks: {
        dataDirWritable,
        runtimeStoreReady,
      },
    };

    res.status(ready ? 200 : 503).json(response);
  });

  return router;
}
