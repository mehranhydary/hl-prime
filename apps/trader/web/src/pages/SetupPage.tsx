import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useAgentStatus } from "../hooks/use-agent-status";
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
  const { data: agentStatusData, isLoading: statusLoading } = useAgentStatus(address, network);

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
    if (!address || !agentAddress) return;
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
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary font-heading">Connect Wallet</h1>
          <p className="text-text-muted text-sm">Connect your wallet to set up agent delegation.</p>
          <button
            onClick={connect}
            className="app-button-md bg-accent hover:bg-accent/90 px-6 text-sm font-semibold text-surface-0 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary font-heading">Sign in required</h1>
          <p className="text-sm text-text-muted">
            Agent setup requires an authenticated session.
          </p>
          <button
            onClick={() => { void auth.signIn(); }}
            className="app-button-md bg-accent hover:bg-accent/90 px-6 text-sm font-semibold text-surface-0 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  /* ── Agent already configured → show settings view ── */

  if (statusLoading) {
    return (
      <div className="px-4 py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-surface-1 w-32" />
          <div className="h-20 bg-surface-1" />
        </div>
      </div>
    );
  }

  if (agentStatusData?.configured) {
    const truncated = agentStatusData.agentAddress
      ? `${agentStatusData.agentAddress.slice(0, 6)}...${agentStatusData.agentAddress.slice(-4)}`
      : "—";

    return (
      <div className="px-4 py-4 pb-24">
        <h1 className="text-xl font-semibold text-text-primary font-heading mb-2">Settings</h1>
        <p className="text-text-muted text-sm mb-6">Your trading agent is active.</p>

        <div className="bg-surface-2 border border-border p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Status</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-long">
              <span className="w-1.5 h-1.5 rounded-full bg-long" />
              Active
            </span>
          </div>

          {/* Agent address */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Agent Address</span>
            <button
              onClick={() => {
                if (agentStatusData.agentAddress) {
                  void navigator.clipboard.writeText(agentStatusData.agentAddress);
                }
              }}
              className="text-xs text-text-secondary hover:text-accent transition-colors"
              title="Copy full address"
            >
              {truncated}
            </button>
          </div>

          {/* Network */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Network</span>
            <span className="text-xs text-text-secondary capitalize">{network}</span>
          </div>

          {/* Master wallet */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Master Wallet</span>
            <span className="text-xs text-text-secondary">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—"}
            </span>
          </div>
        </div>

        <p className="text-xs text-text-dim mt-4 leading-relaxed">
          The agent wallet can place orders on your behalf but cannot withdraw funds.
        </p>
      </div>
    );
  }

  const currentStepIdx = STEPS.indexOf(step);

  return (
    <div className="px-4 py-4 pb-24">
      <h1 className="text-xl font-semibold text-text-primary font-heading mb-2">Agent Wallet Setup</h1>
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
                    ? "bg-accent text-surface-0 shadow-[0_0_12px_#50e3b530]"
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
            Generate a new Privy-managed agent wallet. The app stores only wallet metadata on the server.
          </p>
          <button
            onClick={() => initMutation.mutate({
              masterAddress: address!,
              network,
            })}
            disabled={initMutation.isPending}
            className="app-button-lg w-full bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_#50e3b515]"
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
            className="app-button-lg w-full bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 transition-all shadow-[0_0_20px_#50e3b515]"
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
            className="app-button-lg w-full bg-long hover:bg-long/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(34,197,94,0.15)]"
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
