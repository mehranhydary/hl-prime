import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp, slideFromRight } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MOCK_POSITIONS, MOCK_ASSETS, MOCK_TRADE } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S03_TradePageZoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Phase 1: ETH row highlight + tap (frames 0-20) --
  const highlightOpacity = interpolate(frame, [0, 8, 20], [0, 0.6, 0], CLAMP);

  // -- Phase 2: Page slide transition (frames 20-50) --
  const slideProgress = frame < 20
    ? 0
    : spring({ fps, frame: frame - 20, config: { damping: 15, mass: 0.8 } });

  const dashboardX = interpolate(slideProgress, [0, 1], [0, -393], CLAMP);
  const tradePageX = interpolate(slideProgress, [0, 1], [393, 0], CLAMP);

  // -- Phase 3: Trade page content builds (frames 50-140) --
  const headerX = slideFromRight(fps, frame, 50, 200);
  const priceOpacity = fadeIn(frame, 60, 15);
  const priceY = slideUp(fps, frame, 60, 15);
  const changeOpacity = fadeIn(frame, 65, 12);
  const timeButtonsOpacity = fadeIn(frame, 130, 15);
  const infoBarOpacity = fadeIn(frame, 140, 15);
  const infoBarY = slideUp(fps, frame, 140, 20);

  // -- Zoom: start zoomed at 1.8 (from S02), zoom out to 1 (frames 0-30), then zoom into chart (frames 140-210) --
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

  // Combine: zoom out from 1.8→1, then zoom in 1→2.2
  const zoom = interpolate(zoomOutProgress, [0, 1], [1.8, 1], CLAMP)
    + interpolate(zoomInChartProgress, [0, 1], [0, 1.2], CLAMP);

  const focusY =
    interpolate(zoomOutProgress, [0, 1], [120, 0], CLAMP)
    + interpolate(zoomInChartProgress, [0, 1], [0, -40], CLAMP);

  return (
    <PhoneScene zoom={zoom} focusX={0} focusY={focusY}>
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

        {/* Trade page (sliding in) */}
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
            <div
              style={{
                flex: 1,
                padding: "12px 16px",
                paddingBottom: 60,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                overflow: "hidden",
              }}
            >
              {/* Back + Asset header */}
              <div style={{ transform: `translateX(${headerX}px)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: colors.textMuted, fontFamily: fonts.body, marginBottom: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: colors.surface2, overflow: "hidden" }}>
                    <img src={MOCK_TRADE.iconUrl} alt={MOCK_TRADE.asset} style={{ width: 36, height: 36 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                      {MOCK_TRADE.asset}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.body }}>
                      {MOCK_TRADE.assetName}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price display */}
              <div style={{ opacity: priceOpacity, transform: `translateY(${priceY}px)` }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body, lineHeight: 1.1 }}>
                  ${MOCK_TRADE.currentPrice}
                </div>
                <div style={{ fontSize: 13, color: colors.long, fontFamily: fonts.body, marginTop: 2, opacity: changeOpacity }}>
                  {MOCK_TRADE.priceChange}
                </div>
              </div>

              {/* Chart */}
              <div style={{ borderRadius: 4, overflow: "hidden" }}>
                <LightweightChart
                  drawStartFrame={70}
                  drawDuration={60}
                  width={361}
                  height={220}
                  mode="area"
                />
              </div>

              {/* Time range buttons */}
              <div style={{ display: "flex", gap: 4, opacity: timeButtonsOpacity }}>
                {["1H", "4H", "1D", "7D", "6M", "ALL"].map((label) => (
                  <div
                    key={label}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: fonts.body,
                      backgroundColor: label === "1D" ? colors.surface3 : "transparent",
                      color: label === "1D" ? colors.textPrimary : colors.textMuted,
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Market info bar */}
              <div style={{ opacity: infoBarOpacity, transform: `translateY(${infoBarY}px)` }}>
                <MockMarketInfoBar />
              </div>
            </div>
            <MockBottomNav />
          </div>
        </div>
      </div>
    </PhoneScene>
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
        <div style={{ transform: "translateY(-180px)" }}>
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
