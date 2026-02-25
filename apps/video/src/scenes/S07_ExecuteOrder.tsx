import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, pressScale } from "../lib/animations";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockTradeForm } from "../components/MockTradeForm";
import { MockQuoteBox } from "../components/MockQuoteBox";
import { MockFillResult } from "../components/MockFillResult";
import { MOCK_TRADE } from "../lib/mock-data";

export const S07_ExecuteOrder: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Button press effect (frames 0-15 press, 15 release)
  const buttonScale = pressScale(fps, frame, 0, 15);

  // Button text transitions
  const isExecuting = frame >= 15 && frame < 50;
  const isFilled = frame >= 50;

  const buttonText = isFilled
    ? "Filled!"
    : isExecuting
      ? "Executing..."
      : `Long ${MOCK_TRADE.asset}`;

  // Fill result slides up (frames 50-80)
  const fillVisible = frame >= 50;
  const fillY = frame < 50
    ? 100
    : interpolate(
        spring({ fps, frame: frame - 50, config: { damping: 12, mass: 0.5 } }),
        [0, 1],
        [100, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
  const fillOpacity = fadeIn(frame, 50, 15);

  // Leg stagger in fill result
  const fillLegs = frame < 60 ? 0 : frame < 65 ? 1 : 2;

  // Fill result subtle bounce at end
  const fillScale = frame < 90
    ? 1
    : interpolate(
        spring({ fps, frame: frame - 90, config: { damping: 20, mass: 0.3 } }),
        [0, 1],
        [1.02, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

  // Pulsing dot on "Executing..."
  const executingPulse = isExecuting
    ? Math.sin(frame * 0.3) * 0.3 + 0.7
    : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
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
            padding: "16px 20px",
            paddingBottom: 72,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {/* Compact asset header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: colors.surface2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              ETH
            </div>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: colors.textPrimary,
                fontFamily: fonts.body,
              }}
            >
              {MOCK_TRADE.asset}
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: colors.textPrimary,
                fontFamily: fonts.body,
                marginLeft: "auto",
              }}
            >
              ${MOCK_TRADE.currentPrice}
            </span>
          </div>

          {/* Quote box (static, fully expanded) */}
          <MockQuoteBox
            expandProgress={1}
            visibleLegs={2}
            showMetrics={true}
          />

          {/* Action button with animation */}
          <div
            style={{
              backgroundColor: isFilled ? colors.long : colors.long,
              padding: "14px 0",
              borderRadius: 4,
              textAlign: "center",
              fontSize: 15,
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
            <div
              style={{
                transform: `translateY(${fillY}px) scale(${fillScale})`,
                opacity: fillOpacity,
              }}
            >
              <MockFillResult visibleLegs={fillLegs} />
            </div>
          )}
        </div>

        <MockBottomNav />
      </div>
    </AbsoluteFill>
  );
};
