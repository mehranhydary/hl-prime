import { describe, it, expect, vi } from "vitest";
import { PositionManager } from "../../src/position/manager.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { ClearinghouseState } from "../../src/provider/types.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { BTC_NATIVE, ETH_NATIVE, ETH_HYENA } from "../fixtures/markets.js";
import pino from "pino";

const logger = pino({ level: "silent" });
const USER = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function makeMarginSummary() {
  return {
    accountValue: "100000",
    totalNtlPos: "50000",
    totalRawUsd: "100000",
    totalMarginUsed: "5000",
  };
}

function makeClearinghouseState(positions: ClearinghouseState["assetPositions"] = []): ClearinghouseState {
  return {
    marginSummary: makeMarginSummary(),
    crossMarginSummary: makeMarginSummary(),
    assetPositions: positions,
    crossMaintenanceMarginUsed: "3000",
  };
}

function makeAssetPosition(coin: string, szi: string, entryPx = "42000", markPx = "42500") {
  return {
    position: {
      coin,
      szi,
      entryPx,
      positionValue: "42500",
      unrealizedPnl: "500",
      returnOnEquity: "0.01",
      leverage: { type: "cross", value: "10" },
      liquidationPx: "38000",
      marginUsed: "4250",
      maxLeverage: 50,
      cumFunding: { allTime: "100", sinceChange: "10", sinceOpen: "5" },
      markPx,
    },
    type: "oneWay",
  };
}

function makeProvider(overrides: Partial<HLProvider> = {}): HLProvider {
  return {
    meta: vi.fn(),
    metaAndAssetCtxs: vi.fn(),
    perpDexs: vi.fn(),
    allPerpMetas: vi.fn(),
    spotMeta: vi.fn(),
    allMids: vi.fn(),
    l2Book: vi.fn(),
    clearinghouseState: vi.fn().mockResolvedValue(makeClearinghouseState()),
    spotClearinghouseState: vi.fn(),
    openOrders: vi.fn(),
    frontendOpenOrders: vi.fn(),
    historicalOrders: vi.fn(),
    userFills: vi.fn(),
    userFillsByTime: vi.fn(),
    userFunding: vi.fn(),
    fundingHistory: vi.fn(),
    candleSnapshot: vi.fn(),
    referral: vi.fn(),
    subscribeL2Book: vi.fn(),
    subscribeAllMids: vi.fn(),
    subscribeTrades: vi.fn(),
    subscribeUserEvents: vi.fn(),
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    batchOrders: vi.fn(),
    setLeverage: vi.fn(),
    usdClassTransfer: vi.fn(),
    setDexAbstraction: vi.fn(),
    approveBuilderFee: vi.fn(),
    maxBuilderFee: vi.fn(),
    approveAgent: vi.fn(),
    extraAgents: vi.fn(),
    userSetAbstraction: vi.fn(),
    agentSetAbstraction: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeRegistry(markets: Parameters<MarketRegistry["getAllGroups"]>[0] extends never ? never : any[]): MarketRegistry {
  // Create a mock registry that returns the configured groups
  const registry = {
    getAllGroups: vi.fn().mockReturnValue(
      markets.map((m: any) => ({
        baseAsset: m.baseAsset,
        markets: [m],
      })),
    ),
    findByCoin: vi.fn().mockImplementation((coin: string) =>
      markets.find((m: any) => m.coin === coin) ?? undefined,
    ),
  } as unknown as MarketRegistry;
  return registry;
}

describe("PositionManager", () => {
  describe("getPositions", () => {
    it("returns empty positions when no asset positions exist", async () => {
      const provider = makeProvider();
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data, warnings } = await pm.getPositions(USER);
      expect(data).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it("maps native positions correctly", async () => {
      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(
          makeClearinghouseState([makeAssetPosition("BTC", "1.5")]),
        ),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data).toHaveLength(1);
      expect(data[0].coin).toBe("BTC");
      expect(data[0].side).toBe("long");
      expect(data[0].size).toBe(1.5);
      expect(data[0].entryPrice).toBe(42000);
      expect(data[0].markPrice).toBe(42500);
      expect(data[0].leverage).toBe(10);
      expect(data[0].liquidationPrice).toBe(38000);
    });

    it("detects short positions from negative szi", async () => {
      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(
          makeClearinghouseState([makeAssetPosition("BTC", "-2.0")]),
        ),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data[0].side).toBe("short");
      expect(data[0].size).toBe(2.0);
    });

    it("queries HIP-3 deployer clearinghouse states in parallel", async () => {
      const clearinghouseState = vi.fn()
        .mockResolvedValueOnce(makeClearinghouseState([makeAssetPosition("ETH", "10")])) // native
        .mockResolvedValueOnce(makeClearinghouseState([makeAssetPosition("hyena:ETH", "5", "3200", "3250")])); // hyena deployer

      const provider = makeProvider({ clearinghouseState });
      const registry = makeRegistry([ETH_NATIVE, ETH_HYENA]);
      const pm = new PositionManager(provider, registry, logger);

      const { data, warnings } = await pm.getPositions(USER);
      expect(data).toHaveLength(2);
      expect(warnings).toEqual([]);
      expect(clearinghouseState).toHaveBeenCalledTimes(2);
      // First call: native (no dex param)
      expect(clearinghouseState).toHaveBeenCalledWith(USER);
      // Second call: hyena deployer
      expect(clearinghouseState).toHaveBeenCalledWith(USER, "hyena");
    });

    it("continues with warning when a deployer clearinghouse fetch fails", async () => {
      const clearinghouseState = vi.fn()
        .mockResolvedValueOnce(makeClearinghouseState([makeAssetPosition("ETH", "10")])) // native succeeds
        .mockRejectedValueOnce(new Error("deployer offline")); // hyena fails

      const provider = makeProvider({ clearinghouseState });
      const registry = makeRegistry([ETH_NATIVE, ETH_HYENA]);
      const pm = new PositionManager(provider, registry, logger);

      const { data, warnings } = await pm.getPositions(USER);
      expect(data).toHaveLength(1); // Only native position
      expect(data[0].coin).toBe("ETH");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("hyena");
      expect(warnings[0]).toContain("deployer offline");
    });

    it("handles null leverage value by defaulting to 1", async () => {
      const pos = makeAssetPosition("BTC", "1.0");
      pos.position.leverage = null;

      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(makeClearinghouseState([pos])),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data[0].leverage).toBe(1);
    });

    it("handles null liquidationPx", async () => {
      const pos = makeAssetPosition("BTC", "1.0");
      pos.position.liquidationPx = null;

      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(makeClearinghouseState([pos])),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data[0].liquidationPrice).toBeNull();
    });

    it("sets market to undefined for unknown coins", async () => {
      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(
          makeClearinghouseState([makeAssetPosition("DOGE", "100")]),
        ),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data[0].market).toBeUndefined();
      expect(data[0].baseAsset).toBe("DOGE"); // Falls back to coin name
    });

    it("handles missing markPx by defaulting to 0", async () => {
      const pos = makeAssetPosition("BTC", "1.0");
      (pos.position as any).markPx = undefined;

      const provider = makeProvider({
        clearinghouseState: vi.fn().mockResolvedValue(makeClearinghouseState([pos])),
      });
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data } = await pm.getPositions(USER);
      expect(data[0].markPrice).toBe(0);
    });
  });

  describe("getGroupedPositions", () => {
    it("groups positions by base asset", async () => {
      const clearinghouseState = vi.fn()
        .mockResolvedValueOnce(makeClearinghouseState([
          makeAssetPosition("BTC", "1.0"),
          makeAssetPosition("ETH", "10.0"),
        ]))
        .mockResolvedValueOnce(makeClearinghouseState([
          makeAssetPosition("hyena:ETH", "5.0", "3200", "3250"),
        ]));

      const provider = makeProvider({ clearinghouseState });
      const registry = makeRegistry([BTC_NATIVE, ETH_NATIVE, ETH_HYENA]);
      const pm = new PositionManager(provider, registry, logger);

      const { data: grouped } = await pm.getGroupedPositions(USER);
      expect(grouped.get("BTC")).toHaveLength(1);
      expect(grouped.get("ETH")).toHaveLength(2); // native + hyena
    });

    it("returns empty map for no positions", async () => {
      const provider = makeProvider();
      const registry = makeRegistry([BTC_NATIVE]);
      const pm = new PositionManager(provider, registry, logger);

      const { data: grouped } = await pm.getGroupedPositions(USER);
      expect(grouped.size).toBe(0);
    });

    it("propagates warnings from getPositions", async () => {
      const clearinghouseState = vi.fn()
        .mockResolvedValueOnce(makeClearinghouseState())
        .mockRejectedValueOnce(new Error("timeout"));

      const provider = makeProvider({ clearinghouseState });
      const registry = makeRegistry([ETH_NATIVE, ETH_HYENA]);
      const pm = new PositionManager(provider, registry, logger);

      const { warnings } = await pm.getGroupedPositions(USER);
      expect(warnings).toHaveLength(1);
    });
  });
});
