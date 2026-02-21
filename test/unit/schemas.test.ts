/**
 * Zod schema validation tests — validates that schemas accept valid data
 * and reject malformed data at the provider boundary.
 */
import { describe, it, expect } from "vitest";
import {
  MetaSchema,
  MetaAssetSchema,
  MetaAndAssetCtxsSchema,
  AssetCtxSchema,
  L2LevelSchema,
  L2BookSchema,
  PerpDexSchema,
  SpotTokenSchema,
  SpotMetaSchema,
  ClearinghouseStateSchema,
  SpotClearinghouseStateSchema,
  SpotBalanceSchema,
  OpenOrderSchema,
  FrontendOpenOrderSchema,
  HistoricalOrderSchema,
  FillSchema,
  FundingRecordSchema,
  UserFundingEntrySchema,
  CandleSchema,
  OrderStatusSchema,
  OrderResultSchema,
  ReferralResponseSchema,
  L2BookUpdateSchema,
  AllMidsUpdateSchema,
  TradeSchema,
  UserEventSchema,
  AssetPositionSchema,
} from "../../src/provider/schemas.js";

// ── Fixtures ──────────────────────────────────────────────────────────

const validMetaAsset = {
  name: "BTC",
  szDecimals: 4,
  maxLeverage: 50,
};

const validMeta = {
  universe: [validMetaAsset],
  collateralToken: 0,
};

const validAssetCtx = {
  funding: "0.00005",
  openInterest: "100000",
  prevDayPx: "42000",
  dayNtlVlm: "5000000000",
  oraclePx: "42100",
  markPx: "42050",
};

const validL2Level = { px: "42000.5", sz: "1.5", n: 3 };

const validL2Book = {
  coin: "BTC",
  time: 1700000000000,
  levels: [[validL2Level], [{ px: "42001.0", sz: "2.0", n: 5 }]],
};

const validPerpDex = {
  name: "xyz",
  deployer: "0x1234567890abcdef1234567890abcdef12345678",
};

const validSpotToken = {
  name: "USDC",
  index: 0,
  szDecimals: 6,
  weiDecimals: 8,
  tokenId: "0x1234",
  isCanonical: true,
};

const validSpotMeta = {
  tokens: [validSpotToken],
  universe: [{ name: "BTC/USDC", tokens: [1, 0], index: 0, isCanonical: true }],
};

const validMarginSummary = {
  accountValue: "100000",
  totalNtlPos: "50000",
  totalRawUsd: "100000",
  totalMarginUsed: "5000",
};

const validAssetPosition = {
  position: {
    coin: "BTC",
    szi: "1.5",
    entryPx: "42000",
    positionValue: "63000",
    unrealizedPnl: "500",
    returnOnEquity: "0.01",
    leverage: { type: "cross", value: "10" },
    liquidationPx: "38000",
    marginUsed: "6300",
    maxLeverage: 50,
    cumFunding: { allTime: "100", sinceChange: "10", sinceOpen: "5" },
  },
  type: "oneWay",
};

const validClearinghouseState = {
  marginSummary: validMarginSummary,
  crossMarginSummary: validMarginSummary,
  assetPositions: [validAssetPosition],
  crossMaintenanceMarginUsed: "3000",
};

const validSpotBalance = {
  coin: "USDC",
  hold: "0",
  total: "10000",
  entryNtl: "10000",
  token: 0,
};

const validOpenOrder = {
  coin: "BTC",
  limitPx: "42000",
  oid: 12345,
  side: "B",
  sz: "1.0",
  timestamp: 1700000000000,
};

const validFrontendOpenOrder = {
  coin: "BTC",
  side: "B" as const,
  limitPx: "42000",
  sz: "1.0",
  oid: 12345,
  timestamp: 1700000000000,
  origSz: "1.0",
  triggerCondition: "na",
  isTrigger: false,
  triggerPx: "0",
  children: [],
  isPositionTpsl: false,
  reduceOnly: false,
  orderType: "Limit",
  tif: "Gtc",
};

const validFill = {
  coin: "BTC",
  px: "42000",
  sz: "1.0",
  side: "B",
  time: 1700000000000,
  startPosition: "0",
  dir: "Open Long",
  closedPnl: "0",
  hash: "0xabc123",
  oid: 12345,
  crossed: true,
  fee: "4.2",
  feeToken: "USDC",
  tid: 67890,
};

const validFundingRecord = {
  coin: "BTC",
  fundingRate: "0.00005",
  premium: "0.00001",
  time: 1700000000000,
};

const validUserFundingEntry = {
  time: 1700000000000,
  hash: "0xabc123def456",
  delta: {
    type: "funding" as const,
    coin: "BTC",
    usdc: "-0.5",
    szi: "1.0",
    fundingRate: "0.00005",
    nSamples: 12,
  },
};

const validCandle = {
  t: 1700000000000,
  T: 1700000060000,
  s: "BTC",
  i: "1m",
  o: "42000",
  c: "42050",
  h: "42100",
  l: "41950",
  v: "100",
  n: 50,
};

const validTrade = {
  coin: "BTC",
  side: "B",
  px: "42000",
  sz: "0.5",
  time: 1700000000000,
  hash: "0xabc",
  tid: 123,
};

// ── Meta schemas ──────────────────────────────────────────────────────

describe("MetaAssetSchema", () => {
  it("parses valid asset", () => {
    expect(MetaAssetSchema.parse(validMetaAsset)).toEqual(validMetaAsset);
  });

  it("accepts optional fields", () => {
    const withOptionals = { ...validMetaAsset, onlyIsolated: true, isDelisted: false, marginMode: "cross" };
    expect(MetaAssetSchema.parse(withOptionals)).toEqual(withOptionals);
  });

  it("rejects missing name", () => {
    expect(() => MetaAssetSchema.parse({ szDecimals: 4, maxLeverage: 50 })).toThrow();
  });

  it("rejects wrong type for szDecimals", () => {
    expect(() => MetaAssetSchema.parse({ ...validMetaAsset, szDecimals: "4" })).toThrow();
  });
});

describe("MetaSchema", () => {
  it("parses valid meta", () => {
    const result = MetaSchema.parse(validMeta);
    expect(result.universe).toHaveLength(1);
    expect(result.collateralToken).toBe(0);
  });

  it("rejects missing collateralToken", () => {
    expect(() => MetaSchema.parse({ universe: [] })).toThrow();
  });
});

// ── Asset Context ─────────────────────────────────────────────────────

describe("AssetCtxSchema", () => {
  it("parses valid context", () => {
    expect(AssetCtxSchema.parse(validAssetCtx)).toEqual(validAssetCtx);
  });

  it("accepts optional premium and midPx", () => {
    const full = { ...validAssetCtx, premium: "0.001", midPx: "42050", impactPxs: ["42040", "42060"] };
    const result = AssetCtxSchema.parse(full);
    expect(result.premium).toBe("0.001");
    expect(result.impactPxs).toEqual(["42040", "42060"]);
  });

  it("rejects non-string funding", () => {
    expect(() => AssetCtxSchema.parse({ ...validAssetCtx, funding: 0.00005 })).toThrow();
  });
});

describe("MetaAndAssetCtxsSchema", () => {
  it("parses valid tuple", () => {
    const result = MetaAndAssetCtxsSchema.parse([validMeta, [validAssetCtx]]);
    expect(result[0].universe).toHaveLength(1);
    expect(result[1]).toHaveLength(1);
  });

  it("rejects non-tuple", () => {
    expect(() => MetaAndAssetCtxsSchema.parse({ meta: validMeta })).toThrow();
  });
});

// ── L2 Book ───────────────────────────────────────────────────────────

describe("L2LevelSchema", () => {
  it("parses valid level", () => {
    expect(L2LevelSchema.parse(validL2Level)).toEqual(validL2Level);
  });

  it("rejects missing n", () => {
    expect(() => L2LevelSchema.parse({ px: "100", sz: "1" })).toThrow();
  });
});

describe("L2BookSchema", () => {
  it("parses valid book with bids and asks", () => {
    const result = L2BookSchema.parse(validL2Book);
    expect(result.coin).toBe("BTC");
    expect(result.levels[0]).toHaveLength(1);
    expect(result.levels[1]).toHaveLength(1);
  });

  it("parses empty book", () => {
    const empty = { coin: "BTC", time: 1234, levels: [[], []] };
    const result = L2BookSchema.parse(empty);
    expect(result.levels[0]).toHaveLength(0);
    expect(result.levels[1]).toHaveLength(0);
  });

  it("rejects wrong levels structure", () => {
    expect(() => L2BookSchema.parse({ coin: "BTC", time: 1234, levels: [[]] })).toThrow();
  });
});

// ── Perp Dexs ─────────────────────────────────────────────────────────

describe("PerpDexSchema", () => {
  it("parses valid dex", () => {
    expect(PerpDexSchema.parse(validPerpDex)).toEqual(validPerpDex);
  });

  it("accepts optional fields", () => {
    const full = { ...validPerpDex, fullName: "XYZ Markets", oracleUpdater: null, feeRecipient: "0xfee" };
    expect(PerpDexSchema.parse(full).fullName).toBe("XYZ Markets");
  });
});

// ── Spot Meta ─────────────────────────────────────────────────────────

describe("SpotTokenSchema", () => {
  it("parses valid token", () => {
    expect(SpotTokenSchema.parse(validSpotToken)).toEqual(validSpotToken);
  });

  it("accepts nullable fullName", () => {
    const result = SpotTokenSchema.parse({ ...validSpotToken, fullName: null });
    expect(result.fullName).toBeNull();
  });
});

describe("SpotMetaSchema", () => {
  it("parses valid spot meta", () => {
    const result = SpotMetaSchema.parse(validSpotMeta);
    expect(result.tokens).toHaveLength(1);
    expect(result.universe).toHaveLength(1);
  });
});

// ── Clearinghouse State ───────────────────────────────────────────────

describe("AssetPositionSchema", () => {
  it("parses valid position", () => {
    const result = AssetPositionSchema.parse(validAssetPosition);
    expect(result.position.coin).toBe("BTC");
    expect(result.position.leverage).toEqual({ type: "cross", value: "10" });
  });

  it("accepts null leverage", () => {
    const pos = {
      ...validAssetPosition,
      position: { ...validAssetPosition.position, leverage: null },
    };
    expect(AssetPositionSchema.parse(pos).position.leverage).toBeNull();
  });

  it("accepts null liquidationPx", () => {
    const pos = {
      ...validAssetPosition,
      position: { ...validAssetPosition.position, liquidationPx: null },
    };
    expect(AssetPositionSchema.parse(pos).position.liquidationPx).toBeNull();
  });
});

describe("ClearinghouseStateSchema", () => {
  it("parses valid state", () => {
    const result = ClearinghouseStateSchema.parse(validClearinghouseState);
    expect(result.assetPositions).toHaveLength(1);
    expect(result.crossMaintenanceMarginUsed).toBe("3000");
  });

  it("accepts optional withdrawable", () => {
    const state = { ...validClearinghouseState, withdrawable: "50000" };
    expect(ClearinghouseStateSchema.parse(state).withdrawable).toBe("50000");
  });

  it("rejects missing marginSummary", () => {
    expect(() => ClearinghouseStateSchema.parse({
      crossMarginSummary: validMarginSummary,
      assetPositions: [],
      crossMaintenanceMarginUsed: "0",
    })).toThrow();
  });
});

// ── Spot Clearinghouse ────────────────────────────────────────────────

describe("SpotBalanceSchema", () => {
  it("parses valid balance", () => {
    expect(SpotBalanceSchema.parse(validSpotBalance)).toEqual(validSpotBalance);
  });
});

describe("SpotClearinghouseStateSchema", () => {
  it("parses valid state", () => {
    const result = SpotClearinghouseStateSchema.parse({ balances: [validSpotBalance] });
    expect(result.balances).toHaveLength(1);
  });

  it("parses empty balances", () => {
    expect(SpotClearinghouseStateSchema.parse({ balances: [] }).balances).toHaveLength(0);
  });
});

// ── Orders ────────────────────────────────────────────────────────────

describe("OpenOrderSchema", () => {
  it("parses valid order", () => {
    expect(OpenOrderSchema.parse(validOpenOrder).oid).toBe(12345);
  });

  it("accepts optional cloid", () => {
    const result = OpenOrderSchema.parse({ ...validOpenOrder, cloid: "abc-123" });
    expect(result.cloid).toBe("abc-123");
  });
});

describe("FrontendOpenOrderSchema", () => {
  it("parses valid frontend order", () => {
    const result = FrontendOpenOrderSchema.parse(validFrontendOpenOrder);
    expect(result.side).toBe("B");
    expect(result.isTrigger).toBe(false);
  });

  it("rejects invalid side", () => {
    expect(() => FrontendOpenOrderSchema.parse({ ...validFrontendOpenOrder, side: "X" })).toThrow();
  });
});

describe("HistoricalOrderSchema", () => {
  it("parses valid historical order", () => {
    const result = HistoricalOrderSchema.parse({
      order: validFrontendOpenOrder,
      status: "filled",
      statusTimestamp: 1700000000000,
    });
    expect(result.status).toBe("filled");
  });
});

// ── Fills ─────────────────────────────────────────────────────────────

describe("FillSchema", () => {
  it("parses valid fill", () => {
    const result = FillSchema.parse(validFill);
    expect(result.coin).toBe("BTC");
    expect(result.crossed).toBe(true);
  });

  it("accepts optional liquidation", () => {
    const result = FillSchema.parse({ ...validFill, liquidation: true });
    expect(result.liquidation).toBe(true);
  });
});

// ── Funding ───────────────────────────────────────────────────────────

describe("FundingRecordSchema", () => {
  it("parses valid funding record", () => {
    expect(FundingRecordSchema.parse(validFundingRecord).fundingRate).toBe("0.00005");
  });
});

describe("UserFundingEntrySchema", () => {
  it("parses valid entry", () => {
    const result = UserFundingEntrySchema.parse(validUserFundingEntry);
    expect(result.delta.type).toBe("funding");
    expect(result.delta.nSamples).toBe(12);
  });

  it("accepts null nSamples", () => {
    const entry = {
      ...validUserFundingEntry,
      delta: { ...validUserFundingEntry.delta, nSamples: null },
    };
    expect(UserFundingEntrySchema.parse(entry).delta.nSamples).toBeNull();
  });
});

// ── Candles ───────────────────────────────────────────────────────────

describe("CandleSchema", () => {
  it("parses valid candle", () => {
    const result = CandleSchema.parse(validCandle);
    expect(result.s).toBe("BTC");
    expect(result.n).toBe(50);
  });

  it("rejects missing fields", () => {
    expect(() => CandleSchema.parse({ t: 1234, s: "BTC" })).toThrow();
  });
});

// ── Order Status ──────────────────────────────────────────────────────

describe("OrderStatusSchema", () => {
  it("parses filled status", () => {
    const status = { filled: { totalSz: "1.0", avgPx: "42000", oid: 1 } };
    expect(OrderStatusSchema.parse(status)).toEqual(status);
  });

  it("parses resting status", () => {
    const status = { resting: { oid: 1 } };
    expect(OrderStatusSchema.parse(status)).toEqual(status);
  });

  it("parses resting with cloid", () => {
    const status = { resting: { oid: 1, cloid: "abc" } };
    expect(OrderStatusSchema.parse(status)).toEqual(status);
  });

  it("parses error status", () => {
    const status = { error: "Insufficient margin" };
    expect(OrderStatusSchema.parse(status)).toEqual(status);
  });

  it("parses waitingForFill literal", () => {
    expect(OrderStatusSchema.parse("waitingForFill")).toBe("waitingForFill");
  });

  it("parses waitingForTrigger literal", () => {
    expect(OrderStatusSchema.parse("waitingForTrigger")).toBe("waitingForTrigger");
  });

  it("rejects unknown status string", () => {
    expect(() => OrderStatusSchema.parse("cancelled")).toThrow();
  });
});

describe("OrderResultSchema", () => {
  it("parses result with mixed statuses", () => {
    const result = OrderResultSchema.parse({
      statuses: [
        { filled: { totalSz: "1.0", avgPx: "42000", oid: 1 } },
        { error: "Insufficient margin" },
        "waitingForFill",
      ],
    });
    expect(result.statuses).toHaveLength(3);
  });
});

// ── Referral ──────────────────────────────────────────────────────────

describe("ReferralResponseSchema", () => {
  it("parses response with ready referrer state", () => {
    const response = {
      referredBy: { referrer: "0xabc123", code: "MYCODE" },
      cumVlm: "1000000",
      unclaimedRewards: "50",
      claimedRewards: "100",
      builderRewards: "25",
      referrerState: {
        stage: "ready" as const,
        data: { code: "MYCODE", nReferrals: 5, referralStates: [] },
      },
      rewardHistory: [{ earned: "10", vlm: "100000", referralVlm: "50000", time: 1700000000 }],
    };
    const result = ReferralResponseSchema.parse(response);
    expect(result.referrerState.stage).toBe("ready");
  });

  it("parses response with needToCreateCode state", () => {
    const response = {
      referredBy: null,
      cumVlm: "0",
      unclaimedRewards: "0",
      claimedRewards: "0",
      builderRewards: "0",
      referrerState: { stage: "needToCreateCode" as const },
      rewardHistory: [],
    };
    expect(ReferralResponseSchema.parse(response).referredBy).toBeNull();
  });

  it("parses response with needToTrade state", () => {
    const response = {
      referredBy: null,
      cumVlm: "500",
      unclaimedRewards: "0",
      claimedRewards: "0",
      builderRewards: "0",
      referrerState: { stage: "needToTrade" as const, data: { required: "10000" } },
      rewardHistory: [],
    };
    expect(ReferralResponseSchema.parse(response).referrerState.stage).toBe("needToTrade");
  });
});

// ── Subscription Events ───────────────────────────────────────────────

describe("L2BookUpdateSchema", () => {
  it("parses valid update", () => {
    const result = L2BookUpdateSchema.parse({
      coin: "BTC",
      time: 1700000000000,
      levels: [[validL2Level], []],
    });
    expect(result.coin).toBe("BTC");
  });
});

describe("AllMidsUpdateSchema", () => {
  it("parses valid mids update", () => {
    const result = AllMidsUpdateSchema.parse({ mids: { BTC: "42000", ETH: "3200" } });
    expect(result.mids.BTC).toBe("42000");
  });

  it("parses empty mids", () => {
    expect(AllMidsUpdateSchema.parse({ mids: {} }).mids).toEqual({});
  });
});

describe("TradeSchema", () => {
  it("parses valid trade", () => {
    expect(TradeSchema.parse(validTrade).coin).toBe("BTC");
  });
});

describe("UserEventSchema", () => {
  it("parses event with fills", () => {
    const event = { fills: [validFill] };
    const result = UserEventSchema.parse(event);
    expect(result.fills).toHaveLength(1);
  });

  it("parses event with funding", () => {
    const event = {
      funding: {
        coin: "BTC",
        fundingRate: "0.00005",
        szi: "1.0",
        usdc: "-0.5",
        time: 1700000000000,
        hash: "0xabc",
        nSamples: 12,
      },
    };
    expect(UserEventSchema.parse(event).funding?.coin).toBe("BTC");
  });

  it("parses empty event", () => {
    expect(UserEventSchema.parse({})).toEqual({});
  });
});
