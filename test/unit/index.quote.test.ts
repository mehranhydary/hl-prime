import { describe, it, expect, vi } from "vitest";
import { HyperliquidPrime } from "../../src/index.js";
import type { Quote, SplitQuote } from "../../src/router/types.js";
import { TSLA_XYZ } from "../fixtures/markets.js";

const baseQuote: Quote = {
  baseAsset: "TSLA",
  side: "buy",
  requestedSize: 1,
  selectedMarket: TSLA_XYZ,
  estimatedAvgPrice: 431.5,
  estimatedPriceImpact: 1.2,
  estimatedFundingRate: 0.0001,
  alternativesConsidered: [],
  plan: {
    market: TSLA_XYZ,
    side: "buy",
    size: "1",
    price: "432.00",
    orderType: { limit: { tif: "Ioc" } },
    slippage: 0.01,
  },
};

const baseSplitQuote: SplitQuote = {
  ...baseQuote,
  isSplit: true,
  allocations: [{
    market: TSLA_XYZ,
    size: 1,
    estimatedCost: 431.5,
    estimatedAvgPrice: 431.5,
    proportion: 1,
  }],
  collateralPlan: {
    requirements: [],
    totalSwapCostBps: 0,
    swapsNeeded: false,
    abstractionEnabled: false,
  },
  splitPlan: {
    legs: [baseQuote.plan],
    collateralPlan: {
      requirements: [],
      totalSwapCostBps: 0,
      swapsNeeded: false,
      abstractionEnabled: false,
    },
    side: "buy",
    totalSize: "1",
    slippage: 0.01,
  },
};

describe("HyperliquidPrime quote facade", () => {
  it("falls back to USDC collateral and surfaces a warning when balance lookup fails", async () => {
    const hp = new HyperliquidPrime({ testnet: true, logLevel: "silent" });
    const routerMock = {
      quote: vi.fn(async () => ({ ...baseQuote })),
      quoteSplit: vi.fn(async () => ({ ...baseSplitQuote })),
    };

    (hp as any).router = routerMock;
    (hp as any).provider = {
      spotClearinghouseState: vi.fn(async () => {
        throw new Error("temporary failure");
      }),
    };
    (hp as any).connected = true;
    (hp as any).walletAddress = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

    const quote = await hp.quote("TSLA", "buy", 1);

    expect(routerMock.quote).toHaveBeenCalledWith(
      "TSLA",
      "buy",
      1,
      ["USDC"],
      0.01,
    );
    expect(quote.warnings?.some((w) => w.includes("defaulting to USDC"))).toBe(true);
  });

  it("always includes USDC in wallet-derived collateral and forwards to split quote", async () => {
    const hp = new HyperliquidPrime({ testnet: true, logLevel: "silent" });
    const routerMock = {
      quote: vi.fn(async () => ({ ...baseQuote })),
      quoteSplit: vi.fn(async () => ({ ...baseSplitQuote })),
    };

    (hp as any).router = routerMock;
    (hp as any).provider = {
      spotClearinghouseState: vi.fn(async () => ({
        balances: [
          { coin: "USDH", total: "10", hold: "0", entryNtl: "0", token: 1 },
        ],
      })),
    };
    (hp as any).connected = true;
    (hp as any).walletAddress = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

    await hp.quoteSplit("TSLA", "buy", 1);

    expect(routerMock.quoteSplit).toHaveBeenCalledWith(
      "TSLA",
      "buy",
      1,
      ["USDH", "USDC"],
      0.01,
    );
  });
});
