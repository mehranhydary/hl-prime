/**
 * Zod schemas for runtime validation of all @nktkas/hyperliquid responses.
 * Applied at the provider boundary to catch upstream API changes early.
 */
import { z } from "zod";

// --- Primitives ---

/** Numeric string (prices, sizes, rates). Allows empty string for some HL responses. */
const numericStr = z.string();

/** 0x-prefixed hex address. */
const hexAddress = z.string().regex(/^0x[0-9a-fA-F]+$/);

// --- Meta ---

export const MetaAssetSchema = z.object({
  name: z.string(),
  szDecimals: z.number(),
  maxLeverage: z.number(),
  onlyIsolated: z.boolean().optional(),
  marginMode: z.string().optional(),
  isDelisted: z.boolean().optional(),
});

export const MetaSchema = z.object({
  universe: z.array(MetaAssetSchema),
  collateralToken: z.number(),
});

// --- Asset Context ---

export const AssetCtxSchema = z.object({
  funding: numericStr,
  openInterest: numericStr,
  prevDayPx: numericStr,
  dayNtlVlm: numericStr,
  premium: numericStr.optional(),
  oraclePx: numericStr,
  markPx: numericStr,
  midPx: numericStr.optional(),
  impactPxs: z.tuple([numericStr, numericStr]).optional(),
});

export const MetaAndAssetCtxsSchema = z.tuple([
  MetaSchema,
  z.array(AssetCtxSchema),
]);

// --- L2 Book ---

export const L2LevelSchema = z.object({
  px: numericStr,
  sz: numericStr,
  n: z.number(),
});

export const L2BookSchema = z.object({
  coin: z.string(),
  time: z.number(),
  levels: z.tuple([z.array(L2LevelSchema), z.array(L2LevelSchema)]),
});

// --- Perp Dexs ---

export const PerpDexSchema = z.object({
  name: z.string(),
  deployer: z.string(),
  fullName: z.string().optional(),
  oracleUpdater: z.string().nullable().optional(),
  feeRecipient: z.string().nullable().optional(),
});

// --- Spot Meta ---

export const SpotTokenSchema = z.object({
  name: z.string(),
  index: z.number(),
  szDecimals: z.number(),
  weiDecimals: z.number(),
  tokenId: z.string(),
  isCanonical: z.boolean(),
  fullName: z.string().nullable().optional(),
});

export const SpotMetaSchema = z.object({
  tokens: z.array(SpotTokenSchema),
  universe: z.array(z.object({
    name: z.string(),
    tokens: z.array(z.number()),
    index: z.number(),
    isCanonical: z.boolean(),
  })),
});

// --- Clearinghouse State ---

const MarginSummarySchema = z.object({
  accountValue: numericStr,
  totalNtlPos: numericStr,
  totalRawUsd: numericStr,
  totalMarginUsed: numericStr,
});

const LeverageSchema = z.object({
  type: z.string(),
  value: z.string(),
}).nullable();

const CumFundingSchema = z.object({
  allTime: numericStr,
  sinceChange: numericStr,
  sinceOpen: numericStr,
});

export const AssetPositionSchema = z.object({
  position: z.object({
    coin: z.string(),
    szi: numericStr,
    entryPx: numericStr,
    positionValue: numericStr,
    unrealizedPnl: numericStr,
    returnOnEquity: numericStr,
    leverage: LeverageSchema,
    liquidationPx: numericStr.nullable(),
    marginUsed: numericStr,
    maxLeverage: z.number(),
    cumFunding: CumFundingSchema,
    markPx: numericStr.optional(),
  }),
  type: z.string(),
});

export const ClearinghouseStateSchema = z.object({
  marginSummary: MarginSummarySchema,
  crossMarginSummary: MarginSummarySchema,
  assetPositions: z.array(AssetPositionSchema),
  crossMaintenanceMarginUsed: numericStr,
  withdrawable: numericStr.optional(),
});

// --- Spot Clearinghouse State ---

export const SpotBalanceSchema = z.object({
  coin: z.string(),
  hold: numericStr,
  total: numericStr,
  entryNtl: numericStr,
  token: z.number(),
});

export const SpotClearinghouseStateSchema = z.object({
  balances: z.array(SpotBalanceSchema),
});

// --- Orders ---

export const OpenOrderSchema = z.object({
  coin: z.string(),
  limitPx: numericStr,
  oid: z.number(),
  side: z.string(),
  sz: numericStr,
  timestamp: z.number(),
  cloid: z.string().optional(),
});

export const FrontendOpenOrderSchema = z.object({
  coin: z.string(),
  side: z.enum(["B", "A"]),
  limitPx: numericStr,
  sz: numericStr,
  oid: z.number(),
  timestamp: z.number(),
  origSz: numericStr,
  triggerCondition: z.string(),
  isTrigger: z.boolean(),
  triggerPx: numericStr,
  children: z.array(z.unknown()),
  isPositionTpsl: z.boolean(),
  reduceOnly: z.boolean(),
  orderType: z.string(),
  tif: z.string().nullable(),
  cloid: z.string().nullable().optional(),
});

export const HistoricalOrderSchema = z.object({
  order: FrontendOpenOrderSchema,
  status: z.string(),
  statusTimestamp: z.number(),
});

// --- Fills ---

export const FillSchema = z.object({
  coin: z.string(),
  px: numericStr,
  sz: numericStr,
  side: z.string(),
  time: z.number(),
  startPosition: numericStr,
  dir: z.string(),
  closedPnl: numericStr,
  hash: z.string(),
  oid: z.number(),
  crossed: z.boolean(),
  fee: numericStr,
  feeToken: z.string(),
  tid: z.number(),
  liquidation: z.boolean().optional(),
});

// --- Funding ---

export const FundingRecordSchema = z.object({
  coin: z.string(),
  fundingRate: numericStr,
  premium: numericStr,
  time: z.number(),
});

export const UserFundingEntrySchema = z.object({
  time: z.number(),
  hash: hexAddress,
  delta: z.object({
    type: z.literal("funding"),
    coin: z.string(),
    usdc: numericStr,
    szi: numericStr,
    fundingRate: numericStr,
    nSamples: z.number().nullable(),
  }),
});

// --- Candles ---

export const CandleSchema = z.object({
  t: z.number(),
  T: z.number(),
  s: z.string(),
  i: z.string(),
  o: numericStr,
  c: numericStr,
  h: numericStr,
  l: numericStr,
  v: numericStr,
  n: z.number(),
});

// --- Order Status (exchange response) ---

const OrderStatusFilledSchema = z.object({
  filled: z.object({
    totalSz: numericStr,
    avgPx: numericStr,
    oid: z.number(),
  }),
});

const OrderStatusRestingSchema = z.object({
  resting: z.object({
    oid: z.number(),
    cloid: z.string().optional(),
  }),
});

const OrderStatusErrorSchema = z.object({
  error: z.string(),
});

export const OrderStatusSchema = z.union([
  OrderStatusFilledSchema,
  OrderStatusRestingSchema,
  OrderStatusErrorSchema,
  z.literal("waitingForFill"),
  z.literal("waitingForTrigger"),
]);

export const OrderResultSchema = z.object({
  statuses: z.array(OrderStatusSchema),
});

// --- Referral ---

const ReferralUserStateSchema = z.object({
  user: hexAddress,
  cumVlm: numericStr,
  cumRewardedFeesSinceReferred: numericStr,
  cumFeesRewardedToReferrer: numericStr,
  timeJoined: z.number(),
});

const ReferrerStateReadySchema = z.object({
  stage: z.literal("ready"),
  data: z.object({
    code: z.string(),
    nReferrals: z.number(),
    referralStates: z.array(ReferralUserStateSchema),
  }),
});

const ReferrerStateNeedCodeSchema = z.object({
  stage: z.literal("needToCreateCode"),
});

const ReferrerStateNeedTradeSchema = z.object({
  stage: z.literal("needToTrade"),
  data: z.object({ required: numericStr }),
});

export const ReferralResponseSchema = z.object({
  referredBy: z.object({ referrer: hexAddress, code: z.string() }).nullable(),
  cumVlm: numericStr,
  unclaimedRewards: numericStr,
  claimedRewards: numericStr,
  builderRewards: numericStr,
  referrerState: z.union([
    ReferrerStateReadySchema,
    ReferrerStateNeedCodeSchema,
    ReferrerStateNeedTradeSchema,
  ]),
  rewardHistory: z.array(z.object({
    earned: numericStr,
    vlm: numericStr,
    referralVlm: numericStr,
    time: z.number(),
  })),
});

// --- Subscription events ---

export const L2BookUpdateSchema = z.object({
  coin: z.string(),
  time: z.number(),
  levels: z.tuple([z.array(L2LevelSchema), z.array(L2LevelSchema)]),
});

export const AllMidsUpdateSchema = z.object({
  mids: z.record(z.string(), numericStr),
});

export const TradeSchema = z.object({
  coin: z.string(),
  side: z.string(),
  px: numericStr,
  sz: numericStr,
  time: z.number(),
  hash: z.string(),
  tid: z.number(),
});

export const UserEventSchema = z.object({
  fills: z.array(FillSchema).optional(),
  funding: z.object({
    coin: z.string(),
    fundingRate: numericStr,
    szi: numericStr,
    usdc: numericStr,
    time: z.number(),
    hash: z.string(),
    nSamples: z.number(),
  }).optional(),
  liquidation: z.unknown().optional(),
});
