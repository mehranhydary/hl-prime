import { useEffect } from "react";
import { useAgentApproval, type ApprovalStep } from "../hooks/use-agent-approval";
import { useNetwork } from "../lib/network-context";

interface AgentApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const STEPS: ApprovalStep[] = ["init", "approve", "complete", "done"];
const STEP_LABELS = ["Generate", "Approve", "Finalize", "Done"];

export function AgentApprovalModal({ isOpen, onClose, onComplete }: AgentApprovalModalProps) {
  const { network } = useNetwork();
  const {
    state,
    initAgent,
    approveAgent,
    completeSetup,
    reset,
    isInitializing,
    isCompleting,
  } = useAgentApproval();

  // Auto-close on completion
  useEffect(() => {
    if (state.step === "done") {
      setTimeout(() => {
        onComplete?.();
        onClose();
        reset();
      }, 2000);
    }
  }, [state.step, onClose, onComplete, reset]);

  if (!isOpen) return null;

  const currentStepIdx = STEPS.indexOf(state.step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface-1 rounded-2xl p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading text-text-primary">Agent Re-Approval Required</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-short/10 border border-short/20 p-4 mb-6 rounded-xl">
          <p className="text-sm text-short leading-relaxed">
            Your agent wallet is not approved on-chain. Please re-approve to continue trading.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1 mb-6">
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

        {/* Step Content */}
        {state.step === "init" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              Generate a new Privy-managed agent wallet to restore trading capabilities.
            </p>
            <button
              onClick={initAgent}
              disabled={isInitializing}
              className="w-full app-button-lg bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_#50e3b515]"
            >
              {isInitializing ? "Generating..." : "Generate Agent Wallet"}
            </button>
          </div>
        )}

        {state.step === "approve" && (
          <div className="space-y-4">
            <div className="bg-surface-2 border border-border p-4 text-sm space-y-3 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Agent Address</span>
                <span className="text-xs text-text-secondary font-mono">{state.agentAddress.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Name</span>
                <span className="text-xs text-text-secondary">{state.agentName}</span>
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
              onClick={approveAgent}
              disabled={state.isProcessing}
              className="w-full app-button-lg bg-accent hover:bg-accent/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_#50e3b515]"
            >
              {state.isProcessing ? "Approving..." : "Approve Agent"}
            </button>
          </div>
        )}

        {state.step === "complete" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              Agent approved! Finalizing setup and storing encrypted keys...
            </p>
            <button
              onClick={completeSetup}
              disabled={isCompleting}
              className="w-full app-button-lg bg-long hover:bg-long/90 text-sm font-semibold text-surface-0 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            >
              {isCompleting ? "Completing..." : "Complete Setup"}
            </button>
          </div>
        )}

        {state.step === "done" && (
          <div className="bg-long/10 border border-long/20 p-4 text-sm text-long rounded-xl">
            ✅ Setup complete! You can now continue trading.
          </div>
        )}

        {/* Error Display */}
        {state.error && (
          <div className="mt-4 bg-short/10 border border-short/20 p-3 text-sm text-short rounded-xl">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
