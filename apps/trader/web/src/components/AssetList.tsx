import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { tokenIconUrl, tokenIconFallbackUrl, showIconFallback } from "../lib/display";
import type { DedupedAsset } from "@shared/types";

interface AssetListProps {
  assets: DedupedAsset[];
}

function formatPrice(price: number | null): string {
  if (price === null) return "--";
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toPrecision(4);
}

function formatChange(current: number | null, prev: number | null): { text: string; cls: string } {
  if (current === null || prev === null || prev === 0) return { text: "--", cls: "text-text-muted" };
  const pct = ((current - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(2)}%`,
    cls: pct >= 0 ? "text-long" : "text-short",
  };
}

const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  ARB: "Arbitrum",
  OP: "Optimism",
  MATIC: "Polygon",
  SUI: "Sui",
  APT: "Aptos",
  SEI: "Sei",
  TIA: "Celestia",
  INJ: "Injective",
  FIL: "Filecoin",
  ATOM: "Cosmos",
  DOT: "Polkadot",
  ADA: "Cardano",
  XRP: "Ripple",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  NEAR: "Near Protocol",
  FTM: "Fantom",
  RUNE: "THORChain",
  MKR: "Maker",
  AAVE: "Aave",
  UNI: "Uniswap",
  CRV: "Curve",
  LDO: "Lido",
  PENDLE: "Pendle",
  WIF: "dogwifhat",
  PEPE: "Pepe",
  BONK: "Bonk",
  SHIB: "Shiba Inu",
  FLOKI: "Floki",
  TSLA: "Tesla",
  AAPL: "Apple",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  MSFT: "Microsoft",
  META: "Meta",
  NVDA: "Nvidia",
  AMD: "AMD",
  NFLX: "Netflix",
  COIN: "Coinbase",
  MSTR: "MicroStrategy",
  GME: "GameStop",
  AMC: "AMC",
  SPY: "S&P 500",
  QQQ: "Nasdaq 100",
  GLD: "Gold",
  SLV: "Silver",
  USO: "Oil",
  TLT: "US Treasuries",
  PURR: "Purr",
  HYPE: "Hyperliquid",
  JEFF: "Jeff",
  kPEPE: "Pepe (1K)",
  kBONK: "Bonk (1K)",
  kSHIB: "Shiba (1K)",
  kFLOKI: "Floki (1K)",
};

function getAssetName(baseAsset: string): string {
  return ASSET_NAMES[baseAsset] ?? baseAsset;
}

function formatVolume(vlm: number): string {
  if (vlm >= 1_000_000_000) return `$${(vlm / 1_000_000_000).toFixed(1)}B`;
  if (vlm >= 1_000_000) return `$${(vlm / 1_000_000).toFixed(1)}M`;
  if (vlm >= 1_000) return `$${(vlm / 1_000).toFixed(1)}K`;
  if (vlm > 0) return `$${vlm.toFixed(0)}`;
  return "--";
}


const ROW_HEIGHT = 56; // px — fixed row height to prevent layout shift
const DIVIDER_HEIGHT = 40; // px — HIP-3 divider height

export function AssetList({ assets }: AssetListProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(0);

  const isSearching = search.length > 0;

  const filtered = useMemo(() => {
    let list = assets;
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((a) => a.baseAsset.toUpperCase().includes(q));
    }
    // Sort: crypto (native) first, then HIP-3; within each section by volume desc
    return [...list].sort((a, b) => {
      if (a.isHip3 !== b.isHip3) return a.isHip3 ? 1 : -1;
      return b.dayNtlVlm - a.dayNtlVlm;
    });
  }, [assets, search]);

  // Capture the natural height of the unfiltered list so the container
  // doesn't collapse when searching (prevents scroll-jump).
  useLayoutEffect(() => {
    if (!isSearching && listRef.current) {
      setMinHeight(listRef.current.offsetHeight);
    }
  }, [assets, isSearching]);

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-1 border border-border rounded-sm pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/40 transition-colors"
        />
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_3.75rem] sm:grid-cols-[minmax(0,1fr)_6rem_5rem_5rem] gap-2 sm:gap-4 px-3 py-2 text-[11px] text-text-muted uppercase tracking-widest">
        <span>Asset</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
        <span className="hidden sm:block text-right">Volume</span>
      </div>

      {/* Asset rows */}
      <div
        ref={listRef}
        className="flex flex-col"
        style={{ minHeight: isSearching ? minHeight : undefined }}
      >
        {filtered.map((asset, i) => {
          const change = formatChange(asset.price, asset.prevDayPx);
          const prevAsset = i > 0 ? filtered[i - 1] : null;
          const showHip3Divider = !isSearching && asset.isHip3 && (!prevAsset || !prevAsset.isHip3);

          return (
            <div key={asset.baseAsset}>
              {showHip3Divider && (
                <div className="flex items-center gap-2 px-3" style={{ height: DIVIDER_HEIGHT }}>
                  <span className="text-[11px] text-text-muted uppercase tracking-widest">HIP-3 Markets</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <button
                onClick={() => navigate(`/trade/${asset.baseAsset}`)}
                className="w-full cursor-pointer grid grid-cols-[minmax(0,1fr)_4.75rem_3.75rem] sm:grid-cols-[minmax(0,1fr)_6rem_5rem_5rem] gap-2 sm:gap-4 px-3 items-center text-left group hover:bg-surface-1 transition-colors border border-transparent hover:border-border"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Coin icon */}
                  <div className="w-8 h-8 shrink-0 rounded-full bg-surface-2 flex items-center justify-center overflow-hidden">
                    <img
                      src={tokenIconUrl(asset.primaryCoin)}
                      alt={asset.baseAsset}
                      className="w-8 h-8"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const fallback = tokenIconFallbackUrl(asset.primaryCoin);
                        if (fallback && el.src !== fallback) {
                          el.src = fallback;
                          return;
                        }
                        showIconFallback(el, asset.baseAsset, "text-xs font-bold text-text-muted");
                      }}
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm text-text-primary whitespace-nowrap pr-0.5">
                        {asset.baseAsset}
                      </span>
                      {asset.hasPosition && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Has position" />
                      )}
                    </div>
                    <span className="text-[11px] text-text-muted leading-tight truncate pr-1">
                      {getAssetName(asset.baseAsset)}
                    </span>
                  </div>
                </div>
                <span className="text-right text-sm text-text-primary">
                  ${formatPrice(asset.price)}
                </span>
                <span className={`text-right text-sm ${change.cls}`}>
                  {change.text}
                </span>
                <span className="hidden sm:block text-right text-sm text-text-muted">
                  {formatVolume(asset.dayNtlVlm)}
                </span>
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-muted text-sm">
            {search ? "No assets matching search" : "Loading assets..."}
          </div>
        )}
      </div>
    </div>
  );
}
