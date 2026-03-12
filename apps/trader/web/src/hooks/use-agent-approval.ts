import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./use-wallet";
import { useNetwork } from "../lib/network-context";
import { agentInit, agentComplete } from "../lib/api";
import { createExchangeClientFromInjected, getErrorChainMessage } from "../lib/wallet-client";

function isNonFatalSetupError(message: string): boolean {
  return /already|exists|configured|unchanged|same|duplicate/i.test(message);
}

function isDepositRequiredError(message: string): boolean {
  return /must deposit before performing actions/i.test(message);
}

export type ApprovalStep = "init" | "approve" | "complete" | "done";

export interface AgentApprovalState {
  step: ApprovalStep;
  agentAddress: string;
  agentName: string;
  pendingId: string;
  builderApproval: {
    builder: `0x${string}`;
    feeBps: number;
    maxFeeRate: string;
  } | null;
  error: string;
  isProcessing: boolean;
}

export function useAgentApproval() {
  const { address } = useWallet();
  const { network } = useNetwork();
  const queryClient = useQueryClient();

  const [state, setState] = useState<AgentApprovalState>({
    step: "init",
    agentAddress: "",
    agentName: "",
    pendingId: "",
    builderApproval: null,
    error: "",
    isProcessing: false,
  });

  const initMutation = useMutation({
    mutationFn: agentInit,
    onSuccess: (data) => {
      setState(prev => ({
        ...prev,
        agentAddress: data.agentAddress,
        agentName: data.agentName,
        pendingId: data.pendingAgentId,
        builderApproval: data.builderApproval ?? null,
        step: "approve",
        error: "",
      }));
    },
    onError: (err) => {
      setState(prev => ({ ...prev, error: err.message }));
    },
  });

  async function handleApprove() {
    if (!address || !state.agentAddress) return;

    setState(prev => ({ ...prev, error: "", isProcessing: true }));

    try {
      const exchange = await createExchangeClientFromInjected(address, network);

      // Approve agent
      try {
        await exchange.approveAgent({
          agentAddress: state.agentAddress as `0x${string}`,
          agentName: state.agentName || null,
        });
      } catch (err) {
        const message = getErrorChainMessage(err);
        if (!isNonFatalSetupError(message)) {
          throw new Error(`Agent approval failed: ${message}`);
        }
      }

      // Set abstraction mode
      try {
        await exchange.userSetAbstraction({
          user: address,
          abstraction: "unifiedAccount",
        });
      } catch (err) {
        const message = getErrorChainMessage(err);
        if (!isNonFatalSetupError(message)) {
          throw new Error(`Setting abstraction failed: ${message}`);
        }
      }

      // Approve builder fee if needed
      if (state.builderApproval && state.builderApproval.feeBps > 0) {
        try {
          await exchange.approveBuilderFee({
            builder: state.builderApproval.builder,
            maxFeeRate: state.builderApproval.maxFeeRate,
          });
        } catch (err) {
          const message = getErrorChainMessage(err);
          if (!isDepositRequiredError(message) && !isNonFatalSetupError(message)) {
            throw new Error(`Builder fee approval failed: ${message}`);
          }
        }
      }

      setState(prev => ({ ...prev, step: "complete", isProcessing: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: getErrorChainMessage(err) || "Approval failed",
        isProcessing: false,
      }));
    }
  }

  const completeMutation = useMutation({
    mutationFn: () =>
      agentComplete({
        masterAddress: address!,
        network,
        pendingAgentId: state.pendingId,
      }),
    onSuccess: () => {
      setState(prev => ({ ...prev, step: "done" }));
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (err) => {
      setState(prev => ({ ...prev, error: err.message }));
    },
  });

  function reset() {
    setState({
      step: "init",
      agentAddress: "",
      agentName: "",
      pendingId: "",
      builderApproval: null,
      error: "",
      isProcessing: false,
    });
  }

  return {
    state,
    initAgent: () => {
      if (address) {
        initMutation.mutate({ masterAddress: address, network });
      }
    },
    approveAgent: handleApprove,
    completeSetup: () => completeMutation.mutate(),
    reset,
    isInitializing: initMutation.isPending,
    isCompleting: completeMutation.isPending,
  };
}
