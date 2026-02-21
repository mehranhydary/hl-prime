import { describe, it, expect, vi, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { NktkasProvider } from "../../src/provider/nktkas.js";
import { NoWalletError } from "../../src/utils/errors.js";

const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945386f9f447f99f9c53f1496f6b7e2f5f8a6f" as const;
const MASTER_ADDRESS = "0x8c1938750caf4b1f9f97174a6228eae705148d5e" as const;
const USER_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

// ── Helpers ────────────────────────────────────────────────────────────

function createProvider(overrides: Partial<ConstructorParameters<typeof NktkasProvider>[0]> = {}) {
  return new NktkasProvider({
    privateKey: PRIVATE_KEY,
    walletAddress: MASTER_ADDRESS,
    testnet: true,
    ...overrides,
  });
}

function getInfo(provider: NktkasProvider) {
  return (provider as any).info;
}

function getExchange(provider: NktkasProvider) {
  return (provider as any).exchange;
}

// ── Construction ──────────────────────────────────────────────────────

describe("NktkasProvider vault routing", () => {
  it("does not set defaultVaultAddress for agent sessions unless explicitly configured", () => {
    const provider = createProvider();
    expect(getExchange(provider).config_.defaultVaultAddress).toBeUndefined();
  });

  it("sets defaultVaultAddress only when vaultAddress is explicitly provided", () => {
    const provider = createProvider({ vaultAddress: MASTER_ADDRESS });
    expect(getExchange(provider).config_.defaultVaultAddress).toBe(MASTER_ADDRESS);
  });

  it("does not set defaultVaultAddress when wallet matches signer", () => {
    const signerAddress = privateKeyToAccount(PRIVATE_KEY).address;
    const provider = createProvider({ walletAddress: signerAddress });
    expect(getExchange(provider).config_.defaultVaultAddress).toBeUndefined();
  });
});

describe("NktkasProvider construction", () => {
  it("creates exchange client when privateKey provided", () => {
    const provider = createProvider();
    expect(getExchange(provider)).not.toBeNull();
  });

  it("does not create exchange client without privateKey", () => {
    const provider = new NktkasProvider({ testnet: true });
    expect(getExchange(provider)).toBeNull();
  });

  it("exposes signer address", () => {
    const provider = createProvider();
    const signerAddress = privateKeyToAccount(PRIVATE_KEY).address;
    expect(provider.getSignerAddress()).toBe(signerAddress);
  });

  it("returns null signer address when no privateKey", () => {
    const provider = new NktkasProvider({ testnet: true });
    expect(provider.getSignerAddress()).toBeNull();
  });

  it("uses default cache TTLs when not configured", () => {
    const provider = createProvider();
    expect((provider as any).l2BookCacheTtlMs).toBe(250);
    expect((provider as any).spotMetaCacheTtlMs).toBe(30_000);
  });

  it("accepts custom cache TTLs", () => {
    const provider = createProvider({ l2BookCacheTtlMs: 500, spotMetaCacheTtlMs: 60_000 });
    expect((provider as any).l2BookCacheTtlMs).toBe(500);
    expect((provider as any).spotMetaCacheTtlMs).toBe(60_000);
  });
});

// ── Exchange method guards ────────────────────────────────────────────

describe("NktkasProvider exchange guards", () => {
  it("throws NoWalletError for placeOrder without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.placeOrder({
      assetIndex: 0,
      isBuy: true,
      price: "42000",
      size: "1",
      orderType: { limit: { tif: "Ioc" } },
    })).rejects.toThrow(NoWalletError);
  });

  it("throws NoWalletError for batchOrders without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.batchOrders([])).rejects.toThrow(NoWalletError);
  });

  it("throws NoWalletError for cancelOrder without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.cancelOrder({ asset: 0, oid: 1 })).rejects.toThrow(NoWalletError);
  });

  it("throws NoWalletError for setLeverage without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.setLeverage(0, 10, true)).rejects.toThrow(NoWalletError);
  });

  it("throws NoWalletError for usdClassTransfer without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.usdClassTransfer(100, true)).rejects.toThrow(NoWalletError);
  });

  it("throws NoWalletError for approveAgent without wallet", async () => {
    const provider = new NktkasProvider({ testnet: true });
    await expect(provider.approveAgent({
      agentAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    })).rejects.toThrow(NoWalletError);
  });
});

// ── L2Book caching ────────────────────────────────────────────────────

describe("NktkasProvider L2Book caching", () => {
  let provider: NktkasProvider;
  let mockL2Book: ReturnType<typeof vi.fn>;

  const validBook = {
    coin: "BTC",
    time: 1700000000000,
    levels: [
      [{ px: "42000", sz: "1.0", n: 3 }],
      [{ px: "42010", sz: "2.0", n: 5 }],
    ],
  };

  beforeEach(() => {
    provider = createProvider({ l2BookCacheTtlMs: 100 });
    mockL2Book = vi.fn().mockResolvedValue(validBook);
    (provider as any).info.l2Book = mockL2Book;
  });

  it("calls upstream on cache miss", async () => {
    const result = await provider.l2Book("BTC");
    expect(result.coin).toBe("BTC");
    expect(mockL2Book).toHaveBeenCalledOnce();
  });

  it("returns cached value within TTL", async () => {
    await provider.l2Book("BTC");
    await provider.l2Book("BTC");
    expect(mockL2Book).toHaveBeenCalledOnce();
  });

  it("re-fetches after cache expiry", async () => {
    await provider.l2Book("BTC");
    // Expire the cache
    const cache = (provider as any).l2BookCache;
    const entry = cache.get("BTC:na");
    entry.expiresAt = Date.now() - 1;
    await provider.l2Book("BTC");
    expect(mockL2Book).toHaveBeenCalledTimes(2);
  });

  it("deduplicates in-flight requests for the same coin", async () => {
    const [r1, r2] = await Promise.all([
      provider.l2Book("BTC"),
      provider.l2Book("BTC"),
    ]);
    expect(mockL2Book).toHaveBeenCalledOnce();
    expect(r1).toEqual(r2);
  });

  it("caches separately by coin and nSigFigs", async () => {
    await provider.l2Book("BTC");
    await provider.l2Book("BTC", 3);
    expect(mockL2Book).toHaveBeenCalledTimes(2);
  });

  it("handles null raw book by returning empty levels", async () => {
    mockL2Book.mockResolvedValue(null);
    const result = await provider.l2Book("UNKNOWN");
    expect(result.levels[0]).toEqual([]);
    expect(result.levels[1]).toEqual([]);
    expect(result.coin).toBe("UNKNOWN");
  });
});

// ── SpotMeta caching ──────────────────────────────────────────────────

describe("NktkasProvider SpotMeta caching", () => {
  let provider: NktkasProvider;
  let mockSpotMeta: ReturnType<typeof vi.fn>;

  const validSpotMeta = {
    tokens: [{ name: "USDC", index: 0, szDecimals: 6, weiDecimals: 8, tokenId: "0x1", isCanonical: true }],
    universe: [{ name: "BTC/USDC", tokens: [1, 0], index: 0, isCanonical: true }],
  };

  beforeEach(() => {
    provider = createProvider({ spotMetaCacheTtlMs: 100 });
    mockSpotMeta = vi.fn().mockResolvedValue(validSpotMeta);
    (provider as any).info.spotMeta = mockSpotMeta;
  });

  it("calls upstream on cache miss", async () => {
    const result = await provider.spotMeta();
    expect(result.tokens).toHaveLength(1);
    expect(mockSpotMeta).toHaveBeenCalledOnce();
  });

  it("returns cached value within TTL", async () => {
    await provider.spotMeta();
    await provider.spotMeta();
    expect(mockSpotMeta).toHaveBeenCalledOnce();
  });

  it("re-fetches after cache expiry", async () => {
    await provider.spotMeta();
    (provider as any).spotMetaCache.expiresAt = Date.now() - 1;
    await provider.spotMeta();
    expect(mockSpotMeta).toHaveBeenCalledTimes(2);
  });

  it("deduplicates in-flight requests", async () => {
    const [r1, r2] = await Promise.all([
      provider.spotMeta(),
      provider.spotMeta(),
    ]);
    expect(mockSpotMeta).toHaveBeenCalledOnce();
    expect(r1).toEqual(r2);
  });
});

// ── ClearinghouseState caching ────────────────────────────────────────

describe("NktkasProvider clearinghouseState caching", () => {
  let provider: NktkasProvider;
  let mockCH: ReturnType<typeof vi.fn>;

  const validState = {
    marginSummary: { accountValue: "100", totalNtlPos: "50", totalRawUsd: "100", totalMarginUsed: "5" },
    crossMarginSummary: { accountValue: "100", totalNtlPos: "50", totalRawUsd: "100", totalMarginUsed: "5" },
    assetPositions: [],
    crossMaintenanceMarginUsed: "3",
  };

  beforeEach(() => {
    provider = createProvider();
    mockCH = vi.fn().mockResolvedValue(validState);
    (provider as any).info.clearinghouseState = mockCH;
  });

  it("caches by user + dex", async () => {
    await provider.clearinghouseState(USER_ADDRESS);
    await provider.clearinghouseState(USER_ADDRESS);
    expect(mockCH).toHaveBeenCalledOnce();
  });

  it("caches separately for different dex params", async () => {
    await provider.clearinghouseState(USER_ADDRESS);
    await provider.clearinghouseState(USER_ADDRESS, "xyz");
    expect(mockCH).toHaveBeenCalledTimes(2);
  });

  it("is case-insensitive for user address", async () => {
    await provider.clearinghouseState("0xABCD");
    await provider.clearinghouseState("0xabcd");
    expect(mockCH).toHaveBeenCalledOnce();
  });
});

// ── SpotClearinghouseState caching ────────────────────────────────────

describe("NktkasProvider spotClearinghouseState caching", () => {
  let provider: NktkasProvider;
  let mockSpotCH: ReturnType<typeof vi.fn>;

  const validState = { balances: [{ coin: "USDC", hold: "0", total: "10000", entryNtl: "10000", token: 0 }] };

  beforeEach(() => {
    provider = createProvider();
    mockSpotCH = vi.fn().mockResolvedValue(validState);
    (provider as any).info.spotClearinghouseState = mockSpotCH;
  });

  it("caches by user", async () => {
    await provider.spotClearinghouseState(USER_ADDRESS);
    await provider.spotClearinghouseState(USER_ADDRESS);
    expect(mockSpotCH).toHaveBeenCalledOnce();
  });

  it("is case-insensitive for user address", async () => {
    await provider.spotClearinghouseState("0xABCD");
    await provider.spotClearinghouseState("0xabcd");
    expect(mockSpotCH).toHaveBeenCalledOnce();
  });
});

// ── invalidateBalanceCaches ───────────────────────────────────────────

describe("NktkasProvider invalidateBalanceCaches", () => {
  it("clears both spot and perp balance caches", async () => {
    const provider = createProvider();
    const validCH = {
      marginSummary: { accountValue: "100", totalNtlPos: "50", totalRawUsd: "100", totalMarginUsed: "5" },
      crossMarginSummary: { accountValue: "100", totalNtlPos: "50", totalRawUsd: "100", totalMarginUsed: "5" },
      assetPositions: [],
      crossMaintenanceMarginUsed: "3",
    };
    const validSpotCH = { balances: [] };

    (provider as any).info.clearinghouseState = vi.fn().mockResolvedValue(validCH);
    (provider as any).info.spotClearinghouseState = vi.fn().mockResolvedValue(validSpotCH);

    // Populate caches
    await provider.clearinghouseState(USER_ADDRESS);
    await provider.spotClearinghouseState(USER_ADDRESS);
    expect((provider as any).clearinghouseCache.size).toBe(1);
    expect((provider as any).spotBalanceCache.size).toBe(1);

    provider.invalidateBalanceCaches();
    expect((provider as any).clearinghouseCache.size).toBe(0);
    expect((provider as any).spotBalanceCache.size).toBe(0);
  });
});

// ── disconnect ────────────────────────────────────────────────────────

describe("NktkasProvider disconnect", () => {
  it("clears all caches on disconnect", async () => {
    const provider = createProvider();
    const validBook = {
      coin: "BTC",
      time: 1700000000000,
      levels: [[{ px: "42000", sz: "1.0", n: 3 }], [{ px: "42010", sz: "2.0", n: 5 }]],
    };
    const validSpotMeta = {
      tokens: [{ name: "USDC", index: 0, szDecimals: 6, weiDecimals: 8, tokenId: "0x1", isCanonical: true }],
      universe: [],
    };

    (provider as any).info.l2Book = vi.fn().mockResolvedValue(validBook);
    (provider as any).info.spotMeta = vi.fn().mockResolvedValue(validSpotMeta);

    await provider.l2Book("BTC");
    await provider.spotMeta();

    expect((provider as any).l2BookCache.size).toBe(1);
    expect((provider as any).spotMetaCache).not.toBeNull();

    // Mock the ws transport close
    (provider as any).wsTransport.close = vi.fn().mockResolvedValue(undefined);
    await provider.disconnect();

    expect((provider as any).l2BookCache.size).toBe(0);
    expect((provider as any).spotMetaCache).toBeNull();
    expect((provider as any).spotBalanceCache.size).toBe(0);
    expect((provider as any).clearinghouseCache.size).toBe(0);
  });
});

// ── mapOrderType ──────────────────────────────────────────────────────

describe("NktkasProvider order type mapping", () => {
  it("maps limit order type", () => {
    const provider = createProvider();
    const result = (provider as any).mapOrderType({ limit: { tif: "Gtc" } });
    expect(result).toEqual({ limit: { tif: "Gtc" } });
  });

  it("maps trigger order type", () => {
    const provider = createProvider();
    const result = (provider as any).mapOrderType({
      trigger: { triggerPx: "42000", isMarket: true, tpsl: "tp" },
    });
    expect(result).toEqual({
      trigger: { triggerPx: "42000", isMarket: true, tpsl: "tp" },
    });
  });

  it("defaults to Ioc when no limit or trigger", () => {
    const provider = createProvider();
    const result = (provider as any).mapOrderType({});
    expect(result).toEqual({ limit: { tif: "Ioc" } });
  });
});
