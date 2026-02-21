import path from "node:path";
import type { Network } from "../../shared/types.js";

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  storePassphrase: string | null;
  defaultNetwork: Network;
  stableTokens: string[];
  defaultBuilderAddress: `0x${string}`;
  defaultBuilderFeeBps: number;
  agentExpiryDays: number;
  enableCollateralInputDebug: boolean;
  enableTimingLogs: boolean;
  /** Allowed CORS origins. Empty array = permissive (dev mode). */
  allowedOrigins: string[];
  /** Enable EIP-712 session auth. Default: true. Set TRADER_AUTH_ENABLED=false to disable. */
  authEnabled: boolean;
  /** Explicit opt-in insecure local mode (permissive CORS and optional auth). */
  devInsecure: boolean;
  /** Runtime state backend (memory|sqlite). */
  runtimeStateBackend: "memory" | "sqlite";
  /** Runtime state sqlite path when backend=sqlite. */
  runtimeStateSqlitePath: string;
  /** Signer backend. */
  signerBackend: "local" | "privy";
  /** Emergency fallback to local encrypted signer store while primary backend is privy. */
  signerLocalFallback: boolean;
  privy: {
    appId: string | null;
    appSecret: string | null;
    authorizationKey: string | null;
  };
  aws: {
    region: string | null;
    kmsKeyId: string | null;
  };
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return defaultValue;
}

export function loadConfig(): ServerConfig {
  const dataDir = process.env.TRADER_DATA_DIR
    ? path.resolve(process.env.TRADER_DATA_DIR)
    : path.resolve(process.cwd(), ".data");

  const stableTokensRaw = process.env.TRADER_STABLE_TOKENS;
  const stableTokens = stableTokensRaw
    ? stableTokensRaw.split(",").map((t) => t.trim())
    : ["USDC", "USDH", "USDE", "USDT0"];
  const enableCollateralInputDebug = parseBooleanEnv(
    process.env.TRADER_COLLATERAL_INPUT_DEBUG,
    false,
  );
  const enableTimingLogs = parseBooleanEnv(
    process.env.TRADER_TIMING_LOGS,
    true,
  );

  const originsRaw = process.env.TRADER_ALLOWED_ORIGINS;
  const allowedOrigins = originsRaw
    ? originsRaw.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
  const devInsecure = parseBooleanEnv(process.env.TRADER_DEV_INSECURE, false);
  const authEnabled = parseBooleanEnv(process.env.TRADER_AUTH_ENABLED, true);
  const signerBackend = (process.env.TRADER_SIGNER_BACKEND ?? "local").trim().toLowerCase() === "privy"
    ? "privy"
    : "local";
  const signerLocalFallback = parseBooleanEnv(process.env.TRADER_SIGNER_LOCAL_FALLBACK, false);
  const runtimeStateBackend = (process.env.TRADER_RUNTIME_STATE_BACKEND ?? "sqlite").trim().toLowerCase() === "memory"
    ? "memory"
    : "sqlite";
  const runtimeStateSqlitePath = process.env.TRADER_RUNTIME_STATE_SQLITE_PATH
    ?? path.join(dataDir, "runtime-state.db");
  const passphrase = process.env.TRADER_STORE_PASSPHRASE ?? null;
  const requiresPassphrase = signerBackend === "local" || signerLocalFallback;
  if (requiresPassphrase && (!passphrase || passphrase.length < 8)) {
    throw new Error(
      "TRADER_STORE_PASSPHRASE must be set (min 8 chars) when local signer storage is enabled. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  if (!devInsecure && allowedOrigins.length === 0) {
    throw new Error(
      "TRADER_ALLOWED_ORIGINS must be set unless TRADER_DEV_INSECURE=true",
    );
  }

  const portRaw = process.env.TRADER_PORT ?? process.env.PORT ?? "4400";
  const parsedPort = parseInt(portRaw, 10);
  const host = process.env.TRADER_HOST
    ?? ((process.env.NODE_ENV ?? "").toLowerCase() === "production" ? "0.0.0.0" : "127.0.0.1");

  return {
    port: Number.isFinite(parsedPort) ? parsedPort : 4400,
    host,
    dataDir,
    storePassphrase: passphrase,
    defaultNetwork: (process.env.TRADER_DEFAULT_NETWORK as Network) ?? "mainnet",
    stableTokens,
    defaultBuilderAddress: (process.env.TRADER_BUILDER_ADDRESS as `0x${string}`) ??
      "0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37",
    defaultBuilderFeeBps: parseInt(process.env.TRADER_BUILDER_FEE_BPS ?? "1", 10),
    agentExpiryDays: parseInt(process.env.TRADER_AGENT_EXPIRY_DAYS ?? "30", 10),
    enableCollateralInputDebug,
    enableTimingLogs,
    allowedOrigins,
    authEnabled,
    devInsecure,
    runtimeStateBackend,
    runtimeStateSqlitePath,
    signerBackend,
    signerLocalFallback,
    privy: {
      appId: process.env.TRADER_PRIVY_APP_ID ?? null,
      appSecret: process.env.TRADER_PRIVY_APP_SECRET ?? null,
      authorizationKey: process.env.TRADER_PRIVY_AUTHORIZATION_KEY ?? null,
    },
    aws: {
      region: process.env.TRADER_AWS_REGION ?? null,
      kmsKeyId: process.env.TRADER_AWS_KMS_KEY_ID ?? null,
    },
  };
}
