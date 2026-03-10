import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { PhoneScene } from "../../components/PhoneScene";
import { MockHeader } from "../../components/MockHeader";
import { MockBottomNav } from "../../components/MockBottomNav";
import { LightweightChart } from "../../components/LightweightChart";
import { MockMarketInfoBar } from "../../components/MockMarketInfoBar";
import { MockTradeForm } from "../../components/MockTradeForm";
import { MockQuoteBox } from "../../components/MockQuoteBox";
import { MockSwapStep } from "../../components/MockSwapStep";
import { MockFillResult } from "../../components/MockFillResult";
import { Confetti } from "../../components/Confetti";
import { MOCK_TRADE } from "../../lib/mock-data";
import { AnimatedCursor, type CursorKeyframe } from "../../components/AnimatedCursor";
import { fadeIn, pressScale } from "../../lib/animations";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Cursor keyframes for the full NVDA trading flow
const CURSOR_KEYFRAMES: CursorKeyframe[] = [
  // Enter — drift toward the page
  { frame: 10, x: 300, y: 300 },
  // Focus on NVDA header
  { frame: 25, x: 200, y: 200 },
  // Move to amount input and click
  { frame: 35, x: 120, y: 483 },
  { frame: 38, x: 120, y: 483, click: true },
  { frame: 42, x: 130, y: 483 },
  // Watch amount being typed
  { frame: 65, x: 140, y: 483 },
  // Move to leverage slider
  { frame: 75, x: 92, y: 554 },
  { frame: 78, x: 92, y: 554, click: true },
  // Drag slider to 20x
  { frame: 100, x: 377, y: 554, click: true },
  { frame: 105, x: 377, y: 554 },
  // Scroll to see quote generation
  { frame: 120, x: 200, y: 550 },
  // Watch quote expand
  { frame: 150, x: 210, y: 600 },
  // Watch swap step
  { frame: 175, x: 200, y: 640 },
  // Move to Long NVDA button
  { frame: 200, x: 196, y: 610 },
  { frame: 210, x: 196, y: 606 },
  // Click Long NVDA
  { frame: 215, x: 196, y: 606, click: true },
  { frame: 220, x: 196, y: 606 },
  // Watch fill result
  { frame: 245, x: 210, y: 580 },
  { frame: 265, x: 210, y: 560 },
];

export const V2S10_NvdaTrade: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone enters from right (frames 0-20)
  const phoneEnter = spring({ fps, frame, config: { damping: 14, mass: 0.5 } });
  const phoneScale = interpolate(phoneEnter, [0, 1], [0.8, 1], CLAMP);

  // Zoom phases
  // Start normal, zoom into form area (70-110), pull back for quote (110-140),
  // zoom into button (190-220), pull back for result (230-260)
  const zoomInForm = frame < 70 ? 0 : interpolate(
    spring({ fps, frame: frame - 70, config: { damping: 15, mass: 0.7 } }),
    [0, 1], [0, 1], CLAMP,
  );
  const zoomOutQuote = frame < 130 ? 0 : interpolate(
    spring({ fps, frame: frame - 130, config: { damping: 14, mass: 0.6 } }),
    [0, 1], [0, 1], CLAMP,
  );
  const zoomInButton = frame < 190 ? 0 : interpolate(
    spring({ fps, frame: frame - 190, config: { damping: 15, mass: 0.7 } }),
    [0, 1], [0, 1], CLAMP,
  );
  const zoomOutFinal = frame < 240 ? 0 : interpolate(
    spring({ fps, frame: frame - 240, config: { damping: 14, mass: 0.6 } }),
    [0, 1], [0, 1], CLAMP,
  );

  const zoom = 1.2
    + zoomInForm * 0.8
    - zoomOutQuote * 0.5
    + zoomInButton * 0.4
    - zoomOutFinal * 0.3;

  const focusY =
    interpolate(zoomInForm, [0, 1], [0, -40], CLAMP)
    + interpolate(zoomOutQuote, [0, 1], [0, 40], CLAMP)
    + interpolate(zoomInButton, [0, 1], [0, -30], CLAMP)
    + interpolate(zoomOutFinal, [0, 1], [0, 30], CLAMP);

  // Content scroll — progressive reveal
  const scrollOffset = interpolate(
    frame,
    [0, 35, 70, 110, 160, 200, 240],
    [0, 0, -200, -360, -800, -1000, -1080],
    CLAMP,
  );

  // Amount input: digits appear (frames 42-65)
  const digits = interpolate(frame, [42, 50, 55, 60, 65], [0, 1, 2, 3, 4], CLAMP);
  const visibleDigits = Math.floor(digits);

  // Leverage: drag from 5 to 20x (frames 78-105)
  const leverageValue = interpolate(frame, [0, 78, 105], [5, 5, 20], CLAMP);

  // Quote generation (frames 110-160)
  const isLoading = frame >= 110 && frame < 125;
  const shimmerX = interpolate(frame, [110, 125], [-200, 500], CLAMP);
  const expandProgress = interpolate(frame, [125, 155], [0, 1], CLAMP);
  const leg1Visible = frame >= 135;
  const leg2Visible = frame >= 145;
  const visibleLegs = leg1Visible && leg2Visible ? 4 : leg1Visible ? 2 : 0;
  const showMetrics = frame >= 150;

  // Swap step (frames 155-190)
  const swapExpandProgress = interpolate(frame, [155, 170], [0, 1], CLAMP);
  const isSwapping = frame >= 170 && frame < 185;
  const swapComplete = frame >= 185;

  // Execute button (frames 200-270)
  const buttonScale = pressScale(fps, frame, 215, 220);
  const isExecuting = frame >= 220 && frame < 250;
  const isFilled = frame >= 255;
  const buttonText = isFilled
    ? "Filled!"
    : isExecuting
      ? "Executing..."
      : `Long ${MOCK_TRADE.asset}`;
  const executingPulse = isExecuting ? Math.sin(frame * 0.3) * 0.3 + 0.7 : 1;

  // Fill result (frames 245-270)
  const fillVisible = frame >= 245;
  const fillY = frame < 245
    ? 100
    : interpolate(
        spring({ fps, frame: frame - 245, config: { damping: 12, mass: 0.5 } }),
        [0, 1], [100, 0], CLAMP,
      );
  const fillOpacity = fadeIn(frame, 245, 15);
  const fillLegs = frame < 250 ? 0 : frame < 258 ? 1 : 2;

  return (
    <>
      <PhoneScene alignment="right" paddingRight={80} offsetY={340} zoom={zoom} focusX={0} focusY={focusY}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            opacity: interpolate(phoneScale, [0.8, 1], [0, 1], CLAMP),
          }}
        >
          <MockHeader />
          <div style={{ flex: 1, overflow: "hidden" }}>
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
                  {"↑"} {MOCK_TRADE.priceChange}
                </div>
              </div>

              {/* Chart */}
              <div style={{ borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                <LightweightChart
                  coin="xyz:NVDA"
                  drawStartFrame={10}
                  drawDuration={40}
                  width={361}
                  height={240}
                  mode="area"
                  minPoints={40}
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

              {/* Trade form */}
              <MockTradeForm
                visibleDigits={visibleDigits}
                leverageValue={leverageValue}
                longActive={true}
                hideButton={frame >= 110}
              />

              {/* Quote box */}
              {frame >= 110 && (
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
              )}

              {/* Swap step */}
              {frame >= 155 && (
                <MockSwapStep
                  expandProgress={swapExpandProgress}
                  isSwapping={isSwapping}
                  swapComplete={swapComplete}
                />
              )}

              {/* Action button */}
              {frame >= 110 && (
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
              )}

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
          {frame >= 255 && <Confetti triggerFrame={255} originX={196} originY={600} />}

          <AnimatedCursor keyframes={CURSOR_KEYFRAMES} />
        </div>
      </PhoneScene>

      {/* Side caption that updates per phase */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 0,
          bottom: 0,
          width: 700,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          pointerEvents: "none",
        }}
      >
        {/* Phase labels */}
        {frame < 70 && (
          <CaptionBlock
            frame={frame}
            title="NVDA"
            subtitle="Open the trading page"
            startFrame={15}
          />
        )}
        {frame >= 35 && frame < 110 && (
          <CaptionBlock
            frame={frame}
            title="Enter amount"
            subtitle="$5,000 with 20x leverage"
            startFrame={40}
            fadeOutFrame={105}
          />
        )}
        {frame >= 110 && frame < 190 && (
          <CaptionBlock
            frame={frame}
            title="Get a quote"
            subtitle="Best price across all venues"
            startFrame={115}
            fadeOutFrame={185}
          />
        )}
        {frame >= 155 && frame < 215 && (
          <CaptionBlock
            frame={frame}
            title="Collateral swap"
            subtitle="Auto-convert to right collateral"
            startFrame={158}
            fadeOutFrame={210}
          />
        )}
        {frame >= 215 && (
          <CaptionBlock
            frame={frame}
            title="Execute!"
            subtitle="Order filled across venues"
            startFrame={220}
          />
        )}
      </div>
    </>
  );
};

// Simple side caption helper
const CaptionBlock: React.FC<{
  frame: number;
  title: string;
  subtitle: string;
  startFrame: number;
  fadeOutFrame?: number;
}> = ({ frame, title, subtitle, startFrame, fadeOutFrame }) => {
  const enterOpacity = interpolate(frame, [startFrame, startFrame + 10], [0, 1], CLAMP);
  const enterY = interpolate(frame, [startFrame, startFrame + 15], [20, 0], CLAMP);
  const exitOpacity = fadeOutFrame
    ? interpolate(frame, [fadeOutFrame, fadeOutFrame + 10], [1, 0], CLAMP)
    : 1;

  return (
    <div
      style={{
        opacity: enterOpacity * exitOpacity,
        transform: `translateY(${enterY}px)`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 56,
          color: colors.accent,
          lineHeight: 1.2,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 32,
          color: colors.textSecondary,
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
