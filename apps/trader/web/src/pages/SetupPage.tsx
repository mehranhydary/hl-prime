import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useAgentStatus } from "../hooks/use-agent-status";
import { useNetwork } from "../lib/network-context";
import { useTheme, type Theme } from "../lib/theme-context";
import { lock as lockAccess } from "../lib/access-gate";
import { agentInit, agentComplete } from "../lib/api";
import { createExchangeClientFromInjected, getErrorChainMessage } from "../lib/wallet-client";
import type { Network } from "@shared/types";

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
  const { network, setNetwork } = useNetwork();
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
    return (
      <SettingsView
        agentAddress={agentStatusData.agentAddress}
        masterAddress={address}
        network={network}
        setNetwork={setNetwork}
        navigate={navigate}
      />
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

/* ── Settings View (agent already configured) ── */

const THEME_OPTIONS: { key: Theme; label: string; icon: React.ReactNode }[] = [
  {
    key: "green",
    label: "Green",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.209-.553-.334-.869-.378l-2.095-.263a1.5 1.5 0 01-.451-.116l-.353-.176a2.625 2.625 0 01-1.14-1.14l-.794-1.588A2.646 2.646 0 006.115 5.19zM20.25 12c0 4.556-3.694 8.25-8.25 8.25S3.75 16.556 3.75 12 7.444 3.75 12 3.75s8.25 3.694 8.25 8.25z" />
      </svg>
    ),
  },
  {
    key: "light",
    label: "Light",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    key: "dark",
    label: "Dark",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    ),
  },
];

function SettingsView({
  agentAddress,
  masterAddress,
  network,
  setNetwork,
  navigate,
}: {
  agentAddress?: `0x${string}`;
  masterAddress: `0x${string}` | null;
  network: Network;
  setNetwork: (n: Network) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { theme, setTheme } = useTheme();

  const truncated = agentAddress
    ? `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`
    : "—";

  function handleLock() {
    lockAccess();
    navigate("/", { replace: true });
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <h1 className="text-xl font-semibold text-text-primary font-heading mb-2">Settings</h1>

      {/* ── Agent Wallet ── */}
      <div className="bg-surface-2 border border-border p-4 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-text-muted">Agent Wallet</h2>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Status</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-long">
            <span className="w-1.5 h-1.5 rounded-full bg-long" />
            Active
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Agent Address</span>
          <button
            onClick={() => {
              if (agentAddress) void navigator.clipboard.writeText(agentAddress);
            }}
            className="text-xs text-text-secondary hover:text-accent transition-colors"
            title="Copy full address"
          >
            {truncated}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Master Wallet</span>
          <span className="text-xs text-text-secondary">
            {masterAddress ? `${masterAddress.slice(0, 6)}...${masterAddress.slice(-4)}` : "—"}
          </span>
        </div>
      </div>

      {/* ── Network ── */}
      <div className="bg-surface-2 border border-border p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-text-muted">Network</h2>
        <div className="flex gap-2">
          {(["mainnet", "testnet"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNetwork(n)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                network === n
                  ? "bg-accent text-surface-0"
                  : "bg-surface-3 text-text-muted hover:text-text-secondary"
              }`}
            >
              {n === "mainnet" ? "Mainnet" : "Testnet"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Color Scheme ── */}
      <div className="bg-surface-2 border border-border p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-text-muted">Color Scheme</h2>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors ${
                theme === t.key
                  ? "bg-accent text-surface-0"
                  : "bg-surface-3 text-text-muted hover:text-text-secondary"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lock ── */}
      <div className="bg-surface-2 border border-border p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-text-muted">Security</h2>
        <button
          onClick={handleLock}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-surface-3 hover:bg-surface-3/80 border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Lock App
        </button>
        <p className="text-xs text-text-dim leading-relaxed">
          Locks the app and requires the password to re-enter.
        </p>
      </div>

      <p className="text-xs text-text-dim leading-relaxed">
        The agent wallet can place orders on your behalf but cannot withdraw funds.
      </p>
    </div>
  );
}
