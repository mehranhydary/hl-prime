import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tradeQuote, tradeExecute, tradeQuick, tradeClose } from "../lib/api";
import { executeDirectly } from "../lib/hl-direct";
import { useAgentApprovalModal, isAgentApprovalError } from "../lib/agent-approval-context";
import type {
  QuoteRequest,
  ExecuteRequest,
  QuickTradeRequest,
  ClosePositionRequest,
  DirectExecutionLeg,
  BootstrapResponse,
  Network,
} from "@shared/types";

function refreshTradeRelatedQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  const keys = [
    ["bootstrap"],
    ["portfolio"],
    ["trade-history"],
  ] as const;

  // Invalidate all matching queries (not just active ones) so navigating
  // to another page always triggers a fresh fetch instead of showing stale data.
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  // Staggered retries to catch blockchain finality delays
  for (const delayMs of [1_500, 4_000]) {
    setTimeout(() => {
      for (const queryKey of keys) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey, type: "active" });
      }
    }, delayMs);
  }
}

/**
 * Optimistically remove a position from the bootstrap cache so the UI
 * reflects the close immediately without waiting for the server round-trip.
 */
function optimisticRemovePosition(
  queryClient: ReturnType<typeof useQueryClient>,
  asset: string,
): void {
  queryClient.setQueriesData<BootstrapResponse>(
    { queryKey: ["bootstrap"] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        positions: old.positions.filter((p) => p.baseAsset !== asset),
        assets: old.assets.map((a) =>
          a.baseAsset === asset ? { ...a, hasPosition: false } : a,
        ),
      };
    },
  );
}

export function useQuote() {
  return useMutation({
    mutationFn: (body: QuoteRequest) => tradeQuote(body),
  });
}

export function useExecute() {
  const queryClient = useQueryClient();
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (body: ExecuteRequest) => tradeExecute(body),
    onSuccess: () => {
      refreshTradeRelatedQueries(queryClient);
    },
    onError: (error) => {
      if (isAgentApprovalError(error)) {
        showApprovalModal();
      }
    },
  });
}

export function useQuickTrade() {
  const queryClient = useQueryClient();
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (body: QuickTradeRequest) => tradeQuick(body),
    onSuccess: () => {
      refreshTradeRelatedQueries(queryClient);
    },
    onError: (error) => {
      if (isAgentApprovalError(error)) {
        showApprovalModal();
      }
    },
  });
}

export function useClosePosition() {
  const queryClient = useQueryClient();
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (body: ClosePositionRequest) => tradeClose(body),
    onMutate: (variables) => {
      // Optimistically remove the position so the UI updates instantly
      optimisticRemovePosition(queryClient, variables.asset);
    },
    onSuccess: () => {
      refreshTradeRelatedQueries(queryClient);
    },
    onError: (_error, variables) => {
      if (isAgentApprovalError(_error)) {
        showApprovalModal();
      }
      // Rollback: re-fetch to restore the position if close failed
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      queryClient.refetchQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useDirectExecute() {
  const queryClient = useQueryClient();
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (params: { legs: DirectExecutionLeg[]; address: `0x${string}`; network: Network }) =>
      executeDirectly(params.legs, params.address, params.network),
    onSuccess: () => {
      refreshTradeRelatedQueries(queryClient);
    },
    onError: (error) => {
      if (isAgentApprovalError(error)) {
        showApprovalModal();
      }
    },
  });
}
