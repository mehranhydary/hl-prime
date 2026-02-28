import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { typewriter } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MockQuoteBox } from "../components/MockQuoteBox";
import { MockSwapStep } from "../components/MockSwapStep";
import { MockFillResult } from "../components/MockFillResult";
import { MOCK_TRADE } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const TAGLINE = "Trade every market.";

export const S06_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Phase 1: Phone zooms out and shrinks (frames 0-40) --
  const shrinkProgress = frame < 0
    ? 0
    : interpolate(
        spring({ fps, frame, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );

  // Start at S05 end values: zoom=1.6, focusY=230
  const phoneZoom = interpolate(shrinkProgress, [0, 1], [1.6, 0.7], CLAMP);
  const phoneFocusY = interpolate(shrinkProgress, [0, 1], [230, 0], CLAMP);
  const phoneOpacity = interpolate(frame, [30, 50], [1, 0], CLAMP);

  // -- Phase 2: Logo + tagline (frames 40-100) --
  const logoScale = frame < 45
    ? 0
    : spring({ fps, frame: frame - 45, config: { damping: 12, mass: 0.5 } });

  const visibleChars = typewriter(frame, 60, TAGLINE.length, 2);
  const taglineText = TAGLINE.slice(0, visibleChars);
  const taglineOpacity = interpolate(frame, [60, 65], [0, 1], CLAMP);

  // -- Phase 3: Fade to black (frames 100-120) --
  const blackFade = interpolate(frame, [100, 120], [0, 1], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
      {/* Phone — frozen S05 end state, then shrinks away */}
      {phoneOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: phoneOpacity }}>
          <PhoneScene alignment="right" paddingRight={80} offsetY={340} zoom={phoneZoom} focusX={0} focusY={phoneFocusY}>
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
                {/* Scrollable content — frozen at S05 end scroll (-1120) */}
                <div
                  style={{
                    transform: "translateY(-1120px)",
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

                  {/* Chart */}
                  <div style={{ borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                    <LightweightChart
                      coin="xyz:NVDA"
                      drawStartFrame={-100}
                      drawDuration={1}
                      width={361}
                      height={240}
                      mode="area"
                    />
                  </div>

                  {/* Time range buttons */}
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

                  {/* Trade form — frozen at S05 end state */}
                  <MockTradeForm
                    visibleDigits={4}
                    leverageValue={20}
                    longActive={true}
                    hideButton={true}
                  />

                  {/* Quote box — fully expanded */}
                  <div style={{ position: "relative", overflow: "hidden" }}>
                    <MockQuoteBox
                      expandProgress={1}
                      visibleLegs={4}
                      showMetrics={true}
                      loading={false}
                    />
                  </div>

                  {/* Swap step — completed */}
                  <MockSwapStep
                    expandProgress={1}
                    isSwapping={false}
                    swapComplete={true}
                  />

                  {/* "Filled!" button */}
                  <div
                    style={{
                      backgroundColor: colors.long,
                      padding: "12px 0",
                      borderRadius: 4,
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "white",
                      fontFamily: fonts.body,
                      boxShadow: `0 0 30px ${colors.long}40`,
                    }}
                  >
                    Filled!
                  </div>

                  {/* Fill result */}
                  <MockFillResult visibleLegs={2} />
                </div>
              </div>
              <MockBottomNav />
            </div>
          </PhoneScene>
        </div>
      )}

      {/* Center logo + tagline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: fonts.logo,
            fontSize: 200,
            color: colors.accent,
            transform: `scale(${logoScale})`,
            textShadow: `0 0 40px rgba(80, 227, 181, 0.6), 0 0 80px rgba(80, 227, 181, 0.3)`,
            lineHeight: 1,
          }}
        >
          P
        </div>
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 80,
            color: colors.accent,
            letterSpacing: "0.04em",
            opacity: taglineOpacity,
            minHeight: 96,
          }}
        >
          {taglineText}
        </div>
      </div>

      {/* Fade to black */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "black",
          opacity: blackFade,
        }}
      />
    </AbsoluteFill>
  );
};
