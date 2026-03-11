import fs from "node:fs";
import path from "node:path";
import type { Network } from "../../shared/types.js";

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  storePassphrase: string | null;
  appPassword: string;
  appPasswordTtlMs: number;
  defaultNetwork: Network;
  stableTokens: string[];
  defaultBuilderAddress: `0x${string}`;
  defaultBuilderFeeBps: number;
  agentExpiryDays: number;
  enableCollateralInputDebug: boolean;
  /** Enable diagnostic debug routes (disabled by default). */
  enableDebugRoutes: boolean;
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

function isProductionRuntime(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production") return true;

  // Railway exposes deployment metadata envs in hosted runtime environments.
  return Boolean(
    process.env.RAILWAY_PROJECT_ID
      || process.env.RAILWAY_ENVIRONMENT
      || process.env.RAILWAY_ENVIRONMENT_NAME,
  );
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function resolveRuntimeStateSqlitePath(rawValue: string | undefined, dataDir: string): string {
  const fallback = path.join(dataDir, "runtime-state.db");
  const trimmed = rawValue?.trim();
  if (!trimmed) return fallback;

  const resolved = path.resolve(trimmed);
  const resolvedDataDir = path.resolve(dataDir);
  if (trimmed.endsWith("/") || trimmed.endsWith("\\") || resolved === resolvedDataDir) {
    return path.join(resolved, "runtime-state.db");
  }

  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, "runtime-state.db");
    }
  } catch {
    // Best-effort normalization; actual open errors are surfaced by sqlite init.
  }

  return resolved;
}

const MIN_APP_PASSWORD_LENGTH = 16;

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
  const enableDebugRoutes = parseBooleanEnv(
    process.env.TRADER_ENABLE_DEBUG_ROUTES,
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
  const productionRuntime = isProductionRuntime();
  const signerBackend = (process.env.TRADER_SIGNER_BACKEND ?? "local").trim().toLowerCase() === "privy"
    ? "privy"
    : "local";
  const signerLocalFallback = parseBooleanEnv(process.env.TRADER_SIGNER_LOCAL_FALLBACK, false);
  const runtimeStateBackend = (process.env.TRADER_RUNTIME_STATE_BACKEND ?? "sqlite").trim().toLowerCase() === "memory"
    ? "memory"
    : "sqlite";
  const runtimeStateSqlitePath = resolveRuntimeStateSqlitePath(
    process.env.TRADER_RUNTIME_STATE_SQLITE_PATH,
    dataDir,
  );
  const passphrase = process.env.TRADER_STORE_PASSPHRASE ?? null;
  const appPassword = process.env.TRADER_APP_PASSWORD?.trim() ?? "";
  if (!appPassword) {
    throw new Error("TRADER_APP_PASSWORD must be set and non-empty.");
  }
  if (appPassword.length < MIN_APP_PASSWORD_LENGTH) {
    throw new Error(`TRADER_APP_PASSWORD must be at least ${MIN_APP_PASSWORD_LENGTH} characters.`);
  }
  const appPasswordTtlDaysRaw = process.env.TRADER_APP_PASSWORD_TTL_DAYS ?? "7";
  const appPasswordTtlDays = parseInt(appPasswordTtlDaysRaw, 10);
  if (!Number.isFinite(appPasswordTtlDays) || appPasswordTtlDays <= 0) {
    throw new Error("TRADER_APP_PASSWORD_TTL_DAYS must be a positive integer.");
  }
  if (appPasswordTtlDays > 30) {
    throw new Error("TRADER_APP_PASSWORD_TTL_DAYS must be <= 30.");
  }
  const appPasswordTtlMs = appPasswordTtlDays * 24 * 60 * 60 * 1000;
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
  if (!devInsecure && allowedOrigins.some((origin) => origin === "*")) {
    throw new Error(
      "TRADER_ALLOWED_ORIGINS cannot include '*' unless TRADER_DEV_INSECURE=true",
    );
  }
  const BOGUS_ORIGIN_PATTERNS = new Set(["true", "false", "1", "0", "yes", "no"]);
  for (const origin of allowedOrigins) {
    const lower = origin.toLowerCase();
    if (BOGUS_ORIGIN_PATTERNS.has(lower)) {
      throw new Error(
        `TRADER_ALLOWED_ORIGINS contains '${origin}' which looks like a boolean, not a URL. ` +
        "Set it to comma-separated origins like 'https://app.example.com'.",
      );
    }
    if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
      throw new Error(
        `TRADER_ALLOWED_ORIGINS contains '${origin}' which is not a valid origin URL. ` +
        "Each origin must start with http:// or https://.",
      );
    }
  }
  if (productionRuntime && devInsecure) {
    throw new Error(
      "TRADER_DEV_INSECURE=true is not allowed in production runtime (NODE_ENV=production/Railway).",
    );
  }
  if (productionRuntime && !authEnabled) {
    throw new Error(
      "TRADER_AUTH_ENABLED=false is not allowed in production runtime (NODE_ENV=production/Railway).",
    );
  }
  if (productionRuntime && enableDebugRoutes) {
    throw new Error(
      "TRADER_ENABLE_DEBUG_ROUTES=true is not allowed in production runtime (NODE_ENV=production/Railway).",
    );
  }

  const portRaw = process.env.TRADER_PORT ?? process.env.PORT ?? "4400";
  const parsedPort = parseInt(portRaw, 10);
  const host = process.env.TRADER_HOST
    ?? ((process.env.NODE_ENV ?? "").toLowerCase() === "production" ? "0.0.0.0" : "127.0.0.1");
  if (productionRuntime && isLoopbackHost(host)) {
    throw new Error(
      `TRADER_HOST=${host} is not allowed in production runtime (bind 0.0.0.0 on Railway).`,
    );
  }

  return {
    port: Number.isFinite(parsedPort) ? parsedPort : 4400,
    host,
    dataDir,
    storePassphrase: passphrase,
    appPassword,
    appPasswordTtlMs,
    defaultNetwork: (process.env.TRADER_DEFAULT_NETWORK as Network) ?? "mainnet",
    stableTokens,
    defaultBuilderAddress: (process.env.TRADER_BUILDER_ADDRESS as `0x${string}`) ??
      "0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37",
    defaultBuilderFeeBps: parseInt(process.env.TRADER_BUILDER_FEE_BPS ?? "1", 10),
    agentExpiryDays: parseInt(process.env.TRADER_AGENT_EXPIRY_DAYS ?? "30", 10),
    enableCollateralInputDebug,
    enableDebugRoutes,
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
