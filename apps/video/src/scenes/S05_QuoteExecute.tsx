import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, pressScale } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockTradeForm } from "../components/MockTradeForm";
import { MockQuoteBox } from "../components/MockQuoteBox";
import { MockFillResult } from "../components/MockFillResult";
import { MOCK_TRADE } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S05_QuoteExecute: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Zoom: start zoomed on form (2.4), stay zoomed for quote, then slight pullback for fill --
  const zoomPhase1 = interpolate(frame, [0, 30], [2.4, 2.0], CLAMP);
  const zoomPhase2 = frame < 110
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 110, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );
  const zoom = zoomPhase1 - interpolate(zoomPhase2, [0, 1], [0, 0.3], CLAMP);
  const focusY = interpolate(frame, [0, 30], [160, 190], CLAMP)
    + interpolate(zoomPhase2, [0, 1], [0, 30], CLAMP);

  // -- Quote shimmer loading (frames 0-25) --
  const isLoading = frame < 25;
  const shimmerX = interpolate(frame, [0, 25], [-200, 500], CLAMP);

  // -- Quote expand (frames 25-55) --
  const expandProgress = interpolate(frame, [25, 55], [0, 1], CLAMP);

  // -- Legs appear staggered (frames 35-55) --
  const leg1Visible = frame >= 35;
  const leg2Visible = frame >= 45;
  const visibleLegs = leg1Visible && leg2Visible ? 2 : leg1Visible ? 1 : 0;

  // -- Metrics fade in (frames 55-75) --
  const showMetrics = frame >= 55;

  // -- Button press (frames 90-105 press, 105 release) --
  const buttonScale = pressScale(fps, frame, 90, 105);
  const isExecuting = frame >= 105 && frame < 130;
  const isFilled = frame >= 130;
  const buttonText = isFilled
    ? "Filled!"
    : isExecuting
      ? "Executing..."
      : `Long ${MOCK_TRADE.asset}`;

  // Pulsing on "Executing..."
  const executingPulse = isExecuting ? Math.sin(frame * 0.3) * 0.3 + 0.7 : 1;

  // -- Fill result slides up (frames 130-160) --
  const fillVisible = frame >= 130;
  const fillY = frame < 130
    ? 100
    : interpolate(
        spring({ fps, frame: frame - 130, config: { damping: 12, mass: 0.5 } }),
        [0, 1], [100, 0], CLAMP,
      );
  const fillOpacity = fadeIn(frame, 130, 15);
  const fillLegs = frame < 140 ? 0 : frame < 148 ? 1 : 2;

  return (
    <PhoneScene zoom={zoom} focusX={0} focusY={focusY}>
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
          {/* Compact asset header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", backgroundColor: colors.surface2 }}>
              <img src={MOCK_TRADE.iconUrl} alt={MOCK_TRADE.asset} style={{ width: 24, height: 24 }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
              {MOCK_TRADE.asset}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body, marginLeft: "auto" }}>
              ${MOCK_TRADE.currentPrice}
            </span>
          </div>

          {/* Trade form (filled, static) */}
          <MockTradeForm
            visibleDigits={4}
            leverageValue={10}
            longActive={true}
            showExecute={true}
            buttonText={buttonText}
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
              boxShadow: `0 0 20px ${colors.long}20`,
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
        <MockBottomNav />
      </div>
    </PhoneScene>
  );
};
