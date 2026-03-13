/**
 * Pre-trade actions that run before server-side trade execution.
 *
 * Collateral swaps are routed through the server's /api/swap/execute endpoint
 * (agent wallet) rather than signed in the browser. This avoids EIP-712
 * chainId 1337 issues with injected wallets.
 *
 * Builder fee approval is handled server-side by the SDK executor, so it is
 * no longer performed here.
 */
import type { CollateralPreview, RouteSummary, Network } from "@shared/types";
import { swapExecute } from "./api";

const BUILDER_APPROVAL_CACHE = new Set<string>();
const BUILDER_APPROVAL_STORAGE_KEY = "hl-prime:builder-approval-cache:v1";

// ---------------------------------------------------------------------------
// Builder-fee approval cache (read-only check used by TradeForm)
// ---------------------------------------------------------------------------

function readPersistentBuilderApprovalCache(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(BUILDER_APPROVAL_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set<string>();
  }
}

function isBuilderApprovalCached(cacheKey: string): boolean {
  if (BUILDER_APPROVAL_CACHE.has(cacheKey)) return true;
  const persistent = readPersistentBuilderApprovalCache();
  if (persistent.has(cacheKey)) {
    BUILDER_APPROVAL_CACHE.add(cacheKey);
    return true;
  }
  return false;
}

/**
 * Synchronous check: returns true if the builder fee for this
 * address/network/route has already been approved (in-memory or localStorage).
 * No network calls, no wallet popup.
 */
export function isBuilderFeeAlreadyApproved(params: {
  address: `0x${string}`;
  network: Network;
  routeSummary?: RouteSummary;
}): boolean {
  if (!params.routeSummary?.builderApproval || params.routeSummary.builderFeeBps <= 0) {
    return true; // no builder fee required
  }
  const cacheKey = [
    params.network,
    params.address.toLowerCase(),
    params.routeSummary.builderApproval.builder.toLowerCase(),
    params.routeSummary.builderApproval.maxFeeRate,
  ].join(":");
  return isBuilderApprovalCached(cacheKey);
}

// ---------------------------------------------------------------------------
// Collateral preparation via server API
// ---------------------------------------------------------------------------

export interface PreTradeProgress {
  /** Called for each swap step. */
  onSwapStart?: (fromToken: string, toToken: string, amount: number) => void;
  onSwapComplete?: (fromToken: string, toToken: string, filled: string) => void;
  onSwapError?: (fromToken: string, toToken: string, error: string) => void;
}

async function prepareCollateralViaServer(
  network: Network,
  address: `0x${string}`,
  collateralPreview: CollateralPreview | undefined,
  progress?: PreTradeProgress,
): Promise<void> {
  const requirements = collateralPreview?.requirements ?? [];
  const shortfalls = requirements.filter((req) => req.shortfall > 0);
  if (shortfalls.length === 0) return;

  for (const req of shortfalls) {
    const fromToken = req.swapFrom || "USDC";
    const toToken = req.token;
    // Swap slightly more than needed to account for rounding/slippage
    const amount = req.shortfall * 1.02;

    progress?.onSwapStart?.(fromToken, toToken, amount);

    try {
      const result = await swapExecute({
        network,
        userAddress: address,
        fromToken,
        toToken,
        amount,
        maxSlippageBps: 100, // 1% slippage for collateral prep
      });

      if (!result.success) {
        const error = result.error ?? "Swap order did not fill";
        progress?.onSwapError?.(fromToken, toToken, error);
        throw new Error(`Swap ${fromToken}->${toToken} failed: ${error}`);
      }

      const filled = parseFloat(result.filled);
      if (!Number.isFinite(filled) || filled <= 0) {
        const error = "Swap returned zero fill";
        progress?.onSwapError?.(fromToken, toToken, error);
        throw new Error(`Swap ${fromToken}->${toToken} failed: ${error}`);
      }

      progress?.onSwapComplete?.(fromToken, toToken, result.filled);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Swap ")) {
        throw error; // Already formatted
      }
      const message = error instanceof Error ? error.message : String(error);
      progress?.onSwapError?.(fromToken, toToken, message);
      throw new Error(`Swap ${fromToken}->${toToken} failed: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runMasterPreTradeActions(params: {
  address: `0x${string}`;
  network: Network;
  routeSummary?: RouteSummary;
  collateralPreview?: CollateralPreview;
  progress?: PreTradeProgress;
}): Promise<void> {
  // Builder fee approval is handled server-side by the SDK executor.
  // We only need to prepare collateral (stablecoin swaps) here.
  await prepareCollateralViaServer(
    params.network,
    params.address,
    params.collateralPreview,
    params.progress,
  );
}
