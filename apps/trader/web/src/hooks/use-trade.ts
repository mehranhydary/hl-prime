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
  Network,
} from "@shared/types";

function refreshTradeRelatedQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  const keys = [
    ["bootstrap"],
    ["portfolio"],
    ["trade-history"],
  ] as const;

  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  setTimeout(() => {
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, type: "active" });
    }
  }, 1_500);
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
