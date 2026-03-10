import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { loadConfig } from "../../apps/trader/server/src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set minimum required env
    process.env.TRADER_STORE_PASSPHRASE = "test-passphrase-1234";
    process.env.TRADER_ALLOWED_ORIGINS = "http://localhost:3000";
    process.env.TRADER_APP_PASSWORD = "test-app-password";
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("TRADER_") || key.startsWith("RAILWAY_")) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("loads config with default values", () => {
    const config = loadConfig();

    expect(config.port).toBe(4400);
    expect(config.host).toBe("127.0.0.1");
    expect(config.defaultNetwork).toBe("mainnet");
    expect(config.stableTokens).toEqual(["USDC", "USDH", "USDE", "USDT0"]);
    expect(config.defaultBuilderFeeBps).toBe(1);
    expect(config.agentExpiryDays).toBe(30);
    expect(config.appPasswordTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(config.authEnabled).toBe(true);
    expect(config.enableTimingLogs).toBe(true);
    expect(config.devInsecure).toBe(false);
    expect(config.runtimeStateBackend).toBe("sqlite");
    expect(config.dataDir).toBe(path.resolve(process.cwd(), ".data"));
    expect(config.runtimeStateSqlitePath).toBe(path.resolve(process.cwd(), ".data/runtime-state.db"));
    expect(config.signerBackend).toBe("local");
    expect(config.signerLocalFallback).toBe(false);
  });

  it("throws when passphrase is missing", () => {
    delete process.env.TRADER_STORE_PASSPHRASE;
    expect(() => loadConfig()).toThrow("TRADER_STORE_PASSPHRASE");
  });

  it("throws when passphrase is too short", () => {
    process.env.TRADER_STORE_PASSPHRASE = "short";
    expect(() => loadConfig()).toThrow("TRADER_STORE_PASSPHRASE");
  });

  it("reads custom port", () => {
    process.env.TRADER_PORT = "5500";
    expect(loadConfig().port).toBe(5500);
  });

  it("reads custom host", () => {
    process.env.TRADER_HOST = "0.0.0.0";
    expect(loadConfig().host).toBe("0.0.0.0");
  });

  it("reads custom network", () => {
    process.env.TRADER_DEFAULT_NETWORK = "testnet";
    expect(loadConfig().defaultNetwork).toBe("testnet");
  });

  it("reads custom stable tokens", () => {
    process.env.TRADER_STABLE_TOKENS = "USDC,DAI";
    expect(loadConfig().stableTokens).toEqual(["USDC", "DAI"]);
  });

  it("reads custom builder address", () => {
    process.env.TRADER_BUILDER_ADDRESS = "0xABCD";
    expect(loadConfig().defaultBuilderAddress).toBe("0xABCD");
  });

  it("reads custom builder fee", () => {
    process.env.TRADER_BUILDER_FEE_BPS = "5";
    expect(loadConfig().defaultBuilderFeeBps).toBe(5);
  });

  it("reads custom agent expiry days", () => {
    process.env.TRADER_AGENT_EXPIRY_DAYS = "7";
    expect(loadConfig().agentExpiryDays).toBe(7);
  });

  it("reads custom app password TTL days", () => {
    process.env.TRADER_APP_PASSWORD_TTL_DAYS = "14";
    expect(loadConfig().appPasswordTtlMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("rejects app password TTL above 30 days", () => {
    process.env.TRADER_APP_PASSWORD_TTL_DAYS = "31";
    expect(() => loadConfig()).toThrow("TRADER_APP_PASSWORD_TTL_DAYS must be <= 30.");
  });

  it("reads collateral debug flag", () => {
    process.env.TRADER_COLLATERAL_INPUT_DEBUG = "true";
    expect(loadConfig().enableCollateralInputDebug).toBe(true);
  });

  it("reads timing logs flag", () => {
    process.env.TRADER_TIMING_LOGS = "false";
    expect(loadConfig().enableTimingLogs).toBe(false);
  });

  it("reads debug routes flag", () => {
    process.env.TRADER_ENABLE_DEBUG_ROUTES = "true";
    expect(loadConfig().enableDebugRoutes).toBe(true);
  });

  it("reads auth enabled flag", () => {
    process.env.TRADER_AUTH_ENABLED = "true";
    expect(loadConfig().authEnabled).toBe(true);
  });

  it("rejects app password shorter than 16 characters", () => {
    process.env.TRADER_APP_PASSWORD = "short-password";
    expect(() => loadConfig()).toThrow("TRADER_APP_PASSWORD must be at least 16 characters.");
  });

  it("reads allowed origins", () => {
    process.env.TRADER_ALLOWED_ORIGINS = "http://localhost:3000,https://app.example.com";
    expect(loadConfig().allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://app.example.com",
    ]);
  });

  it("requires allowed origins by default", () => {
    delete process.env.TRADER_ALLOWED_ORIGINS;
    expect(() => loadConfig()).toThrow("TRADER_ALLOWED_ORIGINS");
  });

  it("allows empty origins when dev insecure mode is enabled", () => {
    delete process.env.TRADER_ALLOWED_ORIGINS;
    process.env.TRADER_DEV_INSECURE = "true";
    const config = loadConfig();
    expect(config.allowedOrigins).toEqual([]);
    expect(config.devInsecure).toBe(true);
  });

  it("rejects wildcard allowed origins in secure mode", () => {
    process.env.TRADER_ALLOWED_ORIGINS = "*";
    expect(() => loadConfig()).toThrow("TRADER_ALLOWED_ORIGINS cannot include '*'");
  });

  it("rejects boolean-like origin values", () => {
    process.env.TRADER_ALLOWED_ORIGINS = "true";
    expect(() => loadConfig()).toThrow("looks like a boolean");
  });

  it("rejects origins without http(s) scheme", () => {
    process.env.TRADER_ALLOWED_ORIGINS = "app.example.com";
    expect(() => loadConfig()).toThrow("not a valid origin URL");
  });

  it("reads runtime state backend and sqlite path", () => {
    process.env.TRADER_RUNTIME_STATE_BACKEND = "memory";
    process.env.TRADER_RUNTIME_STATE_SQLITE_PATH = "/tmp/hl-prime-runtime.db";
    const config = loadConfig();
    expect(config.runtimeStateBackend).toBe("memory");
    expect(config.runtimeStateSqlitePath).toBe("/tmp/hl-prime-runtime.db");
  });

  it("reads TRADER_DATA_DIR and derives sqlite path", () => {
    process.env.TRADER_DATA_DIR = "/tmp/hl-prime-data";
    const config = loadConfig();
    expect(config.dataDir).toBe("/tmp/hl-prime-data");
    expect(config.runtimeStateSqlitePath).toBe("/tmp/hl-prime-data/runtime-state.db");
  });

  it("does not require passphrase when privy backend is enabled without local fallback", () => {
    delete process.env.TRADER_STORE_PASSPHRASE;
    process.env.TRADER_SIGNER_BACKEND = "privy";
    process.env.TRADER_SIGNER_LOCAL_FALLBACK = "false";
    const config = loadConfig();
    expect(config.storePassphrase).toBeNull();
  });

  it("requires passphrase when local fallback is enabled with privy backend", () => {
    delete process.env.TRADER_STORE_PASSPHRASE;
    process.env.TRADER_SIGNER_BACKEND = "privy";
    process.env.TRADER_SIGNER_LOCAL_FALLBACK = "true";
    expect(() => loadConfig()).toThrow("TRADER_STORE_PASSPHRASE");
  });

  describe("production runtime guardrails", () => {
    it("rejects dev insecure mode when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      process.env.TRADER_DEV_INSECURE = "true";
      delete process.env.TRADER_ALLOWED_ORIGINS;
      expect(() => loadConfig()).toThrow("TRADER_DEV_INSECURE=true is not allowed");
    });

    it("rejects auth disabled when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      process.env.TRADER_AUTH_ENABLED = "false";
      expect(() => loadConfig()).toThrow("TRADER_AUTH_ENABLED=false is not allowed");
    });

    it("treats Railway runtime metadata as production for guardrails", () => {
      delete process.env.NODE_ENV;
      process.env.RAILWAY_PROJECT_ID = "project_123";
      process.env.TRADER_AUTH_ENABLED = "false";
      expect(() => loadConfig()).toThrow("TRADER_AUTH_ENABLED=false is not allowed");
    });

    it("rejects loopback host binding in production runtime", () => {
      process.env.NODE_ENV = "production";
      process.env.TRADER_HOST = "127.0.0.1";
      expect(() => loadConfig()).toThrow("TRADER_HOST=127.0.0.1 is not allowed");
    });

    it("rejects debug routes when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      process.env.TRADER_ENABLE_DEBUG_ROUTES = "true";
      expect(() => loadConfig()).toThrow("TRADER_ENABLE_DEBUG_ROUTES=true is not allowed");
    });
  });

  describe("boolean env parsing", () => {
    it.each([
      ["1", true],
      ["true", true],
      ["yes", true],
      ["on", true],
      ["TRUE", true],
      ["0", false],
      ["false", false],
      ["no", false],
      ["off", false],
      ["FALSE", false],
    ])("parses '%s' as %s", (value, expected) => {
      process.env.TRADER_AUTH_ENABLED = value;
      expect(loadConfig().authEnabled).toBe(expected);
    });

    it("uses default for unrecognized values", () => {
      process.env.TRADER_AUTH_ENABLED = "maybe";
      // Default for authEnabled is true
      expect(loadConfig().authEnabled).toBe(true);
    });
  });
});
