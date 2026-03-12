import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockCandleChart } from "../components/MockCandleChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MockQuoteBox } from "../components/MockQuoteBox";
import { MOCK_TRADE } from "../lib/mock-data";

export const S06_QuoteGeneration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Loading shimmer (frames 0-25)
  const isLoading = frame < 25;

  // Quote expand (frames 25-55)
  const expandProgress = interpolate(frame, [25, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Legs appear staggered (frames 35-55)
  const leg1Visible = frame >= 35;
  const leg2Visible = frame >= 45;
  const visibleLegs = leg1Visible && leg2Visible ? 2 : leg1Visible ? 1 : 0;

  // Metrics fade in (frames 55-80)
  const showMetrics = frame >= 55;
  const metricsOpacity = fadeIn(frame, 55, 20);

  // Shimmer effect for loading state
  const shimmerX = interpolate(frame, [0, 25], [-200, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
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

          {/* Compact chart (already drawn) */}
          <div style={{ height: 100, overflow: "hidden" }}>
            <MockCandleChart
              drawStartFrame={-100}
              drawDuration={1}
              width={1040}
              height={100}
            />
          </div>

          {/* Trade form (filled, static) */}
          <MockTradeForm
            visibleDigits={4}
            leverageValue={10}
            longActive={true}
            showExecute={true}
            buttonText={`Long ${MOCK_TRADE.asset}`}
            hideQuoteSection={true}
          />

          {/* Quote box */}
          <div
            style={{
              position: "relative",
              overflow: "hidden",
            }}
          >
            <MockQuoteBox
              expandProgress={expandProgress}
              visibleLegs={visibleLegs}
              showMetrics={showMetrics}
              loading={isLoading}
            />

            {/* Shimmer overlay during loading */}
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
        </div>

        <MockBottomNav />
      </div>
    </AbsoluteFill>
  );
};
