import { useState } from "react";
import { useWallet } from "../hooks/use-wallet";
import { useBootstrap } from "../hooks/use-bootstrap";
import { useAgentStatus } from "../hooks/use-agent-status";
import { useNetwork } from "../lib/network-context";
import { useAuthSession } from "../hooks/use-auth-session";
import { AssetList } from "../components/AssetList";
import { DepositModal } from "../components/DepositModal";
import { Link } from "react-router-dom";
import { tokenIconUrl, tokenIconFallbackUrl, deployerIconUrl } from "../lib/display";
import type { GroupedPosition } from "@shared/types";

export function Dashboard() {
  const { address, isConnected, connect, isConnecting, error } = useWallet();
  const auth = useAuthSession();
  const [showDeposit, setShowDeposit] = useState(false);
  const { network } = useNetwork();
  const { data: agentStatus } = useAgentStatus(address, network);
  const { data: bootstrap, isLoading, error: bootstrapError } = useBootstrap(address, network);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-5">
          <span className="text-5xl leading-none text-accent" style={{ fontFamily: "serif" }}>&#961;</span>
          <h1 className="text-2xl font-semibold text-text-primary">HyperliquidPrime</h1>
          <p className="text-text-muted text-sm max-w-sm leading-relaxed">
            Connect your wallet to start trading across Hyperliquid&apos;s native and HIP-3 markets
            with smart order routing.
          </p>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="bg-accent hover:bg-accent/90 disabled:opacity-50 px-8 py-3 text-sm font-semibold text-surface-0 transition-all shadow-[0_0_24px_#8b5cf630]"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
          {error && <p className="text-short text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h2 className="text-xl font-semibold text-text-primary">Sign in to continue</h2>
          <p className="text-sm text-text-muted">
            This app requires an authenticated session before protected market and account requests.
          </p>
          <button
            onClick={() => { void auth.signIn(); }}
            className="bg-accent hover:bg-accent/90 px-6 py-2.5 text-sm font-semibold text-surface-0"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-surface-1 w-48" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface-1" />
          ))}
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-short-muted border border-short/20 p-4 text-sm text-short">
          {bootstrapError.message}
        </div>
      </div>
    );
  }

  const needsSetup = agentStatus && !agentStatus.configured;

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-48">
      {/* Agent setup banner */}
      {needsSetup && (
        <Link
          to="/setup"
          className="block bg-accent-muted border border-accent/20 p-4 mb-4 hover:border-accent/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-accent">Set up agent wallet to trade</div>
              <div className="text-xs text-text-muted">Delegate a trading agent that can place orders on your behalf.</div>
            </div>
            <svg className="w-4 h-4 text-text-muted ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </Link>
      )}

      {/* Balance card — only when agent is configured */}
      {bootstrap?.balance && (
        <div className="bg-surface-2 border border-border p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-accent font-bold text-sm">$</span>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Available Balance</div>
              <div className="text-lg font-bold text-text-primary">
                ${bootstrap.balance.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowDeposit(true)}
            className="bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent transition-colors"
          >
            Deposit
          </button>
        </div>
      )}

      {/* Deposit QR modal */}
      {showDeposit && address && (
        <DepositModal
          address={address}
          onClose={() => setShowDeposit(false)}
        />
      )}

      {/* Open positions */}
      {bootstrap?.positions && bootstrap.positions.length > 0 && (
        <div className="bg-surface-2 border border-border mb-4">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h3 className="text-xs uppercase tracking-wider text-text-muted">
              Open Positions <span className="text-text-dim">({bootstrap.positions.length})</span>
            </h3>
            <Link to="/portfolio" className="text-xs text-accent hover:text-accent/80 transition-colors">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {bootstrap.positions.map((pos: GroupedPosition) => {
              const pnlPositive = pos.unrealizedPnl >= 0;
              return (
                <Link
                  key={`${pos.baseAsset}-${pos.side}`}
                  to={`/trade/${pos.baseAsset}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-3/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-7 h-7 shrink-0">
                      <div className="w-7 h-7 rounded-full bg-surface-2 border border-border/60 flex items-center justify-center overflow-hidden">
                        <img
                          src={tokenIconUrl(pos.primaryCoin)}
                          alt={pos.baseAsset}
                          className="w-7 h-7"
                          onError={(e) => {
                            const el = e.currentTarget;
                            const fallback = tokenIconFallbackUrl(pos.primaryCoin);
                            if (fallback && el.src !== fallback) {
                              el.src = fallback;
                              return;
                            }
                            el.style.display = "none";
                            el.parentElement!.innerHTML = `<span class="text-[10px] font-bold text-text-muted">${pos.baseAsset.slice(0, 2)}</span>`;
                          }}
                        />
                      </div>
                      {deployerIconUrl(pos.primaryCoin) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-surface-0 border border-border/80 overflow-hidden flex items-center justify-center">
                          <img
                            src={deployerIconUrl(pos.primaryCoin)!}
                            alt="Market"
                            className="w-3.5 h-3.5 object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-text-primary">{pos.baseAsset}</div>
                      <div className={`text-xs font-medium ${pos.side === "long" ? "text-long" : "text-short"}`}>
                        {pos.side} · {pos.size.toLocaleString("en-US", { maximumFractionDigits: 6 })} @ {pos.leverage.toFixed(1)}x
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-medium ${pnlPositive ? "text-long" : "text-short"}`}>
                      {pnlPositive ? "+" : ""}
                      ${Math.abs(pos.unrealizedPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-text-muted">
                      Entry ${pos.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <Link
        to="/portfolio"
        className="block bg-surface-2 border border-border p-4 mb-4 hover:border-accent/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text-primary font-medium">Open Portfolio</div>
            <div className="text-xs text-text-muted mt-0.5">Balances, positions, open orders, and history</div>
          </div>
          <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </Link>

      {/* Markets heading */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-lg font-semibold text-text-primary">Markets</h2>
      </div>

      <AssetList assets={bootstrap?.assets ?? []} />
    </div>
  );
}
