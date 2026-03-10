import { displayCoin, deployerIconByName, showIconFallback } from "../lib/display";
import type { DedupedAsset } from "@shared/types";

interface MarketInfoProps {
  asset: DedupedAsset | null;
}

function formatVolume(vlm: number): string {
  if (vlm >= 1_000_000_000) return `$${(vlm / 1_000_000_000).toFixed(2)}B`;
  if (vlm >= 1_000_000) return `$${(vlm / 1_000_000).toFixed(2)}M`;
  if (vlm >= 1_000) return `$${(vlm / 1_000).toFixed(1)}K`;
  if (vlm > 0) return `$${vlm.toFixed(0)}`;
  return "--";
}

function BarStat({ label, left, right, leftColor, rightColor }: {
  label: string;
  left: string;
  right: string;
  leftColor: string;
  rightColor: string;
}) {
  const leftNum = parseFloat(left.replace(/[^0-9.]/g, "")) || 0;
  const rightNum = parseFloat(right.replace(/[^0-9.]/g, "")) || 0;
  const total = leftNum + rightNum;
  const leftPct = total > 0 ? (leftNum / total) * 100 : 50;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className={leftColor}>{left}</span>
        <span className="text-text-dim text-[10px] uppercase tracking-wider">{label}</span>
        <span className={rightColor}>{right}</span>
      </div>
      <div className="h-1 bg-surface-3 rounded-full overflow-hidden flex">
        <div className={`${leftColor === "text-long" ? "bg-long" : "bg-accent"} rounded-l-full`} style={{ width: `${leftPct}%` }} />
        <div className={`${rightColor === "text-short" ? "bg-short" : "bg-loss"} rounded-r-full flex-1`} />
      </div>
    </div>
  );
}

function Row({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5">
      <span className="text-text-muted text-sm">{label}</span>
      {valueNode ?? <span className="text-text-primary text-sm font-medium">{value}</span>}
    </div>
  );
}

function DeployerIcons({ deployers }: { deployers: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {deployers.map((d) => {
        const icon = deployerIconByName(d);
        return (
          <div
            key={d}
            className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center overflow-hidden shrink-0"
            title={d === "HL" ? "Hyperliquid" : d}
          >
            {icon ? (
              <img
                src={icon}
                alt={d}
                className="w-5 h-5 object-cover"
                onError={(e) => {
                  const el = e.currentTarget;
                  showIconFallback(el, d, "text-[7px] font-bold text-text-muted");
                }}
              />
            ) : (
              <span className="text-[7px] font-bold text-text-muted">{d}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MarketInfo({ asset }: MarketInfoProps) {
  if (!asset) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        Loading market data...
      </div>
    );
  }

  const fundingRate = asset.fundingRate !== null
    ? `${(asset.fundingRate * 100).toFixed(4)}%`
    : "--";

  const fundingColor = asset.fundingRate !== null
    ? asset.fundingRate >= 0 ? "text-long" : "text-short"
    : "text-text-muted";

  const price24hAgo = asset.prevDayPx ?? 0;
  const currentPrice = asset.price ?? 0;
  const change24h = price24hAgo > 0
    ? ((currentPrice - price24hAgo) / price24hAgo * 100).toFixed(2)
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Market Overview */}
      <div className="space-y-0">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Market Overview</div>
        <div className="bg-surface-1 rounded-sm divide-y divide-border/30 px-3">
          <Row label="Asset" value={asset.baseAsset} />
          <Row label="Type" value={asset.isHip3 ? "HIP-3" : "Native Perp"} />
          <Row
            label="Available Markets"
            valueNode={<DeployerIcons deployers={asset.deployers} />}
          />
          <Row
            label="Collateral"
            value={asset.collaterals.map(displayCoin).join(", ")}
          />
        </div>
      </div>

      {/* Trading Activity */}
      <div className="space-y-3">
        <div className="text-[10px] text-text-muted uppercase tracking-widest">Trading Activity</div>

        <BarStat
          label="24h Volume"
          left={formatVolume(asset.dayNtlVlm / 2)}
          right={formatVolume(asset.dayNtlVlm / 2)}
          leftColor="text-long"
          rightColor="text-short"
        />

        <div className="bg-surface-1 rounded-sm divide-y divide-border/30 px-3">
          <Row label="24h Volume" value={formatVolume(asset.dayNtlVlm)} />
          {change24h !== null && (
            <div className="flex justify-between py-2.5">
              <span className="text-text-muted text-sm">24h Change</span>
              <span className={`text-sm font-medium ${parseFloat(change24h) >= 0 ? "text-long" : "text-short"}`}>
                {parseFloat(change24h) >= 0 ? "+" : ""}{change24h}%
              </span>
            </div>
          )}
          <div className="flex justify-between py-2.5">
            <span className="text-text-muted text-sm">Funding Rate</span>
            <span className={`text-sm font-medium ${fundingColor}`}>
              {fundingRate}
            </span>
          </div>
        </div>
      </div>

      {/* Position Info */}
      <div className="space-y-0">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Position</div>
        <div className="bg-surface-1 rounded-sm p-4">
          {asset.hasPosition ? (
            <div className="text-sm text-accent font-medium">Active position on this asset</div>
          ) : (
            <div className="text-sm text-text-dim">No open position</div>
          )}
        </div>
      </div>

      {/* Risk Info */}
      <div className="space-y-0">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Trading Info</div>
        <div className="bg-surface-1 rounded-sm divide-y divide-border/30 px-3">
          <Row label="Max Leverage" value={`${asset.maxLeverage}x`} />
          <Row label="Margin Mode" value="Cross" />
          <Row label="Smart Routing" value={asset.marketCount > 1 ? "Multi-leg" : "Single-leg"} />
        </div>
      </div>
    </div>
  );
}
