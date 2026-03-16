import { Link } from "react-router-dom";
import { useWallet } from "../hooks/use-wallet";
import { useNetwork } from "../lib/network-context";
import { useEarn } from "../hooks/use-earn";
import { useAuthSession } from "../hooks/use-auth-session";
import type { EarnReserveRow, EarnTokenPosition } from "@shared/types";

function formatPct(value: number): string {
  if (value < 0.01 && value > 0) return "<0.01%";
  return `${value.toFixed(2)}%`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatAmount(value: number, decimals = 4): string {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  return value.toFixed(decimals);
}

function HealthSummaryCards({
  healthFactor,
  totalSupplied,
  totalBorrowed,
}: {
  healthFactor: number | null;
  totalSupplied: number;
  totalBorrowed: number;
}) {
  let healthLabel = "--";
  let healthColor = "text-text-muted";
  if (healthFactor !== null) {
    healthLabel = healthFactor.toFixed(2);
    if (healthFactor > 2) healthColor = "text-long";
    else if (healthFactor > 1.2) healthColor = "text-warning";
    else healthColor = "text-short";
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-surface-2 border border-border p-3">
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Health Factor
        </p>
        <p className={`text-lg font-semibold ${healthColor}`}>{healthLabel}</p>
      </div>
      <div className="bg-surface-2 border border-border p-3">
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Total Supplied
        </p>
        <p className="text-lg font-semibold text-text-primary">
          {formatUsd(totalSupplied)}
        </p>
      </div>
      <div className="bg-surface-2 border border-border p-3">
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Total Borrowed
        </p>
        <p className="text-lg font-semibold text-text-primary">
          {formatUsd(totalBorrowed)}
        </p>
      </div>
    </div>
  );
}

function PMExplainerCard() {
  return (
    <div className="bg-surface-2 border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">
        Portfolio Margin
      </h2>
      <p className="text-xs text-text-muted leading-relaxed">
        Enable Portfolio Margin to use HYPE and BTC as collateral for perp
        positions and earn yield on idle assets. All trading is unified across
        spot and perps.
      </p>
      <ul className="text-xs text-text-muted space-y-1">
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">+</span>
          <span>Earn yield on idle USDC, USDH, HYPE, BTC</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">+</span>
          <span>Use non-USD assets as perp collateral</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">+</span>
          <span>Greater capital efficiency with unified balances</span>
        </li>
      </ul>
      <Link
        to="/setup"
        className="block text-center py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-sm text-accent transition-colors"
      >
        Enable in Settings
      </Link>
    </div>
  );
}

function PositionsSection({
  title,
  positions,
  variant,
}: {
  title: string;
  positions: EarnTokenPosition[];
  variant: "supply" | "borrow";
}) {
  if (positions.length === 0) return null;
  const apyColor = variant === "supply" ? "text-long" : "text-short";

  return (
    <div className="bg-surface-2 border border-border">
      <div className="px-4 py-2 border-b border-border">
        <h3 className="text-xs uppercase tracking-wider text-text-muted">
          {title}
        </h3>
      </div>
      {positions.map((p) => (
        <div
          key={p.tokenIndex}
          className="px-4 py-3 flex items-center justify-between border-b border-border last:border-b-0"
        >
          <div>
            <p className="text-sm text-text-primary font-medium">
              {p.tokenName}
            </p>
            <p className="text-xs text-text-muted">
              {formatAmount(p.amount)} {p.tokenName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-primary">{formatUsd(p.valueUsd)}</p>
            <p className={`text-xs ${apyColor}`}>{formatPct(p.apy)} APY</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReservesTable({ reserves }: { reserves: EarnReserveRow[] }) {
  if (reserves.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-xs uppercase tracking-wider text-text-muted px-1">
        Market Rates
      </h2>
      {reserves.map((r) => (
        <div
          key={r.tokenIndex}
          className="bg-surface-2 border border-border p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-primary font-medium">
              {r.tokenName}
            </p>
            <p className="text-xs text-text-muted">
              {formatUsd(r.oraclePrice)}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <p className="text-text-dim mb-0.5">Supply APY</p>
              <p className="text-long">{formatPct(r.supplyApy)}</p>
            </div>
            <div>
              <p className="text-text-dim mb-0.5">Borrow APY</p>
              <p className="text-short">{formatPct(r.borrowApy)}</p>
            </div>
            <div>
              <p className="text-text-dim mb-0.5">Utilization</p>
              <p className="text-text-secondary">
                {formatPct(r.utilization * 100)}
              </p>
            </div>
            <div>
              <p className="text-text-dim mb-0.5">LTV</p>
              <p className="text-text-secondary">
                {r.ltv > 0 ? formatPct(r.ltv * 100) : "N/A"}
              </p>
            </div>
          </div>
          {/* Utilization bar */}
          <div className="mt-2 h-1 bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-accent/60 transition-all"
              style={{ width: `${Math.min(r.utilization * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EarnPage() {
  const { address } = useWallet();
  const { network } = useNetwork();
  const auth = useAuthSession();
  const { data, isLoading, error } = useEarn(address, network);

  if (!address || !auth.isAuthenticated) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-text-muted">
          Connect your wallet to view earn data.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-4 pb-24 space-y-3">
        <h1 className="text-xl font-semibold text-text-primary font-heading">
          Earn
        </h1>
        {/* Skeleton cards */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-2 border border-border p-3 animate-pulse"
            >
              <div className="h-3 bg-surface-3 w-16 mb-2" />
              <div className="h-5 bg-surface-3 w-12" />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-surface-2 border border-border p-3 h-20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4 pb-24 space-y-3">
        <h1 className="text-xl font-semibold text-text-primary font-heading">
          Earn
        </h1>
        <div className="bg-short/10 border border-short/30 p-4">
          <p className="text-sm text-short">
            Failed to load earn data. Please try again.
          </p>
        </div>
      </div>
    );
  }

  const isPM = data?.abstractionMode === "portfolioMargin";

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <h1 className="text-xl font-semibold text-text-primary font-heading">
        Earn
      </h1>

      {/* Health summary — only when PM active */}
      {isPM && data?.userState && (
        <HealthSummaryCards
          healthFactor={data.userState.healthFactor}
          totalSupplied={data.userState.totalSuppliedUsd}
          totalBorrowed={data.userState.totalBorrowedUsd}
        />
      )}

      {/* PM not active — show explainer */}
      {!isPM && <PMExplainerCard />}

      {/* User supply/borrow positions */}
      {isPM && data?.userState && (
        <>
          <PositionsSection
            title="Supplying"
            positions={data.userState.supplies}
            variant="supply"
          />
          <PositionsSection
            title="Borrowing"
            positions={data.userState.borrows}
            variant="borrow"
          />
        </>
      )}

      {/* Reserve rates — always visible */}
      <ReservesTable reserves={data?.reserves ?? []} />
    </div>
  );
}
