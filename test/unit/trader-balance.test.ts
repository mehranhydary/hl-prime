import { describe, it, expect, vi } from "vitest";
import { getUnifiedBalance } from "../../apps/trader/server/src/services/balance.js";

function mockHp(overrides: {
  accountValue?: string;
  totalRawUsd?: string;
  withdrawable?: string;
  balances?: { coin: string; total: string }[];
  assetPositions?: { position: { unrealizedPnl: string } }[];
} = {}) {
  return {
    api: {
      clearinghouseState: vi.fn().mockResolvedValue({
        marginSummary: {
          accountValue: overrides.accountValue ?? "10000.50",
          totalNtlPos: "5000",
          totalRawUsd: overrides.totalRawUsd ?? "10000",
          totalMarginUsed: "2500",
        },
        assetPositions: overrides.assetPositions ?? [],
        crossMaintenanceMarginUsed: "0",
        withdrawable: overrides.withdrawable ?? "3000",
      }),
      spotClearinghouseState: vi.fn().mockResolvedValue({
        balances: overrides.balances ?? [
          { coin: "USDC", total: "5000.25" },
          { coin: "USDH", total: "1000.00" },
          { coin: "ETH", total: "2.5" },   // Not a stablecoin
          { coin: "USDE", total: "0.0001" }, // Below threshold
        ],
      }),
    },
  } as any;
}

/** Helper: build a Map<string, number> from a plain object. */
function priceMap(obj: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(obj));
}

describe("getUnifiedBalance", () => {
  const stableTokens = ["USDC", "USDH", "USDE", "USDT0"];
  const masterAddress = "0xabcdef1234567890";

  it("calculates total USD as spot + perps accountValue", async () => {
    const hp = mockHp();
    // totalUsd = spotTotalUsd + perpAccountValueUsd
    //          = 6000.25 + 10000.50 = 16000.75
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.perpAccountValueUsd).toBe(10000.50);
    expect(balance.perpRawUsd).toBe(10000);
    // availableUsd = spotStableUsd (stablecoin balances total)
    expect(balance.availableUsd).toBeCloseTo(6000.25, 1);
    expect(balance.spotStableUsd).toBeCloseTo(6000.25, 1);
    // No spotPriceMap passed → ETH valued at 0, only stables counted in spot
    expect(balance.totalUsd).toBeCloseTo(16000.75, 1);
  });

  it("values non-stable spot tokens via spotPriceMap when provided", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens, priceMap({ ETH: 3000 }));

    // spotTotal = 5000.25 + 1000 + 2.5*3000 = 13500.25
    // totalUsd = spotTotal + accountValue = 13500.25 + 10000.50 = 23500.75
    expect(balance.totalUsd).toBeCloseTo(23500.75, 1);
    // stableUsd doesn't include non-stables
    expect(balance.spotStableUsd).toBeCloseTo(6000.25, 1);
  });

  it("handles unified/portfolio-margin mode (negative totalRawUsd)", async () => {
    // Simulates unified mode: perps borrowed heavily from spot.
    // accountValue already reflects the perps equity.
    const hp = mockHp({
      accountValue: "850",
      totalRawUsd: "-7500",
      balances: [
        { coin: "USDC", total: "1200" },
        { coin: "HYPE", total: "300" },
      ],
    });
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens, priceMap({ HYPE: 25 }));

    // spotTotal = 1200 + 300*25 = 8700
    // totalUsd = spotTotal + accountValue = 8700 + 850 = 9550
    expect(balance.totalUsd).toBeCloseTo(9550, 0);
    expect(balance.spotStableUsd).toBeCloseTo(1200, 0);
  });

  it("includes stablecoin breakdown", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.spotStableBreakdown).toHaveLength(2); // USDC + USDH (USDE below threshold)
    const usdc = balance.spotStableBreakdown.find((b) => b.coin === "USDC");
    expect(usdc).toBeDefined();
    expect(usdc!.amount).toBe(5000.25);
    expect(usdc!.usd).toBe(5000.25); // 1:1 USD
  });

  it("excludes non-stablecoin balances from breakdown", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    const eth = balance.spotStableBreakdown.find((b) => b.coin === "ETH");
    expect(eth).toBeUndefined();
  });

  it("excludes dust balances below 0.001", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    const usde = balance.spotStableBreakdown.find((b) => b.coin === "USDE");
    expect(usde).toBeUndefined();
  });

  it("handles zero spot balances", async () => {
    const hp = mockHp({ balances: [] });
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.spotStableUsd).toBe(0);
    expect(balance.spotStableBreakdown).toHaveLength(0);
    // totalUsd = 0 spot + accountValue = 10000.50
    expect(balance.totalUsd).toBe(10000.50);
  });

  it("handles zero perp account value", async () => {
    const hp = mockHp({ accountValue: "0", totalRawUsd: "0" });
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.perpAccountValueUsd).toBe(0);
    expect(balance.perpRawUsd).toBe(0);
    expect(balance.totalUsd).toBeCloseTo(6000.25, 1);
  });

  it("passes master address to both API calls", async () => {
    const hp = mockHp();
    await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(hp.api.clearinghouseState).toHaveBeenCalledWith(masterAddress);
    expect(hp.api.spotClearinghouseState).toHaveBeenCalledWith(masterAddress);
  });

  it("is case-insensitive for stablecoin matching", async () => {
    const hp = mockHp({
      balances: [{ coin: "usdc", total: "100" }],
    });
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.spotStableBreakdown).toHaveLength(1);
    expect(balance.spotStableUsd).toBe(100);
  });

  it("preserves stableTokenSet in response", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.stableTokenSet).toEqual(stableTokens);
  });
});
