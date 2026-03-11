import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useNetwork } from "../lib/network-context";
import { usePortfolio } from "../hooks/use-portfolio";
import { useTradeHistory } from "../hooks/use-trade-history";
import { useClosePosition } from "../hooks/use-trade";
import { ApiError } from "../lib/api";
import { DepositModal } from "../components/DepositModal";
import {
  collateralIconUrl,
  displayCoin,
  tokenIconUrl,
  tokenIconFallbackUrl,
  deployerIconUrl,
  getDeployer,
  showIconFallback,
} from "../lib/display";
import type {
  PortfolioBalanceRow,
  PortfolioFundingRow,
  PortfolioOpenOrderRow,
  PortfolioOrderHistoryRow,
  PortfolioPositionRow,
  PortfolioTradeRow,
  TradeHistoryItem,
  PortfolioViewMode,
} from "@shared/types";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(6);
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function formatTs(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "--";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortAddress(value: string): string {
  if (!value || value.length < 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function LabelValue({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-text-muted text-sm border-b border-dashed border-text-dim/60 leading-4">{label}</span>
      <span className={`text-sm ${accent ? "text-accent" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm uppercase tracking-wider text-text-muted">{title}</h3>
      {count !== undefined && <span className="text-xs text-text-dim">{count}</span>}
    </div>
  );
}

function SideTag({ side }: { side: string }) {
  const isLong = side === "buy" || side === "long";
  const isClose = side === "close-long" || side === "close-short";
  const label = isClose ? (side === "close-long" ? "close long" : "close short") : side;
  const colorClass = isClose
    ? "text-text-secondary"
    : isLong ? "text-long" : "text-short";
  return (
    <span className={`${colorClass} text-xs font-medium`}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-sm text-text-dim py-5 text-center bg-surface-1 border border-border">{text}</div>
  );
}

type SectionKey =
  | "balances"
  | "positions"
  | "openOrders"
  | "tradeHistory"
  | "fundingHistory"
  | "orderHistory"
  | "tradeIntents";

const PAGE_SIZE: Record<SectionKey, number> = {
  balances: 8,
  positions: 10,
  openOrders: 10,
  tradeHistory: 10,
  fundingHistory: 10,
  orderHistory: 10,
  tradeIntents: 10,
};

const INITIAL_PAGES: Record<SectionKey, number> = {
  balances: 1,
  positions: 1,
  openOrders: 1,
  tradeHistory: 1,
  fundingHistory: 1,
  orderHistory: 1,
  tradeIntents: 1,
};

interface PageSlice<T> {
  rows: T[];
  page: number;
  totalPages: number;
  totalRows: number;
  startRow: number;
  endRow: number;
}

function paginateRows<T>(rows: T[], page: number, pageSize: number): PageSlice<T> {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);

  return {
    rows: rows.slice(startIdx, endIdx),
    page: safePage,
    totalPages,
    totalRows,
    startRow: totalRows === 0 ? 0 : startIdx + 1,
    endRow: endIdx,
  };
}

function PaginationControls({
  pageInfo,
  onPageChange,
}: {
  pageInfo: PageSlice<unknown>;
  onPageChange: (next: number) => void;
}) {
  if (pageInfo.totalRows === 0 || pageInfo.totalPages <= 1) return null;

  return (
    <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
      <span>
        Showing {pageInfo.startRow}-{pageInfo.endRow} of {pageInfo.totalRows}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(pageInfo.page - 1)}
          disabled={pageInfo.page <= 1}
          className="px-2 py-1 border border-border bg-surface-2 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {pageInfo.page} / {pageInfo.totalPages}
        </span>
        <button
          onClick={() => onPageChange(pageInfo.page + 1)}
          disabled={pageInfo.page >= pageInfo.totalPages}
          className="px-2 py-1 border border-border bg-surface-2 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Map the balance row asset to the collateral icon coin.
 *  Perps "USD" is USDC-denominated on Hyperliquid. */
function balanceIconCoin(row: PortfolioBalanceRow): string {
  if (row.asset === "USD") return "USDC";
  return row.asset;
}

function MarketCell({ market, iconCoin }: { market: string; iconCoin?: string }) {
  const iconSymbol = iconCoin ?? market;
  const dexBadge = deployerIconUrl(iconSymbol);

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="relative w-6 h-6 shrink-0">
        <span className="w-6 h-6 rounded-full bg-surface-2 border border-border/60 overflow-hidden flex items-center justify-center">
          <img
            src={tokenIconUrl(iconSymbol)}
            alt={market}
            className="w-6 h-6"
            onError={(e) => {
              const el = e.currentTarget;
              const fallback = tokenIconFallbackUrl(iconSymbol);
              if (fallback && el.src !== fallback) {
                el.src = fallback;
                return;
              }
              showIconFallback(el, market, "text-[9px] font-bold text-text-muted");
            }}
          />
        </span>
        {dexBadge && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-surface-0 border border-border/80 overflow-hidden flex items-center justify-center">
            <img
              src={dexBadge}
              alt="Market"
              className="w-3.5 h-3.5 object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </span>
        )}
      </span>
      <span className="truncate leading-5">{market}</span>
    </span>
  );
}

function BalanceTable({ rows }: { rows: PortfolioBalanceRow[] }) {
  if (rows.length === 0) return <EmptyState text="No balances" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[320px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Asset</th>
            <th className="text-right px-3 py-2 font-medium">Amount</th>
            <th className="text-right px-3 py-2 font-medium">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const iconCoin = balanceIconCoin(row);
            return (
              <tr key={row.key} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-2 text-text-primary">
                  <span className="inline-flex items-center gap-2">
                    <img
                      src={collateralIconUrl(iconCoin)}
                      alt={displayCoin(iconCoin)}
                      className="w-5 h-5 rounded-full"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    {displayCoin(row.asset)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.amount)}</td>
                <td className="px-3 py-2 text-right text-text-primary">{formatUsd(row.usdValue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionsTable({
  rows,
  canClose,
  closingKey,
  onClose,
  iconCoinByKey,
}: {
  rows: PortfolioPositionRow[];
  canClose: boolean;
  closingKey: string | null;
  onClose: (row: PortfolioPositionRow) => void;
  iconCoinByKey: Map<string, string>;
}) {
  if (rows.length === 0) return <EmptyState text="No open positions" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[860px] table-fixed">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[7%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-right px-3 py-2 font-medium">Size</th>
            <th className="text-right px-3 py-2 font-medium">Entry</th>
            <th className="text-right px-3 py-2 font-medium">Mark</th>
            <th className="text-right px-3 py-2 font-medium">Notional</th>
            <th className="text-right px-3 py-2 font-medium">UPNL</th>
            <th className="text-right px-3 py-2 font-medium">Lev</th>
            <th className="text-right px-3 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isClosing = closingKey === row.key;
            const iconCoin = iconCoinByKey.get(row.key);
            return (
              <tr key={row.key} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-2 text-text-primary truncate">
                  <MarketCell market={row.market} iconCoin={iconCoin} />
                </td>
                <td className="px-3 py-2"><SideTag side={row.side} /></td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.size)}</td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatUsd(row.entryPrice)}</td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatUsd(row.markPrice)}</td>
                <td className="px-3 py-2 text-right text-text-primary">{formatUsd(row.notionalUsd)}</td>
                <td className={`px-3 py-2 text-right ${row.unrealizedPnlUsd >= 0 ? "text-long" : "text-short"}`}>
                  {formatUsd(row.unrealizedPnlUsd)}
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">{row.leverage.toFixed(2)}x</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onClose(row)}
                    disabled={!canClose || isClosing}
                    className="px-2 py-1 text-xs border border-border bg-surface-2 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canClose ? "Submit market close" : "Agent setup required"}
                  >
                    {isClosing ? "Closing..." : "Close"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpenOrdersTable({ rows }: { rows: PortfolioOpenOrderRow[] }) {
  if (rows.length === 0) return <EmptyState text="No open orders" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[780px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Time</th>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-right px-3 py-2 font-medium">Remaining</th>
            <th className="text-right px-3 py-2 font-medium">Limit</th>
            <th className="text-right px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 text-text-secondary">{formatTs(row.timestamp)}</td>
              <td className="px-3 py-2 text-text-primary max-w-[220px]">
                <MarketCell market={row.market} />
              </td>
              <td className="px-3 py-2"><SideTag side={row.side} /></td>
              <td className="px-3 py-2 text-text-secondary">{row.orderType}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.remainingSize)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatUsd(row.limitPrice)}</td>
              <td className="px-3 py-2 text-right text-text-primary">{formatUsd(row.notionalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ rows }: { rows: PortfolioTradeRow[] }) {
  if (rows.length === 0) return <EmptyState text="No recent trades" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[820px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Time</th>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-right px-3 py-2 font-medium">Size</th>
            <th className="text-right px-3 py-2 font-medium">Price</th>
            <th className="text-right px-3 py-2 font-medium">Fee</th>
            <th className="text-right px-3 py-2 font-medium">Realized PNL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 text-text-secondary">{formatTs(row.timestamp)}</td>
              <td className="px-3 py-2 text-text-primary">{row.market}</td>
              <td className="px-3 py-2"><SideTag side={row.side} /></td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.size)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatUsd(row.feeUsd)}</td>
              <td className={`px-3 py-2 text-right ${row.realizedPnlUsd >= 0 ? "text-long" : "text-short"}`}>
                {formatUsd(row.realizedPnlUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FundingTable({ rows }: { rows: PortfolioFundingRow[] }) {
  if (rows.length === 0) return <EmptyState text="No funding history" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[760px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Time</th>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-right px-3 py-2 font-medium">Funding Rate</th>
            <th className="text-right px-3 py-2 font-medium">Position</th>
            <th className="text-right px-3 py-2 font-medium">Funding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 text-text-secondary">{formatTs(row.timestamp)}</td>
              <td className="px-3 py-2 text-text-primary">{row.market}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatPct(row.fundingRate)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.positionSize)}</td>
              <td className={`px-3 py-2 text-right ${row.fundingUsd >= 0 ? "text-long" : "text-short"}`}>
                {formatUsd(row.fundingUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderHistoryTable({ rows }: { rows: PortfolioOrderHistoryRow[] }) {
  if (rows.length === 0) return <EmptyState text="No order history" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[900px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Updated</th>
            <th className="text-left px-3 py-2 font-medium">Market</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-right px-3 py-2 font-medium">Size</th>
            <th className="text-right px-3 py-2 font-medium">Filled</th>
            <th className="text-right px-3 py-2 font-medium">Limit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 text-text-secondary">{formatTs(row.statusTimestamp)}</td>
              <td className="px-3 py-2 text-text-primary">{row.market}</td>
              <td className="px-3 py-2"><SideTag side={row.side} /></td>
              <td className="px-3 py-2 text-text-secondary">{row.status}</td>
              <td className="px-3 py-2 text-text-secondary">{row.orderType}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.size)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatCompact(row.filledSize)}</td>
              <td className="px-3 py-2 text-right text-text-secondary">{formatUsd(row.limitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeIntentHistoryTable({ rows }: { rows: TradeHistoryItem[] }) {
  if (rows.length === 0) return <EmptyState text="No clicked trade intents yet" />;

  return (
    <div className="overflow-x-auto border border-border bg-surface-1">
      <table className="w-full text-sm min-w-[1080px] table-fixed">
        <thead className="text-xs text-text-muted border-b border-border bg-surface-2">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Clicked</th>
            <th className="text-left px-3 py-2 font-medium">Asset</th>
            <th className="text-left px-3 py-2 font-medium">Side</th>
            <th className="text-left px-3 py-2 font-medium">Mode</th>
            <th className="text-left px-3 py-2 font-medium">Leverage</th>
            <th className="text-left px-3 py-2 font-medium">Signer</th>
            <th className="text-right px-3 py-2 font-medium">Filled</th>
            <th className="text-left px-3 py-2 font-medium">Route</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const routeText = row.routeSummary.legs
              .map((leg) => `${leg.coin} ${(leg.proportion * 100).toFixed(0)}%`)
              .join(" · ");
            const leverageText = row.leverage
              ? `${row.leverage}x ${row.isCross === false ? "isolated" : "cross"}`
              : "--";
            const signerText = `${row.signerType === "agent" ? "agent" : "master"} ${shortAddress(row.signerAddress)}`;
            const statusText = row.success ? "success" : "failed";
            const statusClass = row.success ? "text-long" : "text-short";
            const filledTotal = row.legs.reduce((sum, leg) => sum + toNum(leg.filledSize), 0);
            return (
              <tr key={row.intentId} className="border-b border-border/60 last:border-b-0 align-top">
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{formatTs(row.createdAt)}</td>
                <td className="px-3 py-2 text-text-primary whitespace-nowrap">{row.asset}</td>
                <td className="px-3 py-2"><SideTag side={row.side} /></td>
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{row.mode}</td>
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{leverageText}</td>
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{signerText}</td>
                <td className="px-3 py-2 text-right text-text-primary whitespace-nowrap">{formatCompact(filledTotal)}</td>
                <td className="px-3 py-2 text-text-secondary min-w-[280px]">{routeText || "--"}</td>
                <td className="px-3 py-2">
                  <div className={`${statusClass} whitespace-nowrap`}>{statusText}</div>
                  {row.error && <div className="text-[11px] text-short max-w-[220px] truncate">{row.error}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioPage() {
  const navigate = useNavigate();
  const { address, isConnected, connect, isConnecting, error } = useWallet();
  const auth = useAuthSession();
  const { network } = useNetwork();
  const { data, isLoading, error: portfolioError } = usePortfolio(address, network);
  const { data: tradeHistoryData, isLoading: tradeHistoryLoading } = useTradeHistory(address, network, 75);
  const closeMutation = useClosePosition();
  const [viewMode, setViewMode] = useState<PortfolioViewMode>("aggregate");
  const [pages, setPages] = useState<Record<SectionKey, number>>(INITIAL_PAGES);
  const [showDeposit, setShowDeposit] = useState(false);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const aggregatePositionIconByKey = useMemo(() => {
    const out = new Map<string, string>();
    if (!data) return out;

    const scored = new Map<string, { score: number; notionalUsd: number; market: string }>();
    for (const row of data.positions.breakdown) {
      const key = `${row.baseAsset}:${row.side}`;
      const hasDeployer = Boolean(getDeployer(row.market));
      const hasKnownDeployerIcon = Boolean(deployerIconUrl(row.market));
      const score = hasKnownDeployerIcon ? 3 : hasDeployer ? 2 : 1;
      const current = scored.get(key);
      if (!current || score > current.score || (score === current.score && row.notionalUsd > current.notionalUsd)) {
        scored.set(key, {
          score,
          notionalUsd: row.notionalUsd,
          market: row.market,
        });
      }
    }

    for (const [key, value] of scored.entries()) {
      out.set(key, value.market);
    }

    return out;
  }, [data]);

  const viewData = useMemo(() => {
    if (!data) return null;
    return {
      balances: data.balances[viewMode],
      positions: data.positions[viewMode],
      openOrders: data.openOrders[viewMode],
      tradeHistory: data.tradeHistory[viewMode],
      fundingHistory: data.fundingHistory[viewMode],
      orderHistory: data.orderHistory[viewMode],
    };
  }, [data, viewMode]);

  useEffect(() => {
    setPages(INITIAL_PAGES);
  }, [viewMode, address, network]);

  const tradeIntentItems = tradeHistoryData?.items ?? [];

  const pagedData = useMemo(() => {
    if (!viewData) return null;

    return {
      balances: paginateRows(viewData.balances, pages.balances, PAGE_SIZE.balances),
      positions: paginateRows(viewData.positions, pages.positions, PAGE_SIZE.positions),
      openOrders: paginateRows(viewData.openOrders, pages.openOrders, PAGE_SIZE.openOrders),
      tradeHistory: paginateRows(viewData.tradeHistory, pages.tradeHistory, PAGE_SIZE.tradeHistory),
      fundingHistory: paginateRows(viewData.fundingHistory, pages.fundingHistory, PAGE_SIZE.fundingHistory),
      orderHistory: paginateRows(viewData.orderHistory, pages.orderHistory, PAGE_SIZE.orderHistory),
      tradeIntents: paginateRows(tradeIntentItems, pages.tradeIntents, PAGE_SIZE.tradeIntents),
    };
  }, [viewData, pages, tradeIntentItems]);

  if (!isConnected) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary">Portfolio</h1>
          <p className="text-sm text-text-muted">Connect your wallet to view balances, positions, and history.</p>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="bg-accent hover:bg-accent/90 disabled:opacity-50 px-6 py-2.5 text-sm font-semibold text-surface-0 transition-colors"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
          {error && <div className="text-xs text-short">{error}</div>}
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Sign in required</h2>
          <p className="text-sm text-text-muted">
            Portfolio data requires an authenticated session.
          </p>
          <button
            onClick={() => { void auth.signIn(); }}
            className="bg-accent hover:bg-accent/90 px-6 py-2.5 text-sm font-semibold text-surface-0 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !viewData || !pagedData || !data) {
    return (
      <div className="px-4 py-4 space-y-4">
        <div className="h-40 bg-surface-1 border border-border animate-pulse" />
        <div className="h-56 bg-surface-1 border border-border animate-pulse" />
        <div className="h-56 bg-surface-1 border border-border animate-pulse" />
      </div>
    );
  }

  if (portfolioError) {
    return (
      <div className="px-4 py-8">
        <div className="bg-short-muted border border-short/20 p-4 text-sm text-short">
          {portfolioError.message}
        </div>
      </div>
    );
  }

  async function handleClosePosition(row: PortfolioPositionRow): Promise<void> {
    if (!address || !data?.agentConfigured || row.size <= 0) return;
    setCloseError(null);
    setClosingKey(row.key);
    try {
      const result = await closeMutation.mutateAsync({
        network,
        masterAddress: address,
        asset: row.baseAsset,
        coin: row.market,
      });
      if (!result.success) {
        const legErrors = result.legs
          .filter((leg) => leg.error)
          .map((leg) => `${leg.market}: ${leg.error}`)
          .join(" | ");
        throw new Error(legErrors || result.error || "Close order did not fill.");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "AGENT_NOT_APPROVED") {
        setCloseError("Agent wallet is not approved for trading. Redirecting to Setup.");
        navigate("/setup");
        return;
      }
      setCloseError(err instanceof Error ? err.message : String(err));
    } finally {
      setClosingKey(null);
    }
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Portfolio</h1>
          <p className="text-xs text-text-muted mt-1">{data.agentConfigured ? "Agent enabled" : "Wallet-only mode"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeposit(true)}
            className="bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent transition-colors"
          >
            Deposit
          </button>
        <div className="inline-flex bg-surface-2 border border-border p-0.5">
          <button
            onClick={() => setViewMode("aggregate")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "aggregate" ? "bg-surface-3 text-text-primary" : "text-text-muted"
            }`}
          >
            Aggregate
          </button>
          <button
            onClick={() => setViewMode("breakdown")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "breakdown" ? "bg-surface-3 text-text-primary" : "text-text-muted"
            }`}
          >
            Breakdown
          </button>
        </div>
        </div>
      </div>

      {/* Deposit QR modal */}
      {showDeposit && address && (
        <DepositModal
          address={address}
          onClose={() => setShowDeposit(false)}
        />
      )}

      <div>
        <SectionTitle title="Balances" count={viewData.balances.length} />
        <BalanceTable rows={pagedData.balances.rows} />
        <PaginationControls
          pageInfo={pagedData.balances}
          onPageChange={(next) => setPages((prev) => ({ ...prev, balances: next }))}
        />
      </div>

      <div>
        <SectionTitle title="Positions" count={viewData.positions.length} />
        <PositionsTable
          rows={pagedData.positions.rows}
          canClose={data.agentConfigured}
          closingKey={closingKey}
          onClose={handleClosePosition}
          iconCoinByKey={aggregatePositionIconByKey}
        />
        {!data.agentConfigured && viewData.positions.length > 0 && (
          <div className="mt-2 text-xs text-text-dim">
            Configure an agent in setup to enable one-click close from this table.
          </div>
        )}
        {closeError && (
          <div className="mt-2 bg-short/10 border border-short/20 px-3 py-2 text-xs text-short">
            {closeError}
          </div>
        )}
        <PaginationControls
          pageInfo={pagedData.positions}
          onPageChange={(next) => setPages((prev) => ({ ...prev, positions: next }))}
        />
      </div>

      <div className="bg-surface-1 border border-border p-4">
        <div className="text-xl text-text-primary mb-2">Account Equity</div>
        <LabelValue label="Total" value={formatUsd(data.summary.accountEquityUsd)} accent />
        <LabelValue label="Spot" value={formatUsd(data.summary.spotUsd)} />
        <LabelValue label="Perps" value={formatUsd(data.summary.perpsUsd)} />

        <div className="text-xl text-text-primary mt-4 mb-2">Perps Overview</div>
        <LabelValue label="Account Value" value={formatUsd(data.summary.perpsUsd)} />
        <LabelValue label="Unrealized PNL" value={formatUsd(data.summary.unrealizedPnlUsd)} />
        <LabelValue label="Cross Margin Ratio" value={formatPct(data.summary.crossMarginRatio)} accent />
        <LabelValue label="Maintenance Margin" value={formatUsd(data.summary.maintenanceMarginUsd)} />
        <LabelValue label="Cross Account Leverage" value={`${data.summary.crossAccountLeverage.toFixed(2)}x`} />
      </div>

      <div>
        <SectionTitle title="Open Orders" count={viewData.openOrders.length} />
        <OpenOrdersTable rows={pagedData.openOrders.rows} />
        <PaginationControls
          pageInfo={pagedData.openOrders}
          onPageChange={(next) => setPages((prev) => ({ ...prev, openOrders: next }))}
        />
      </div>

      <div>
        <SectionTitle title="Trade History" count={viewData.tradeHistory.length} />
        <TradesTable rows={pagedData.tradeHistory.rows} />
        <PaginationControls
          pageInfo={pagedData.tradeHistory}
          onPageChange={(next) => setPages((prev) => ({ ...prev, tradeHistory: next }))}
        />
      </div>

      <div>
        <SectionTitle title="Funding History" count={viewData.fundingHistory.length} />
        <FundingTable rows={pagedData.fundingHistory.rows} />
        <PaginationControls
          pageInfo={pagedData.fundingHistory}
          onPageChange={(next) => setPages((prev) => ({ ...prev, fundingHistory: next }))}
        />
      </div>

      <div>
        <SectionTitle title="Order History" count={viewData.orderHistory.length} />
        <OrderHistoryTable rows={pagedData.orderHistory.rows} />
        <PaginationControls
          pageInfo={pagedData.orderHistory}
          onPageChange={(next) => setPages((prev) => ({ ...prev, orderHistory: next }))}
        />
      </div>

      <div>
        <SectionTitle
          title="Clicked Trade Intents"
          count={tradeIntentItems.length}
        />
        {tradeHistoryLoading
          ? <div className="h-32 bg-surface-1 border border-border animate-pulse" />
          : <TradeIntentHistoryTable rows={pagedData.tradeIntents.rows} />}
        <PaginationControls
          pageInfo={pagedData.tradeIntents}
          onPageChange={(next) => setPages((prev) => ({ ...prev, tradeIntents: next }))}
        />
      </div>

      <div className="text-xs text-text-dim text-right">
        Last updated {formatTs(data.requestedAt)} • <Link to="/markets" className="text-accent">Back to markets</Link>
      </div>
    </div>
  );
}
