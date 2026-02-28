import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { SideCaption } from "../components/SideCaption";
import { MOCK_POSITIONS, MOCK_ASSETS, MOCK_TRADE, SCENE_CAPTIONS } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S03_TradePageZoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Phase 1: NVDA row highlight + tap (frames 0-20) --
  const highlightOpacity = interpolate(frame, [0, 8, 20], [0, 0.6, 0], CLAMP);

  // -- Phase 2: Page slide transition (frames 20-50) --
  const slideProgress = frame < 20
    ? 0
    : spring({ fps, frame: frame - 20, config: { damping: 15, mass: 0.8 } });

  const dashboardX = interpolate(slideProgress, [0, 1], [0, -393], CLAMP);
  const tradePageX = interpolate(slideProgress, [0, 1], [393, 0], CLAMP);

  // -- Zoom: start zoomed at 2.0 (from S02 end), zoom out to 1 (frames 0-30),
  //    then zoom into form area (frames 140-210) --
  const zoomOutProgress = frame < 0
    ? 0
    : interpolate(
        spring({ fps, frame, config: { damping: 15, mass: 0.8 } }),
        [0, 1], [0, 1], CLAMP,
      );

  const zoomInChartProgress = frame < 140
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 140, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );

  // Combine: zoom out from 2.0→1, then zoom in 1→2.2
  const zoom = interpolate(zoomOutProgress, [0, 1], [2.0, 1], CLAMP)
    + interpolate(zoomInChartProgress, [0, 1], [0, 1.2], CLAMP);

  const focusY =
    interpolate(zoomOutProgress, [0, 1], [200, 0], CLAMP)
    + interpolate(zoomInChartProgress, [0, 1], [0, -40], CLAMP);

  // Content scroll: scroll down to show form when zooming in (frames 140-180)
  const tradeScrollOffset = interpolate(frame, [140, 180], [0, -200], CLAMP);

  return (
    <>
    <PhoneScene alignment="right" zoom={zoom} focusX={0} focusY={focusY}>
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dashboard page (sliding out) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateX(${dashboardX}px)`,
          }}
        >
          <DashboardContent highlightOpacity={highlightOpacity} />
        </div>

        {/* Trade page (sliding in) — full page visible at once */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateX(${tradePageX}px)`,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <MockHeader />
            <div style={{ flex: 1, overflow: "hidden" }}>
              {/* Scrollable content wrapper */}
              <div
                style={{
                  transform: `translateY(${tradeScrollOffset}px)`,
                  padding: "8px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Back + Asset header */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: colors.textMuted, fontFamily: fonts.body, marginBottom: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Back
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: colors.surface2, overflow: "hidden" }}>
                      <img src={MOCK_TRADE.iconUrl} alt={MOCK_TRADE.asset} style={{ width: 32, height: 32 }} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                      {MOCK_TRADE.asset}
                    </div>
                  </div>
                </div>

                {/* Price display */}
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body, lineHeight: 1.1 }}>
                    ${MOCK_TRADE.currentPrice}
                  </div>
                  <div style={{ fontSize: 12, color: colors.long, fontFamily: fonts.body, marginTop: 2 }}>
                    ↑ {MOCK_TRADE.priceChange}
                  </div>
                </div>

                {/* Chart — large, prominent */}
                <div style={{ borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                  <LightweightChart
                    coin="xyz:NVDA"
                    drawStartFrame={50}
                    drawDuration={60}
                    width={361}
                    height={240}
                    mode="area"
                    minPoints={40}
                  />
                </div>

                {/* Time range buttons + candlestick icon */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["1H", "4H", "1D", "7D", "6M", "ALL"].map((label) => (
                      <div
                        key={label}
                        style={{
                          padding: "3px 8px",
                          borderRadius: 3,
                          fontSize: 10,
                          fontFamily: fonts.body,
                          backgroundColor: label === "7D" ? colors.surface3 : "transparent",
                          color: label === "7D" ? colors.textPrimary : colors.textMuted,
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  {/* Candlestick icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="4" width="2" height="8" rx="0.5" fill={colors.long} />
                    <rect x="3.75" y="2" width="0.5" height="2" fill={colors.long} />
                    <rect x="3.75" y="12" width="0.5" height="2" fill={colors.long} />
                    <rect x="7" y="5" width="2" height="6" rx="0.5" fill={colors.short} />
                    <rect x="7.75" y="3" width="0.5" height="2" fill={colors.short} />
                    <rect x="7.75" y="11" width="0.5" height="3" fill={colors.short} />
                    <rect x="11" y="3" width="2" height="7" rx="0.5" fill={colors.long} />
                    <rect x="11.75" y="1" width="0.5" height="2" fill={colors.long} />
                    <rect x="11.75" y="10" width="0.5" height="3" fill={colors.long} />
                  </svg>
                </div>

                {/* Market info bar */}
                <MockMarketInfoBar />

                {/* Trade form — initial empty state */}
                <MockTradeForm
                  visibleDigits={0}
                  leverageValue={5}
                  longActive={true}
                />
              </div>
            </div>
            <MockBottomNav />
          </div>
        </div>
      </div>
    </PhoneScene>
    <SideCaption
      heading={SCENE_CAPTIONS.tradePage.heading}
      bullets={[
        ...SCENE_CAPTIONS.tradePage.bullets,
        <span key="usd" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Unified USD Balance with</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {(["usdc", "usdh", "usdt", "usde"] as const).map((token) => (
              <img
                key={token}
                src={staticFile(`collateral/${token}.png`)}
                alt={token.toUpperCase()}
                style={{ width: 40, height: 40, borderRadius: "50%" }}
              />
            ))}
          </span>
        </span>,
      ]}
      startFrame={40}
      bulletsStartFrame={70}
    />
    </>
  );
};

/** Static dashboard content (end state from S02) */
const DashboardContent: React.FC<{ highlightOpacity: number }> = ({ highlightOpacity }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}
  >
    <MockHeader />
    <div
      style={{
        flex: 1,
        padding: "12px 16px",
        paddingBottom: 60,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <MockBalanceCard />
      <div style={{ backgroundColor: colors.surface2, border: `1px solid ${colors.border}`, borderRadius: 4, padding: "8px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, fontFamily: fonts.body }}>
            OPEN POSITIONS ({MOCK_POSITIONS.length})
          </span>
          <span style={{ fontSize: 11, color: colors.accent, fontFamily: fonts.body }}>View all</span>
        </div>
        {MOCK_POSITIONS.map((pos, i) => (
          <div key={pos.symbol} style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : undefined }}>
            <MockPositionRow position={pos} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.heading, marginTop: 2 }}>
        Markets
      </div>
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ transform: "translateY(-100px)" }}>
          {MOCK_ASSETS.map((asset) => (
            <div
              key={asset.symbol}
              style={{ borderBottom: `1px solid ${colors.border}`, position: "relative" }}
            >
              <MockAssetRow asset={asset} highlighted={asset.symbol === MOCK_TRADE.asset} />
              {asset.symbol === MOCK_TRADE.asset && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: colors.accent,
                    opacity: highlightOpacity * 0.15,
                    borderRadius: 4,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    <MockBottomNav />
  </div>
);
