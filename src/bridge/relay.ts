import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import {
  RELAY_BASE_URL,
  RELAY_CHAINS_PATH,
  RELAY_DEFAULT_CHAINS_TTL_MS,
  RELAY_DEFAULT_SLIPPAGE_BPS,
  RELAY_DEFAULT_STATUS_POLL_INTERVAL_MS,
  RELAY_DEFAULT_STATUS_POLL_TIMEOUT_MS,
  RELAY_FALLBACK_USDC_BY_CHAIN_ID,
  RELAY_HYPERLIQUID_CHAIN_ID,
  RELAY_HYPERLIQUID_USDC_ADDRESS,
  RELAY_PREFERRED_ORIGIN_CHAIN_ORDER,
  RELAY_QUOTE_FALLBACK_PATH,
  RELAY_QUOTE_PATH,
  RELAY_STATUS_FALLBACK_PATH,
  RELAY_STATUS_PATH,
  RELAY_SUPPORTED_USDC_SYMBOLS,
} from "./constants.js";
import type {
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeStatus,
  BridgeStatusResult,
  BridgeStep,
  RelayBridgeConfig,
  RelayChain,
  RelayChainCurrency,
  RelayQuoteResponse,
  RelayStatusResponse,
  SupportedChain,
} from "./types.js";

export class RelayBridgeError extends Error {
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(message: string, options?: { statusCode?: number; details?: unknown }) {
    super(message);
    this.name = "RelayBridgeError";
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
}

interface CachedChainsEntry {
  expiresAt: number;
  value: SupportedChain[];
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeAddress(value: string, fieldName: string): `0x${string}` {
  if (!isAddress(value)) {
    throw new RelayBridgeError(`Invalid ${fieldName}. Expected an EVM address.`);
  }
  return getAddress(value);
}

function normalizeSymbol(symbol: string | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

function supportsEvmSigning(chain: RelayChain): boolean {
  if (!chain.vmType) return true;
  return chain.vmType.trim().toLowerCase() === "evm";
}

function toAbsoluteUrl(baseUrl: string, endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }
  return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function requestIdFromEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    const url = endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? new URL(endpoint)
      : new URL(`https://relay.invalid${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`);
    const requestId = url.searchParams.get("requestId");
    return requestId ?? undefined;
  } catch {
    return undefined;
  }
}

function formatRawAmount(value: string | undefined, decimals: number): string {
  if (!value) return "0";
  try {
    return formatUnits(BigInt(value), decimals);
  } catch {
    return value;
  }
}

function maybeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function rawToStatus(rawStatus: string | undefined): BridgeStatus {
  switch ((rawStatus ?? "").trim().toLowerCase()) {
    case "success":
      return "success";
    case "failure":
      return "failure";
    case "refund":
    case "refunded":
      return "refund";
    case "submitted":
    case "delayed":
      return "depositing";
    case "waiting":
      return "waiting";
    case "pending":
    default:
      return "pending";
  }
}

function isTerminalStatus(status: BridgeStatus): boolean {
  return status === "success" || status === "failure" || status === "refund";
}

function sortSupportedChains(chains: SupportedChain[]): SupportedChain[] {
  const rank = new Map<number, number>(
    RELAY_PREFERRED_ORIGIN_CHAIN_ORDER.map((chainId, index) => [chainId, index]),
  );
  return [...chains].sort((a, b) => {
    const aRank = rank.get(a.chainId) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.chainId) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.displayName.localeCompare(b.displayName);
  });
}

function chooseUsdcCurrency(chain: RelayChain): RelayChainCurrency | null {
  const currencies = Array.isArray(chain.erc20Currencies) ? chain.erc20Currencies : [];
  if (currencies.length === 0) return null;

  const expectedAddress = chain.id !== undefined ? RELAY_FALLBACK_USDC_BY_CHAIN_ID[chain.id] : undefined;
  if (expectedAddress) {
    const exact = currencies.find((currency) =>
      typeof currency.address === "string"
      && currency.address.toLowerCase() === expectedAddress.toLowerCase(),
    );
    if (exact) return exact;
  }

  const bySymbol = currencies.filter((currency) =>
    RELAY_SUPPORTED_USDC_SYMBOLS.has(normalizeSymbol(currency.symbol)),
  );
  if (bySymbol.length > 0) {
    return bySymbol[0] ?? null;
  }

  return null;
}

function normalizeChain(chain: RelayChain): SupportedChain | null {
  const chainId = maybeNumber(chain.id);
  if (!chainId || chainId === RELAY_HYPERLIQUID_CHAIN_ID) return null;
  if (chain.disabled || chain.depositEnabled === false || !supportsEvmSigning(chain)) {
    return null;
  }

  const usdc = chooseUsdcCurrency(chain);
  if (!usdc?.address) return null;

  return {
    chainId,
    name: (chain.name ?? `Chain ${chainId}`).trim(),
    displayName: (chain.displayName ?? chain.name ?? `Chain ${chainId}`).trim(),
    usdcAddress: usdc.address,
    usdcDecimals: maybeNumber(usdc.decimals) ?? 6,
    supportsPermit: Boolean(usdc.supportsPermit),
    rpcUrl: chain.httpRpcUrl,
    iconUrl: chain.iconUrl,
    logoUrl: chain.logoUrl ?? usdc.metadata?.logoURI,
    explorerUrl: chain.explorerUrl,
  };
}

function extractRequestId(response: RelayQuoteResponse): string {
  for (const step of response.steps ?? []) {
    if (step.requestId) return step.requestId;
    for (const item of step.items ?? []) {
      const requestId = requestIdFromEndpoint(item.check?.endpoint);
      if (requestId) return requestId;
    }
  }

  throw new RelayBridgeError("Relay quote response did not include a requestId.");
}

function normalizeSteps(baseUrl: string, response: RelayQuoteResponse): BridgeStep[] {
  const steps: BridgeStep[] = [];

  for (const step of response.steps ?? []) {
    for (const item of step.items ?? []) {
      if (!item.data?.to || typeof item.data.data !== "string") continue;
      steps.push({
        id: step.id ?? "deposit",
        chainId: maybeNumber(item.data.chainId) ?? 0,
        to: item.data.to,
        data: item.data.data,
        value: item.data.value ?? "0",
        requestId: step.requestId ?? requestIdFromEndpoint(item.check?.endpoint),
        checkEndpoint: toAbsoluteUrl(baseUrl, item.check?.endpoint),
        gas: item.data.gas !== undefined ? String(item.data.gas) : undefined,
        maxFeePerGas: item.data.maxFeePerGas,
        maxPriorityFeePerGas: item.data.maxPriorityFeePerGas,
      });
    }
  }

  return steps;
}

function computeTotalFeeUsd(response: RelayQuoteResponse): string {
  const inputUsd = response.details?.currencyIn?.amountUsd;
  const outputUsd = response.details?.currencyOut?.amountUsd;
  if (inputUsd && outputUsd) {
    const delta = Number(inputUsd) - Number(outputUsd);
    if (Number.isFinite(delta) && delta >= 0) {
      return delta.toFixed(6).replace(/\.?0+$/, "");
    }
  }

  const inputAmount = response.details?.currencyIn?.amount;
  const outputAmount = response.details?.currencyOut?.amount;
  const inputDecimals = maybeNumber(response.details?.currencyIn?.currency?.decimals) ?? 6;
  const outputDecimals = maybeNumber(response.details?.currencyOut?.currency?.decimals) ?? 6;
  if (inputAmount && outputAmount && inputDecimals === outputDecimals) {
    try {
      const delta = BigInt(inputAmount) - BigInt(outputAmount);
      if (delta >= 0n) {
        return formatUnits(delta, inputDecimals);
      }
    } catch {
      // Fall back to zero below.
    }
  }

  return "0";
}

function extractOutputAmount(response: RelayQuoteResponse): { formatted: string; raw: string; decimals: number } {
  const raw = response.details?.currencyOut?.amount ?? "0";
  const decimals = maybeNumber(response.details?.currencyOut?.currency?.decimals) ?? 6;
  const formatted = response.details?.currencyOut?.amountFormatted ?? formatRawAmount(raw, decimals);
  return { formatted, raw, decimals };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class RelayBridge {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly appFees;
  private readonly chainsTtlMs: number;
  private readonly destinationChainId: number;
  private readonly destinationCurrency: string;
  private readonly fetchFn: typeof fetch;
  private readonly quotePath: string;
  private readonly statusPath: string;

  private chainsCache: CachedChainsEntry | null = null;

  constructor(config: RelayBridgeConfig = {}) {
    if (typeof fetch !== "function" && !config.fetchFn) {
      throw new RelayBridgeError("Global fetch is unavailable. Provide fetchFn explicitly.");
    }

    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? RELAY_BASE_URL);
    this.apiKey = config.apiKey ?? null;
    this.appFees = config.appFees ?? [];
    this.chainsTtlMs = config.chainsTtlMs ?? RELAY_DEFAULT_CHAINS_TTL_MS;
    this.destinationChainId = config.destinationChainId ?? RELAY_HYPERLIQUID_CHAIN_ID;
    this.destinationCurrency = config.destinationCurrency ?? RELAY_HYPERLIQUID_USDC_ADDRESS;
    this.fetchFn = config.fetchFn ?? fetch;
    this.quotePath = config.quotePath ?? RELAY_QUOTE_PATH;
    this.statusPath = config.statusPath ?? RELAY_STATUS_PATH;
  }

  async getSupportedChains(): Promise<SupportedChain[]> {
    const now = Date.now();
    if (this.chainsCache && this.chainsCache.expiresAt > now) {
      return this.chainsCache.value;
    }

    const payload = await this.requestJson<RelayChain[] | { chains?: RelayChain[] }>(
      "GET",
      [RELAY_CHAINS_PATH],
    );
    const rawChains = Array.isArray(payload) ? payload : Array.isArray(payload.chains) ? payload.chains : [];
    const normalized = sortSupportedChains(
      rawChains
        .map((chain) => normalizeChain(chain))
        .filter((chain): chain is SupportedChain => chain !== null),
    );

    this.chainsCache = {
      value: normalized,
      expiresAt: now + this.chainsTtlMs,
    };

    return normalized;
  }

  async quote(params: BridgeQuoteRequest): Promise<BridgeQuote> {
    const userAddress = normalizeAddress(params.userAddress, "userAddress");
    const destinationAddress = normalizeAddress(params.destinationAddress ?? params.userAddress, "destinationAddress");
    const supportedChains = await this.getSupportedChains();
    const originChain = supportedChains.find((chain) => chain.chainId === params.originChainId);
    if (!originChain) {
      throw new RelayBridgeError(`Origin chain ${params.originChainId} is not currently supported for USDC bridging.`);
    }

    let rawAmount: string;
    try {
      rawAmount = parseUnits(params.amount, originChain.usdcDecimals).toString();
    } catch (err) {
      throw new RelayBridgeError(
        `Invalid amount '${params.amount}'. Expected a positive decimal string with up to ${originChain.usdcDecimals} decimals.`,
        { details: err },
      );
    }

    if (BigInt(rawAmount) <= 0n) {
      throw new RelayBridgeError("Bridge amount must be greater than zero.");
    }

    const response = await this.requestJson<RelayQuoteResponse>(
      "POST",
      [this.quotePath, RELAY_QUOTE_FALLBACK_PATH],
      {
        user: userAddress,
        recipient: destinationAddress,
        refundTo: userAddress,
        originChainId: originChain.chainId,
        destinationChainId: this.destinationChainId,
        toChainId: this.destinationChainId,
        originCurrency: originChain.usdcAddress,
        destinationCurrency: this.destinationCurrency,
        amount: rawAmount,
        tradeType: "EXACT_INPUT",
        slippageTolerance: String(params.slippageTolerance ?? RELAY_DEFAULT_SLIPPAGE_BPS),
        ...(this.appFees.length > 0 ? { appFees: this.appFees } : {}),
      },
    );

    const requestId = extractRequestId(response);
    const output = extractOutputAmount(response);

    return {
      requestId,
      steps: normalizeSteps(this.baseUrl, response),
      fees: {
        gas: formatRawAmount(response.fees?.gas, originChain.usdcDecimals),
        relayer: formatRawAmount(response.fees?.relayer, originChain.usdcDecimals),
        totalUsd: computeTotalFeeUsd(response),
        app: formatRawAmount(response.fees?.app, originChain.usdcDecimals),
      },
      outputAmount: output.formatted,
      outputAmountRaw: output.raw,
      originChainId: originChain.chainId,
      originCurrency: originChain.usdcAddress,
      destinationChainId: this.destinationChainId,
      destinationCurrency: this.destinationCurrency,
      timeEstimateSec: maybeNumber(response.breakdown?.timeEstimate) ?? 0,
    };
  }

  async getStatus(requestId: string): Promise<BridgeStatusResult> {
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      throw new RelayBridgeError("Missing requestId.");
    }

    const response = await this.requestJson<RelayStatusResponse>(
      "GET",
      [this.statusPath, RELAY_STATUS_FALLBACK_PATH],
      undefined,
      { requestId: normalizedRequestId },
    );

    const rawStatus = response.status ?? "pending";
    const status = rawToStatus(rawStatus);

    return {
      requestId: response.requestId ?? normalizedRequestId,
      status,
      rawStatus,
      isTerminal: isTerminalStatus(status),
      originChainId: maybeNumber(response.originChainId),
      destinationChainId: maybeNumber(response.destinationChainId),
      txHashes: Array.isArray(response.txHashes) ? response.txHashes : [],
      details: response.details,
      updatedAt: maybeNumber(response.updatedAt),
    };
  }

  async pollStatus(
    requestId: string,
    options?: {
      intervalMs?: number;
      timeoutMs?: number;
    },
  ): Promise<BridgeStatusResult> {
    const intervalMs = options?.intervalMs ?? RELAY_DEFAULT_STATUS_POLL_INTERVAL_MS;
    const timeoutMs = options?.timeoutMs ?? RELAY_DEFAULT_STATUS_POLL_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let latest = await this.getStatus(requestId);

    while (!latest.isTerminal && Date.now() < deadline) {
      await sleep(intervalMs);
      latest = await this.getStatus(requestId);
    }

    if (!latest.isTerminal) {
      throw new RelayBridgeError(
        `Timed out waiting for Relay request ${requestId} to complete.`,
        { details: latest },
      );
    }

    return latest;
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    paths: string[],
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    let lastError: unknown;

    for (const path of paths) {
      try {
        return await this.requestSinglePath<T>(method, path, body, query);
      } catch (err) {
        lastError = err;
        if (!(err instanceof RelayBridgeError) || (err.statusCode !== 404 && err.statusCode !== 405)) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new RelayBridgeError("Relay request failed.");
  }

  private async requestSinglePath<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchFn(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text.trim().length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const message = typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : `Relay request failed with ${response.status}`;
      throw new RelayBridgeError(message, {
        statusCode: response.status,
        details: parsed,
      });
    }

    return parsed as T;
  }
}
