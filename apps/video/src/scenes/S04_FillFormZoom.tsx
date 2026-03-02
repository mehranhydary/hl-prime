import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MOCK_TRADE, SCENE_CAPTIONS } from "../lib/mock-data";
import { SideCaption } from "../components/SideCaption";
import { PrimeLogo } from "../components/PrimeLogo";
import { AnimatedCursor, type CursorKeyframe } from "../components/AnimatedCursor";

// Cursor positions in phone coords (393×852).
// Header is 99px (50 status + 48 main + 1 border).
// 240px chart (matching S03). phone_y = 99 + content_y + scroll.
// Amount input center: content_y≈584, scroll=-200 → phone_y=483.
//   Text is left-aligned; tap target: x≈120 (left-center of input).
// Leverage slider thumb center: empirically adjusted from screenshot.
//   Track width=361px. lev=5 → 21%, x=92. lev=20 → 100%, x=377.
const CURSOR_KEYFRAMES: CursorKeyframe[] = [
  // Appear near form
  { frame: 5, x: 160, y: 460 },
  // Move to amount input (left-center, where you'd tap)
  { frame: 15, x: 120, y: 483 },
  // Click amount input
  { frame: 18, x: 120, y: 483, click: true },
  // Release, stay near input while digits type in
  { frame: 25, x: 130, y: 483 },
  { frame: 82, x: 140, y: 483 },
  // Move to slider thumb (white circle at lev=5)
  { frame: 100, x: 92, y: 554 },
  // Grab slider thumb
  { frame: 105, x: 92, y: 554, click: true },
  // Drag all the way to 20x (end of track)
  { frame: 155, x: 377, y: 554, click: true },
  // Release slider
  { frame: 160, x: 377, y: 554 },
  // Drift toward button area
  { frame: 200, x: 196, y: 600 },
];

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S04_FillFormZoom: React.FC = () => {
  const frame = useCurrentFrame();

  // ── Seamless continuation from S03 end: zoom=2.2, focusY=-40, scroll=-200 ──
  // No zoom bounce — stable during interaction, then smooth ramp to S05 start
  const zoom = interpolate(frame, [0, 160, 210], [2.2, 2.2, 2.4], CLAMP);
  const focusY = interpolate(frame, [0, 70, 160, 210], [-40, -20, 40, 100], CLAMP);
  // Scroll stable during typing (0-80) and slider drag (100-160), moves between
  const scrollOffset = interpolate(frame, [0, 80, 100, 160, 210], [-200, -200, -230, -230, -320], CLAMP);

  // Amount types in digit by digit — first digit at frame 30 (after click at 18)
  const digits = interpolate(frame, [30, 45, 58, 70, 82], [0, 1, 2, 3, 4], CLAMP);
  const visibleDigits = Math.floor(digits);

  // Leverage slider: starts at 5 (matching S03), drags to 20x max (frames 105-155)
  const leverageValue = interpolate(frame, [0, 105, 155], [5, 5, 20], CLAMP);

  return (
    <>
      <PhoneScene alignment="right" zoom={zoom} focusX={0} focusY={focusY}>
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
                transform: `translateY(${scrollOffset}px)`,
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

              {/* Chart — 240px to match S03 for seamless transition */}
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

              {/* Trade form — already visible from S03, no fade needed */}
              <MockTradeForm
                visibleDigits={visibleDigits}
                leverageValue={leverageValue}
                longActive={true}
                showExecute={visibleDigits >= 4 && leverageValue >= 9}
                buttonText={
                  visibleDigits === 0
                    ? "Enter amount"
                    : visibleDigits < 4
                      ? "Waiting for quote..."
                      : leverageValue < 9
                        ? "Waiting for quote..."
                        : `Long ${MOCK_TRADE.asset}`
                }
              />
            </div>
          </div>
          <MockBottomNav />
          <AnimatedCursor keyframes={CURSOR_KEYFRAMES} />
        </div>
      </PhoneScene>
      <SideCaption
        heading={SCENE_CAPTIONS.fillForm.heading}
        bullets={SCENE_CAPTIONS.fillForm.bullets}
        startFrame={10}
        bulletsStartFrame={30}
      />
      <PrimeLogo fadeInStart={10} />
    </>
  );
};
