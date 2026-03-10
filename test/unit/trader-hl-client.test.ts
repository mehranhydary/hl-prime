import { describe, it, expect, vi, beforeEach } from "vitest";
import { HLClientService } from "../../apps/trader/server/src/services/hl-client.js";
import type { ServerConfig } from "../../apps/trader/server/src/config.js";
import path from "node:path";

// Mock HyperliquidPrime at the module level
vi.mock("hyperliquid-prime", () => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockListAgents = vi.fn().mockResolvedValue([
    { address: "0x1234567890abcdef1234567890abcdef12345678", name: "test", validUntil: 9999999999 },
  ]);

  return {
    HyperliquidPrime: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      listAgents: mockListAgents,
      api: {
        clearinghouseState: vi.fn(),
        spotClearinghouseState: vi.fn(),
      },
    })),
  };
});

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 4400,
    host: "127.0.0.1",
    dataDir: path.resolve(process.cwd(), ".data"),
    storePassphrase: "test-passphrase-1234",
    appPassword: "test-app-password-1234",
    appPasswordTtlMs: 7 * 24 * 60 * 60 * 1000,
    defaultNetwork: "mainnet",
    stableTokens: ["USDC"],
    defaultBuilderAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    defaultBuilderFeeBps: 1,
    agentExpiryDays: 30,
    enableCollateralInputDebug: false,
    enableDebugRoutes: false,
    enableTimingLogs: false,
    allowedOrigins: [],
    authEnabled: false,
    devInsecure: true,
    runtimeStateBackend: "memory",
    runtimeStateSqlitePath: ".data/runtime-state.test.db",
    signerBackend: "local",
    signerLocalFallback: false,
    privy: {
      appId: null,
      appSecret: null,
      authorizationKey: null,
    },
    aws: {
      region: null,
      kmsKeyId: null,
    },
    ...overrides,
  };
}

describe("HLClientService", () => {
  let service: HLClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HLClientService(makeConfig());
  });

  it("provides access to agent store", () => {
    const store = service.getAgentStore();
    expect(store).toBeDefined();
    expect(typeof store.load).toBe("function");
    expect(typeof store.save).toBe("function");
    expect(typeof store.exists).toBe("function");
    expect(typeof store.delete).toBe("function");
  });

  it("creates public client and caches it", async () => {
    const hp1 = await service.getPublicClient("mainnet");
    const hp2 = await service.getPublicClient("mainnet");
    expect(hp1).toBe(hp2); // Same instance
  });

  it("creates separate public clients per network", async () => {
    const mainnet = await service.getPublicClient("mainnet");
    const testnet = await service.getPublicClient("testnet");
    expect(mainnet).not.toBe(testnet);
  });

  it("deduplicates concurrent public client connections", async () => {
    const { HyperliquidPrime } = await import("hyperliquid-prime");
    const promises = [
      service.getPublicClient("mainnet"),
      service.getPublicClient("mainnet"),
      service.getPublicClient("mainnet"),
    ];
    const [hp1, hp2, hp3] = await Promise.all(promises);
    expect(hp1).toBe(hp2);
    expect(hp2).toBe(hp3);
    // Should only construct one instance
    const constructorCalls = (HyperliquidPrime as any).mock.calls.filter(
      (call: any[]) => !call[0]?.privateKey,
    );
    expect(constructorCalls).toHaveLength(1);
  });

  it("hasClient returns false when no agent stored", async () => {
    const result = await service.hasClient("0xdeadbeef", "mainnet");
    expect(result).toBe(false);
  });

  it("getClient throws when no agent configured", async () => {
    await expect(
      service.getClient("0xdeadbeef", "mainnet"),
    ).rejects.toThrow("No agent configured");
  });

  it("disconnects all clients on disconnectAll", async () => {
    const hp = await service.getPublicClient("mainnet");
    await service.disconnectAll();

    // After disconnect, getting a public client should create a new one
    const hp2 = await service.getPublicClient("mainnet");
    expect(hp).not.toBe(hp2);
  });
});
