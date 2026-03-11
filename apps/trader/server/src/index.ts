// Load .env before anything else (Node 21.7+ built-in)
try { process.loadEnvFile(); } catch {}

import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { getClientService } from "./routes/agent.js";
import { WebSocketHub } from "./services/ws-hub.js";
import { closeRuntimeStateStore } from "./services/runtime-state.js";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`Trader API listening on http://${config.host}:${config.port}`);
});
server.setTimeout(30_000);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const wsHub = new WebSocketHub(server, config);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[shutdown] Received ${signal}, draining HTTP server...`);

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  try {
    await wsHub.shutdown();
  } catch (err) {
    console.warn("[shutdown] wsHub.shutdown failed:", err instanceof Error ? err.message : String(err));
  }

  try {
    await getClientService(config).disconnectAll();
  } catch (err) {
    console.warn("[shutdown] disconnectAll failed:", err instanceof Error ? err.message : String(err));
  }

  try {
    closeRuntimeStateStore();
  } catch (err) {
    console.warn("[shutdown] closeRuntimeStateStore failed:", err instanceof Error ? err.message : String(err));
  }

  process.exit(0);
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
