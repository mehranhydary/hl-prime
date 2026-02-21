import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useNetwork } from "../lib/network-context";
import { agentInit, agentComplete } from "../lib/api";
import { createExchangeClientFromInjected, getErrorChainMessage } from "../lib/wallet-client";

type SetupStep = "init" | "approve" | "complete" | "done";

const STEPS: SetupStep[] = ["init", "approve", "complete", "done"];
const STEP_LABELS = ["Generate", "Approve", "Finalize", "Done"];

function isNonFatalSetupError(message: string): boolean {
  return /already|exists|configured|unchanged|same|duplicate/i.test(message);
}

function isDepositRequiredError(message: string): boolean {
  return /must deposit before performing actions/i.test(message);
}

export function SetupPage() {
  const { address, isConnected, connect } = useWallet();
  const auth = useAuthSession();
  const { network } = useNetwork();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<SetupStep>("init");
  const [agentAddress, setAgentAddress] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("");
  const [pendingId, setPendingId] = useState<string>("");
  const [builderApproval, setBuilderApproval] = useState<{
    builder: `0x${string}`;
    feeBps: number;
    maxFeeRate: string;
  } | null>(null);
  const [error, setError] = useState<string>("");

  const initMutation = useMutation({
    mutationFn: agentInit,
    onSuccess: (data) => {
      setAgentAddress(data.agentAddress);
      setAgentName(data.agentName);
      setPendingId(data.pendingAgentId);
      setBuilderApproval(data.builderApproval ?? null);
      setStep("approve");
    },
    onError: (err) => setError(err.message),
  });

  async function handleApprove() {
    if (!window.ethereum || !address || !agentAddress) return;
    setError("");

    try {
      const exchange = await createExchangeClientFromInjected(address, network);

      try {
        await exchange.approveAgent({
          agentAddress: agentAddress as `0x${string}`,
          agentName: agentName || null,
        });
      } catch (err) {
        const message = getErrorChainMessage(err);
        if (!isNonFatalSetupError(message)) {
          throw new Error(`Agent approval failed: ${message}`);
        }
      }

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

      if (builderApproval && builderApproval.feeBps > 0) {
        try {
          await exchange.approveBuilderFee({
            builder: builderApproval.builder,
            maxFeeRate: builderApproval.maxFeeRate,
          });
        } catch (err) {
          const message = getErrorChainMessage(err);
          if (isDepositRequiredError(message) || isNonFatalSetupError(message)) {
            // Non-blocking: user can still complete setup and trade without builder fee.
          } else {
            throw new Error(`Builder fee approval failed: ${message}`);
          }
        }
      }

      setStep("complete");
    } catch (err) {
      setError(getErrorChainMessage(err) || "Approval failed");
    }
  }

  const completeMutation = useMutation({
    mutationFn: () =>
      agentComplete({
        masterAddress: address!,
        network,
        pendingAgentId: pendingId,
      }),
    onSuccess: () => {
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      setTimeout(() => navigate("/markets"), 2000);
    },
    onError: (err) => setError(err.message),
  });

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Connect Wallet First</h1>
          <p className="text-text-muted text-sm">Connect your wallet to set up agent delegation.</p>
          <button
            onClick={connect}
            className="bg-accent hover:bg-accent/90 px-8 py-3 text-sm font-semibold text-surface-0 transition-all shadow-[0_0_24px_#8b5cf620]"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h1 className="text-xl font-semibold text-text-primary">Sign in required</h1>
          <p className="text-sm text-text-muted">
            Agent setup uses protected API routes. Sign in once with your wallet session first.
          </p>
          <button
            onClick={() => { void auth.signIn(); }}
            className="bg-accent hover:bg-accent/90 px-8 py-3 text-sm font-semibold text-surface-0"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const currentStepIdx = STEPS.indexOf(step);

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-text-primary mb-2">Agent Wallet Setup</h1>
      <p className="text-text-muted text-sm mb-6">
        Approve a trading agent that can place orders on your behalf but cannot withdraw funds.
      </p>

      {/* Progress steps */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  i === currentStepIdx
                    ? "bg-accent text-surface-0 shadow-[0_0_12px_#8b5cf630]"
                    : i < currentStepIdx
                    ? "bg-long text-surface-0"
                    : "bg-surface-2 border border-border text-text-muted"
                }`}
              >
                {i < currentStepIdx ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-[10px] ${i <= currentStepIdx ? "text-text-secondary" : "text-text-dim"}`}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {i < 3 && (
              <div className={`h-px flex-1 mb-4 ${i < currentStepIdx ? "bg-long" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === "init" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Generate a new agent wallet keypair. The private key will be stored encrypted on the server.
          </p>
          <button
            onClick={() => initMutation.mutate()}
            disabled={initMutation.isPending}
            className="w-full py-3 bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_#8b5cf615]"
          >
            {initMutation.isPending ? "Generating..." : "Generate Agent Wallet"}
          </button>
        </div>
      )}

      {step === "approve" && (
        <div className="space-y-4">
          <div className="bg-surface-2 border border-border p-4 text-sm space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Agent Address</span>
              <span className="text-xs text-text-secondary">{agentAddress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Name</span>
              <span className="text-xs text-text-secondary">{agentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Network</span>
              <span className="text-xs text-text-secondary capitalize">{network}</span>
            </div>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your wallet will be asked to sign approval transactions. The agent can trade but cannot withdraw.
          </p>
          <button
            onClick={handleApprove}
            className="w-full py-3 bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 transition-all shadow-[0_0_20px_#8b5cf615]"
          >
            Approve Agent
          </button>
        </div>
      )}

      {step === "complete" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Agent approved. Finalizing setup and storing encrypted keys...
          </p>
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="w-full py-3 bg-long hover:bg-long/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(34,197,94,0.15)]"
          >
            {completeMutation.isPending ? "Completing..." : "Complete Setup"}
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="bg-long-muted border border-long/20 p-4 text-sm text-long">
          Setup complete! Redirecting to dashboard...
        </div>
      )}

      {error && (
        <div className="mt-4 bg-short-muted border border-short/20 p-3 text-sm text-short">
          {error}
        </div>
      )}
    </div>
  );
}
