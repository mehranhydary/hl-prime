import { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useBootstrap } from "../hooks/use-bootstrap";
import { useNetwork } from "../lib/network-context";
import { useCandles } from "../hooks/use-candles";
import { TradeForm } from "../components/TradeForm";
import { CandleChart } from "../components/CandleChart";
import { MarketInfo } from "../components/MarketInfo";
import { displayCoin, displayAsset, tokenIconUrl, tokenIconFallbackUrl, showIconFallback } from "../lib/display";
import type { CandleInterval } from "@shared/types";

function formatPrice(price: number): string {
  return price >= 1
    ? price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toPrecision(4);
}

function formatChange(current: number | null, prev: number | null): { text: string; cls: string } {
  if (current === null || prev === null || prev === 0) return { text: "--", cls: "text-text-muted" };
  const pct = ((current - prev) / prev) * 100;
  const arrow = pct >= 0 ? "\u2191" : "\u2193";
  return {
    text: `${arrow} ${Math.abs(pct).toFixed(2)}%`,
    cls: pct >= 0 ? "text-long" : "text-short",
  };
}

type Tab = "trade" | "info";

export function TradePage() {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { address } = useWallet();
  const auth = useAuthSession();
  const { network } = useNetwork();
  const { data: bootstrap } = useBootstrap(address, network);

  const [candleInterval, setCandleInterval] = useState<CandleInterval>("1h");
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("trade");
  const handleHoverPrice = useCallback((p: number | null) => setHoverPrice(p), []);

  const assetData = bootstrap?.assets.find(
    (a) => a.baseAsset.toUpperCase() === asset?.toUpperCase(),
  );

  // Use the primaryCoin for candle data (e.g. "ETH" for native, "xyz:TSLA" for HIP-3)
  const candleCoin = assetData?.primaryCoin ?? asset;
  const { data: candles } = useCandles(candleCoin, candleInterval, network);

  const change = useMemo(() => {
    if (candles && candles.length > 1) {
      let earliest = candles[0];
      let latest = candles[0];

      for (const candle of candles) {
        if (candle.time < earliest.time) earliest = candle;
        if (candle.time > latest.time) latest = candle;
      }

      return formatChange(latest.close, earliest.open);
    }

    if (!assetData) return null;
    return formatChange(assetData.price, assetData.prevDayPx);
  }, [candles, assetData]);

  if (address && !auth.isAuthenticated) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Sign in required</h2>
          <p className="text-sm text-text-muted">
            Sign in to request quotes and execute trades.
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

  return (
    <div className="px-4 py-4 pb-24">
      {/* Asset header — always reserves height for icon + price */}
      <div className="mb-4">
        <button
          onClick={() => navigate("/markets")}
          className="text-text-muted hover:text-text-primary transition-colors mb-3 flex items-center gap-1 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center overflow-hidden shrink-0">
            {assetData ? (
              <img
                src={tokenIconUrl(assetData.primaryCoin)}
                alt={asset}
                className="w-10 h-10"
                onError={(e) => {
                  const el = e.currentTarget;
                  const fallback = tokenIconFallbackUrl(assetData.primaryCoin);
                  if (fallback && el.src !== fallback) {
                    el.src = fallback;
                    return;
                  }
                  showIconFallback(el, asset ?? "", "text-sm font-bold text-text-muted");
                }}
              />
            ) : (
              <span className="text-sm font-bold text-text-muted">{(asset ?? "").slice(0, 2)}</span>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold text-text-primary">{displayAsset(assetData?.baseAsset ?? asset?.toUpperCase() ?? "")}</div>
          </div>
        </div>

        {/* Price — always reserves line height */}
        <div className="flex items-baseline gap-3 h-9">
          {assetData?.price ? (
            <>
              <span className="text-3xl font-bold text-text-primary">
                ${formatPrice(hoverPrice ?? assetData.price)}
              </span>
              {!hoverPrice && change && (
                <span className={`text-sm font-medium ${change.cls}`}>
                  {change.text}
                </span>
              )}
            </>
          ) : (
            <span className="text-3xl font-bold text-text-dim">--</span>
          )}
        </div>
      </div>

      {/* Candle chart — always reserves space (280px chart + 32px controls) */}
      <div className="mb-4">
        {candles && candles.length > 0 ? (
          <CandleChart
            data={candles}
            interval={candleInterval}
            onIntervalChange={setCandleInterval}
            onHoverPrice={handleHoverPrice}
          />
        ) : (
          <div className="w-full bg-surface-1 rounded-sm" style={{ height: 312 }} />
        )}
      </div>

      {/* Market info bar — always reserves height */}
      <div className="flex gap-5 text-xs mb-4 pb-4 border-b border-border min-h-[40px]">
        {assetData ? (
          <>
            {assetData.fundingRate !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-text-muted uppercase tracking-wider">Funding</span>
                <span className="text-text-secondary">
                  {(assetData.fundingRate * 100).toFixed(4)}%
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted uppercase tracking-wider">Markets</span>
              <span className="text-text-secondary">{assetData.marketCount}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted uppercase tracking-wider">Collateral</span>
              <span className="text-text-secondary">
                {assetData.collaterals.map(displayCoin).join(", ")}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted uppercase tracking-wider">Funding</span>
              <span className="text-text-dim">--</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted uppercase tracking-wider">Markets</span>
              <span className="text-text-dim">--</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-text-muted uppercase tracking-wider">Collateral</span>
              <span className="text-text-dim">--</span>
            </div>
          </>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-5">
        <button
          onClick={() => setActiveTab("trade")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "trade"
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Trade
          {activeTab === "trade" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "info"
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Info
          {activeTab === "info" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
      </div>

      {/* Tab content — w-full + min-w-0 prevents content from affecting container width */}
      <div className="w-full min-w-0">
        {activeTab === "trade" ? (
          <TradeForm asset={asset ?? ""} currentPrice={assetData?.price ?? null} maxLeverage={assetData?.maxLeverage ?? 50} />
        ) : (
          <MarketInfo asset={assetData ?? null} />
        )}
      </div>
    </div>
  );
}
