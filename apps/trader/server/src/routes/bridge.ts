import { Router } from "express";
import { RelayBridge, RelayBridgeError } from "hyperliquid-prime";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http } from "viem";
import type { ServerConfig } from "../config.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";
import { BridgeHistoryStore } from "../services/bridge-history-store.js";
import type {
  BridgeBalancesResponse,
  BridgeChainsResponse,
  BridgeChainBalance,
  BridgeHistoryItem,
  BridgeHistoryResponse,
  BridgeHistoryUpsertRequest,
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeStatus,
  BridgeStatusResponse,
} from "../../../shared/types.js";
import { parseLimit, parseNetwork, ValidationError, requireAddress } from "../utils/validation.js";

const HYPERLIQUID_CHAIN_ID = 1337;
const HYPERLIQUID_USDC_ADDRESS = "0x00000000000000000000000000000000";

interface CachedBridgeQuote extends BridgeQuote {
  createdAt: number;
}

const VALID_BRIDGE_STATUSES = new Set<BridgeStatus>([
  "pending",
  "depositing",
  "waiting",
  "success",
  "failure",
  "refund",
]);

const VALID_TRADE_STATUSES = new Set(["not-started", "pending", "success", "failure"] as const);

const bridgeHistoryStores = new Map<string, BridgeHistoryStore>();
function bridgeHistoryStore(config: ServerConfig): BridgeHistoryStore {
  const key = config.dataDir;
  const existing = bridgeHistoryStores.get(key);
  if (existing) return existing;
  const created = new BridgeHistoryStore(config.dataDir);
  bridgeHistoryStores.set(key, created);
  return created;
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? parseInt(value, 10)
      : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a positive integer.`);
  }
  return parsed;
}

function parsePositiveDecimalString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`Invalid ${fieldName}. Expected a decimal string.`);
  }
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a decimal string.`);
  }
  if (Number(normalized) <= 0) {
    throw new ValidationError(`${fieldName} must be greater than zero.`);
  }
  return normalized;
}

function parseOptionalBps(value: unknown, fallback = 50): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? parseInt(value, 10)
      : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new ValidationError("Invalid slippageTolerance. Expected an integer between 1 and 10000.");
  }
  return parsed;
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a non-empty string.`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parseRequiredString(value, fieldName);
}

function parseOptionalDecimalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`Invalid ${fieldName}. Expected a decimal string.`);
  }
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a decimal string.`);
  }
  return normalized;
}

function parseOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? parseInt(value, 10)
      : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a non-negative integer.`);
  }
  return parsed;
}

function parseOptionalTimestamp(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a positive timestamp.`);
  }
  return parsed;
}

function parseBridgeStatus(value: unknown): BridgeStatus {
  const normalized = parseRequiredString(value, "status").toLowerCase() as BridgeStatus;
  if (!VALID_BRIDGE_STATUSES.has(normalized)) {
    throw new ValidationError("Invalid status.");
  }
  return normalized;
}

function parseTradeStatus(value: unknown): BridgeHistoryItem["tradeStatus"] {
  if (value === undefined || value === null || value === "") return "not-started";
  const normalized = parseRequiredString(value, "tradeStatus").toLowerCase() as BridgeHistoryItem["tradeStatus"];
  if (!VALID_TRADE_STATUSES.has(normalized)) {
    throw new ValidationError("Invalid tradeStatus.");
  }
  return normalized;
}

function parseTxHashes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("Invalid txHashes. Expected an array of transaction hashes.");
  }
  return value
    .map((entry) => parseRequiredString(entry, "txHashes"))
    .filter(Boolean);
}

function createBridgeHistoryItem(body: BridgeHistoryUpsertRequest, config: ServerConfig): BridgeHistoryItem {
  return {
    requestId: parseRequiredString(body.requestId, "requestId"),
    createdAt: parseOptionalTimestamp(body.createdAt, "createdAt") ?? Date.now(),
    updatedAt: Date.now(),
    network: parseNetwork(body.network, config.defaultNetwork),
    masterAddress: requireAddress(body.masterAddress, "masterAddress"),
    destinationAddress: requireAddress(body.destinationAddress, "destinationAddress"),
    originChainId: parsePositiveInteger(body.originChainId, "originChainId"),
    originChainName: parseRequiredString(body.originChainName, "originChainName"),
    originCurrency: parseRequiredString(body.originCurrency, "originCurrency"),
    destinationChainId: parsePositiveInteger(body.destinationChainId, "destinationChainId"),
    destinationCurrency: parseRequiredString(body.destinationCurrency, "destinationCurrency"),
    amount: parsePositiveDecimalString(body.amount, "amount"),
    outputAmount: parseOptionalDecimalString(body.outputAmount, "outputAmount"),
    feeUsd: parseOptionalDecimalString(body.feeUsd, "feeUsd"),
    timeEstimateSec: parseOptionalNonNegativeInteger(body.timeEstimateSec, "timeEstimateSec"),
    status: parseBridgeStatus(body.status),
    txHashes: parseTxHashes(body.txHashes),
    tradeStatus: parseTradeStatus(body.tradeStatus),
    error: parseOptionalString(body.error, "error"),
    tradeError: parseOptionalString(body.tradeError, "tradeError"),
  };
}

function relayErrorStatus(error: RelayBridgeError): number {
  if (error.statusCode === 429) return 429;
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return 400;
  }
  return 502;
}

async function readUsdcBalance(params: {
  address: `0x${string}`;
  chain: {
    chainId: number;
    displayName: string;
    usdcAddress: string;
    usdcDecimals: number;
    rpcUrl?: string;
    name: string;
    supportsPermit: boolean;
    iconUrl?: string;
    logoUrl?: string;
    explorerUrl?: string;
  };
}): Promise<BridgeChainBalance | null> {
  const { address, chain } = params;
  if (!chain.rpcUrl) return null;

  const client = createPublicClient({
    transport: http(chain.rpcUrl, {
      timeout: 4_000,
      retryCount: 0,
    }),
  });

  const balanceRaw = await client.readContract({
    address: getAddress(chain.usdcAddress),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  return {
    chainId: chain.chainId,
    name: chain.name,
    displayName: chain.displayName,
    usdcAddress: chain.usdcAddress,
    usdcDecimals: chain.usdcDecimals,
    balance: formatUnits(balanceRaw, chain.usdcDecimals),
    balanceRaw: balanceRaw.toString(),
    supportsPermit: chain.supportsPermit,
    rpcUrl: chain.rpcUrl,
    iconUrl: chain.iconUrl,
    logoUrl: chain.logoUrl,
    explorerUrl: chain.explorerUrl,
  };
}

export function bridgeRoutes(config: ServerConfig): Router {
  const router = Router();
  const bridge = new RelayBridge({
    baseUrl: config.relay.baseUrl,
    apiKey: config.relay.apiKey,
    chainsTtlMs: config.relay.chainsTtlMs,
    appFees: config.relay.appFeeBps > 0 && config.relay.appFeeRecipient
      ? [{
        recipient: config.relay.appFeeRecipient,
        fee: String(config.relay.appFeeBps),
      }]
      : [],
  });
  const runtimeState = getRuntimeStateStore(config);

  router.get("/chains", async (_req, res) => {
    try {
      const chains = await bridge.getSupportedChains();
      const response: BridgeChainsResponse = {
        chains,
        destinationChainId: HYPERLIQUID_CHAIN_ID,
        destinationCurrency: HYPERLIQUID_USDC_ADDRESS,
      };
      res.json(response);
    } catch (err) {
      if (err instanceof RelayBridgeError) {
        res.status(relayErrorStatus(err)).json({
          error: err.message,
          code: "RELAY_UNAVAILABLE",
          details: err.details,
        });
        return;
      }
      console.error("[bridge/chains] Relay lookup failed:", err instanceof Error ? err.message : String(err));
      res.status(502).json({ error: "Bridge chains unavailable.", code: "RELAY_UNAVAILABLE" });
    }
  });

  router.post("/quote", async (req, res) => {
    try {
      const body = req.body as BridgeQuoteRequest;
      const request: BridgeQuoteRequest = {
        userAddress: requireAddress(body.userAddress, "userAddress"),
        originChainId: parsePositiveInteger(body.originChainId, "originChainId"),
        amount: parsePositiveDecimalString(body.amount, "amount"),
        destinationAddress: body.destinationAddress
          ? requireAddress(body.destinationAddress, "destinationAddress")
          : undefined,
        slippageTolerance: parseOptionalBps(body.slippageTolerance, 50),
      };

      const quote = await bridge.quote(request);
      const cached: CachedBridgeQuote = {
        ...quote,
        createdAt: Date.now(),
      };
      runtimeState.putQuote(`bridge:${quote.requestId}`, cached, config.relay.quoteTtlMs);

      const response: BridgeQuote = quote;
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      if (err instanceof RelayBridgeError) {
        res.status(relayErrorStatus(err)).json({
          error: err.message,
          code: "BRIDGE_QUOTE_FAILED",
          details: err.details,
        });
        return;
      }
      console.error("[bridge/quote] Bridge quote failed:", err instanceof Error ? err.message : String(err));
      res.status(502).json({ error: "Bridge quote failed.", code: "BRIDGE_QUOTE_FAILED" });
    }
  });

  router.get("/balances", async (req, res) => {
    try {
      const userAddress = requireAddress(req.query.userAddress, "userAddress");
      const chains = await bridge.getSupportedChains();
      const settled = await Promise.allSettled(
        chains.map((chain) => readUsdcBalance({ address: userAddress, chain })),
      );
      const balances = settled
        .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
        .sort((a, b) => {
          const aRaw = BigInt(a.balanceRaw);
          const bRaw = BigInt(b.balanceRaw);
          if (aRaw === bRaw) return a.displayName.localeCompare(b.displayName);
          return aRaw > bRaw ? -1 : 1;
        });

      const response: BridgeBalancesResponse = {
        balances,
        refreshedAt: Date.now(),
      };
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      if (err instanceof RelayBridgeError) {
        res.status(relayErrorStatus(err)).json({
          error: err.message,
          code: "BRIDGE_BALANCES_FAILED",
          details: err.details,
        });
        return;
      }
      console.error("[bridge/balances] Balance lookup failed:", err instanceof Error ? err.message : String(err));
      res.status(502).json({ error: "Bridge balances unavailable.", code: "BRIDGE_BALANCES_FAILED" });
    }
  });

  router.post("/history", async (req, res) => {
    try {
      const item = createBridgeHistoryItem(req.body as BridgeHistoryUpsertRequest, config);
      await bridgeHistoryStore(config).append(item);
      res.status(202).json({ success: true, item });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      console.error("[bridge/history:post] Bridge history write failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "Bridge history write failed.", code: "BRIDGE_HISTORY_WRITE_FAILED" });
    }
  });

  router.get("/history", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork);
      const limit = parseLimit(req.query.limit, 50, 1, 200);
      const response: BridgeHistoryResponse = {
        items: await bridgeHistoryStore(config).list({
          masterAddress,
          network,
          limit,
        }),
      };
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      console.error("[bridge/history:get] Bridge history lookup failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "Bridge history lookup failed.", code: "BRIDGE_HISTORY_LOOKUP_FAILED" });
    }
  });

  router.get("/status/:requestId", async (req, res) => {
    try {
      const requestId = typeof req.params.requestId === "string" ? req.params.requestId.trim() : "";
      if (!requestId) {
        throw new ValidationError("Missing requestId.");
      }

      const status = await bridge.getStatus(requestId);
      const response: BridgeStatusResponse = status;
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      if (err instanceof RelayBridgeError) {
        res.status(relayErrorStatus(err)).json({
          error: err.message,
          code: "BRIDGE_STATUS_FAILED",
          details: err.details,
        });
        return;
      }
      console.error("[bridge/status] Bridge status lookup failed:", err instanceof Error ? err.message : String(err));
      res.status(502).json({ error: "Bridge status lookup failed.", code: "BRIDGE_STATUS_FAILED" });
    }
  });

  return router;
}
