import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, pressScale } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { SideCaption } from "../components/SideCaption";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MockQuoteBox } from "../components/MockQuoteBox";
import { MockSwapStep } from "../components/MockSwapStep";
import { MockFillResult } from "../components/MockFillResult";
import { Confetti } from "../components/Confetti";
import { MOCK_TRADE, SCENE_CAPTIONS } from "../lib/mock-data";
import { AnimatedCursor, type CursorKeyframe } from "../components/AnimatedCursor";

// Cursor positions in phone coords.
// Slowed down — more time to read each phase's caption text.
const CURSOR_KEYFRAMES: CursorKeyframe[] = [
  // Phase 1: Quote generation — cursor watches as quote scrolls in
  { frame: 20, x: 200, y: 550 },
  { frame: 60, x: 210, y: 500 },                          // watching legs appear
  { frame: 100, x: 200, y: 650 },                         // watching metrics
  // Phase 2: Swap step — cursor follows scroll
  { frame: 135, x: 200, y: 680 },                         // swap appearing
  { frame: 185, x: 210, y: 620 },                         // swap complete
  // Phase 3: Scroll to button + click
  { frame: 240, x: 196, y: 610 },                         // approaching button
  { frame: 255, x: 196, y: 606 },                         // on button
  { frame: 260, x: 196, y: 606, click: true },            // click!
  { frame: 266, x: 196, y: 606 },                         // release
  // Phase 4: Fill — cursor watches results
  { frame: 300, x: 210, y: 580 },                         // fills springing in
  { frame: 350, x: 210, y: 560 },                         // watching fill result
  // Phase 5: Result display
  { frame: 380, x: 210, y: 560 },                         // final position
];

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S05_QuoteExecute: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Zoom: start at 2.4 / focusY 100 (matching S04 end) ──
  const zoomPhase1 = interpolate(frame, [0, 50], [2.4, 2.0], CLAMP);
  const zoomPullback = frame < 300
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 300, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );
  const zoom = zoomPhase1 - interpolate(zoomPullback, [0, 1], [0, 0.4], CLAMP);
  const focusY = interpolate(frame, [0, 50, 120, 200, 260], [100, 130, 150, 180, 200], CLAMP)
    + interpolate(zoomPullback, [0, 1], [0, 30], CLAMP);

  // ── Content scroll: slowed down so caption text completes before each transition ──
  // Phase 1 (0-110): scroll to show quote expanding
  // Phase 2 (110-180): scroll to reveal swap step below quote
  // Phase 3 (180-240): scroll to reveal "Long NVDA" button
  // Phase 4 (240-300): slight more for fill result
  const scrollOffset = interpolate(
    frame,
    [0, 20, 110, 180, 240, 300],
    [-320, -360, -810, -980, -1060, -1120],
    CLAMP,
  );

  // ── Phase 1: Quote (frames 0-120) ──
  const isLoading = frame < 35;
  const shimmerX = interpolate(frame, [0, 35], [-200, 500], CLAMP);
  const expandProgress = interpolate(frame, [35, 90], [0, 1], CLAMP);
  const leg1Visible = frame >= 50;
  const leg2Visible = frame >= 70;
  const visibleLegs = leg1Visible && leg2Visible ? 4 : leg1Visible ? 2 : 0;
  const showMetrics = frame >= 80;

  // ── Phase 2: Swap step (frames 120-210) ──
  const swapExpandProgress = interpolate(frame, [120, 140], [0, 1], CLAMP);
  const isSwapping = frame >= 140 && frame < 185;
  const swapComplete = frame >= 185;

  // ── Phase 3: Execute (frames 240-315) ──
  const buttonScale = pressScale(fps, frame, 260, 266);
  const isExecuting = frame >= 266 && frame < 310;
  const isFilled = frame >= 315;
  const buttonText = isFilled
    ? "Filled!"
    : isExecuting
      ? "Executing..."
      : `Long ${MOCK_TRADE.asset}`;
  const executingPulse = isExecuting ? Math.sin(frame * 0.3) * 0.3 + 0.7 : 1;

  // ── Phase 4: Fill result (frames 290-400) ──
  const fillVisible = frame >= 290;
  const fillY = frame < 290
    ? 100
    : interpolate(
        spring({ fps, frame: frame - 290, config: { damping: 12, mass: 0.5 } }),
        [0, 1], [100, 0], CLAMP,
      );
  const fillOpacity = fadeIn(frame, 290, 15);
  const fillLegs = frame < 300 ? 0 : frame < 310 ? 1 : 2;

  // ── Side caption phasing ──
  const captionPhase = frame < 120 ? 0 : frame < 210 ? 1 : frame < 315 ? 2 : 3;

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
            {/* Scrollable content — same layout as S04 for seamless transition */}
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

              {/* Chart (already drawn, matches S04) */}
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

              {/* Trade form (filled state — no button, we render our own below) */}
              <MockTradeForm
                visibleDigits={4}
                leverageValue={20}
                longActive={true}
                hideButton={true}
              />

              {/* Quote box with shimmer */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <MockQuoteBox
                  expandProgress={expandProgress}
                  visibleLegs={visibleLegs}
                  showMetrics={showMetrics}
                  loading={isLoading}
                />
                {isLoading && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 44,
                      background: `linear-gradient(90deg, transparent 0%, rgba(80, 227, 181, 0.08) 50%, transparent 100%)`,
                      transform: `translateX(${shimmerX}px)`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>

              {/* Swap step (Phase 2) */}
              {frame >= 120 && (
                <MockSwapStep
                  expandProgress={swapExpandProgress}
                  isSwapping={isSwapping}
                  swapComplete={swapComplete}
                />
              )}

              {/* Action button with animation */}
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
                  boxShadow: isFilled
                    ? `0 0 30px ${colors.long}40`
                    : `0 0 20px ${colors.long}20`,
                  transform: `scale(${buttonScale})`,
                  opacity: isExecuting ? executingPulse : 1,
                }}
              >
                {buttonText}
              </div>

              {/* Fill result */}
              {fillVisible && (
                <div style={{ transform: `translateY(${fillY}px)`, opacity: fillOpacity }}>
                  <MockFillResult visibleLegs={fillLegs} />
                </div>
              )}
            </div>
          </div>
          <MockBottomNav />

          {/* Confetti on fill */}
          {frame >= 315 && <Confetti triggerFrame={315} originX={196} originY={600} />}

          <AnimatedCursor keyframes={CURSOR_KEYFRAMES} />
        </div>
      </PhoneScene>

      {/* Side captions — phase through different messages */}
      {captionPhase === 0 && (
        <SideCaption
          heading={SCENE_CAPTIONS.quotePhase.heading}
          bullets={SCENE_CAPTIONS.quotePhase.bullets}
          startFrame={5}
          bulletsStartFrame={15}
          fadeOutFrame={105}
          typeSpeed={1}
          bulletGap={25}
        />
      )}
      {captionPhase === 1 && (
        <SideCaption
          heading={SCENE_CAPTIONS.swapPhase.heading}
          bullets={SCENE_CAPTIONS.swapPhase.bullets}
          startFrame={120}
          bulletsStartFrame={130}
          fadeOutFrame={200}
          typeSpeed={1}
          bulletGap={25}
        />
      )}
      {captionPhase >= 3 && (
        <SideCaption
          heading={SCENE_CAPTIONS.fillPhase.heading}
          bullets={SCENE_CAPTIONS.fillPhase.bullets}
          startFrame={310}
          bulletsStartFrame={320}
          typeSpeed={1}
          bulletGap={25}
        />
      )}
    </>
  );
};
