import { describe, it, expect, vi } from "vitest";
import { getUnifiedBalance } from "../../apps/trader/server/src/services/balance.js";

function mockHp(overrides: {
  accountValue?: string;
  totalRawUsd?: string;
  balances?: { coin: string; total: string }[];
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
        assetPositions: [],
        crossMaintenanceMarginUsed: "0",
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

describe("getUnifiedBalance", () => {
  const stableTokens = ["USDC", "USDH", "USDE", "USDT0"];
  const masterAddress = "0xabcdef1234567890";

  it("calculates total USD from perp + spot stables", async () => {
    const hp = mockHp();
    const balance = await getUnifiedBalance(hp, masterAddress, stableTokens);

    expect(balance.perpAccountValueUsd).toBe(10000.50);
    // perpRawUsd is totalRawUsd (deposited USDC, no PNL) — must not equal accountValue
    expect(balance.perpRawUsd).toBe(10000);
    expect(balance.spotStableUsd).toBeCloseTo(6000.25, 1); // 5000.25 USDC + 1000 USDH (USDE 0.0001 below threshold)
    // totalUsd uses accountValue (total equity) so negative totalRawUsd doesn't break it
    expect(balance.totalUsd).toBeCloseTo(16000.75, 1);
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

  it("excludes non-stablecoin balances", async () => {
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
    expect(balance.totalUsd).toBe(10000.50); // perpAccountValueUsd only (no spot stables)
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
