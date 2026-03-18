import type {
  AgentInitRequest,
  AgentInitResponse,
  AgentCompleteRequest,
  AgentCompleteResponse,
  AgentStatusResponse,
  BootstrapResponse,
  PortfolioResponse,
  QuoteRequest,
  QuoteResponse,
  ExecuteRequest,
  ExecutePreviewRequest,
  ExecutePreviewResponse,
  QuickTradeRequest,
  ClosePositionRequest,
  TradeResult,
  TradeHistoryResponse,
  SwapQuoteRequest,
  SwapQuoteResponse,
  SwapExecuteRequest,
  SwapResult,
  BridgeBalancesResponse,
  BridgeChainsResponse,
  BridgeHistoryItem,
  BridgeHistoryResponse,
  BridgeHistoryUpsertRequest,
  BridgeQuoteRequest,
  BridgeQuote,
  BridgeStatusResponse,
  HealthResponse,
  CandleData,
  CandleInterval,
  ReferralDataResponse,
  EarnResponse,
} from "@shared/types";

import {
  clearAuthSession,
  getAuthHeaders,
  hasActiveSession,
  markAuthRequired,
  signIn,
} from "./auth.js";
import { clearAccessToken, getAccessHeaders } from "./access-gate.js";

const BASE = "/api";

interface FetchJsonOptions extends RequestInit {
  auth?: "required" | "optional";
  retryAuth?: boolean;
}

interface ErrorPayload {
  error?: string;
  code?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function parseErrorPayload(data: unknown): ErrorPayload {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  return {
    error: typeof obj.error === "string" ? obj.error : undefined,
    code: typeof obj.code === "string" ? obj.code : undefined,
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function fetchJson<T>(url: string, options?: FetchJsonOptions): Promise<T> {
  const authMode = options?.auth ?? "required";
  const allowAuthRetry = options?.retryAuth ?? false;
  if (authMode === "required" && !hasActiveSession()) {
    markAuthRequired();
    throw new ApiError("Sign in required", "AUTH_REQUIRED", 401);
  }

  const accessHeaders = getAccessHeaders();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...accessHeaders,
      ...authHeaders,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const data = await parseJsonSafe(res);
  if (res.ok) return data as T;

  const { error, code } = parseErrorPayload(data);
  if (code === "APP_LOCKED") {
    clearAccessToken();
  }
  if (code === "AUTH_FAILED") {
    clearAuthSession();
    markAuthRequired();
    if (allowAuthRetry && authMode === "required") {
      const signedIn = await signIn();
      if (signedIn) {
        return fetchJson<T>(url, {
          ...options,
          retryAuth: false,
        });
      }
    }
  }
  throw new ApiError(error ?? `Request failed: ${res.status}`, code ?? "REQUEST_FAILED", res.status);
}

// Agent
export const agentInit = (body: AgentInitRequest) =>
  fetchJson<AgentInitResponse>("/agent/init", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const agentComplete = (body: AgentCompleteRequest) =>
  fetchJson<AgentCompleteResponse>("/agent/complete", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const agentStatus = (masterAddress: string, network: string) =>
  fetchJson<AgentStatusResponse>(
    `/agent/status?masterAddress=${masterAddress}&network=${network}`,
  );

// Account
export const accountBootstrap = (masterAddress: string, network: string) =>
  fetchJson<BootstrapResponse>(
    `/account/bootstrap?masterAddress=${masterAddress}&network=${network}`,
  );

export const accountPortfolio = (masterAddress: string, network: string) =>
  fetchJson<PortfolioResponse>(
    `/account/portfolio?masterAddress=${masterAddress}&network=${network}`,
  );

// Trade
export const tradeQuote = (body: QuoteRequest) =>
  fetchJson<QuoteResponse>("/trade/quote", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const tradeExecute = (body: ExecuteRequest) =>
  fetchJson<TradeResult>("/trade/execute", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const tradeExecutePreview = (body: ExecutePreviewRequest) =>
  fetchJson<ExecutePreviewResponse>("/trade/execute-preview", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const tradeQuick = (body: QuickTradeRequest) =>
  fetchJson<TradeResult>("/trade/quick", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const tradeClose = (body: ClosePositionRequest) =>
  fetchJson<TradeResult>("/trade/close", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const tradeHistory = (masterAddress: string, network: string, limit = 50) =>
  fetchJson<TradeHistoryResponse>(
    `/trade/history?masterAddress=${masterAddress}&network=${network}&limit=${limit}`,
  );

// Swap
export const swapQuote = (body: SwapQuoteRequest) =>
  fetchJson<SwapQuoteResponse>("/swap/quote", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const swapExecute = (body: SwapExecuteRequest) =>
  fetchJson<SwapResult>("/swap/execute", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

// Bridge
export const bridgeChains = () =>
  fetchJson<BridgeChainsResponse>("/bridge/chains");

export const bridgeBalances = (userAddress: string) =>
  fetchJson<BridgeBalancesResponse>(
    `/bridge/balances?userAddress=${encodeURIComponent(userAddress)}`,
  );

export const bridgeQuote = (body: BridgeQuoteRequest) =>
  fetchJson<BridgeQuote>("/bridge/quote", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

export const bridgeStatus = (requestId: string) =>
  fetchJson<BridgeStatusResponse>(
    `/bridge/status/${encodeURIComponent(requestId)}`,
  );

export const bridgeHistory = (masterAddress: string, network: string, limit = 50) =>
  fetchJson<BridgeHistoryResponse>(
    `/bridge/history?masterAddress=${encodeURIComponent(masterAddress)}&network=${network}&limit=${limit}`,
  );

export const bridgeHistoryUpdate = (body: BridgeHistoryUpsertRequest) =>
  fetchJson<{ success: boolean; item: BridgeHistoryItem }>("/bridge/history", {
    method: "POST",
    body: JSON.stringify(body),
    retryAuth: true,
  });

// Market Data
export const marketCandles = (coin: string, interval: CandleInterval, network: string) =>
  fetchJson<CandleData[]>(
    `/market/candles?coin=${encodeURIComponent(coin)}&interval=${interval}&network=${network}`,
  );

// Referral
export const referralData = (masterAddress: string, network: string) =>
  fetchJson<ReferralDataResponse>(
    `/referral?masterAddress=${masterAddress}&network=${network}`,
  );

// Earn / Portfolio Margin
export const earnData = (masterAddress: string, network: string) =>
  fetchJson<EarnResponse>(
    `/earn?masterAddress=${masterAddress}&network=${network}`,
  );

// Health
export const health = () => fetchJson<HealthResponse>("/health", { auth: "optional" });
export const readiness = () => fetchJson<HealthResponse>("/ready", { auth: "optional" });
