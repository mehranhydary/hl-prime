import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp, slideFromRight } from "../lib/animations";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockCandleChart } from "../components/MockCandleChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MOCK_TRADE } from "../lib/mock-data";

export const S04_TradingPage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Back + ETH header slide from right (frames 0-20)
  const headerX = slideFromRight(fps, frame, 0, 200);

  // Price fades in (frames 15-30)
  const priceOpacity = fadeIn(frame, 15, 15);
  const priceY = slideUp(fps, frame, 15, 15);

  // Change badge (frames 20-35)
  const changeOpacity = fadeIn(frame, 20, 12);

  // Chart draws (frames 40-100)
  // Chart component handles its own animation internally

  // Time range buttons (frames 100-115)
  const timeButtonsOpacity = fadeIn(frame, 100, 15);

  // Market info bar (frames 120-135)
  const infoBarOpacity = fadeIn(frame, 120, 15);
  const infoBarY = slideUp(fps, frame, 120, 20);

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
          {/* Back + Asset header */}
          <div style={{ transform: `translateX(${headerX}px)` }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                color: colors.textMuted,
                fontFamily: fonts.body,
                marginBottom: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: colors.surface2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.body,
                }}
              >
                ETH
              </div>
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: colors.textPrimary,
                    fontFamily: fonts.body,
                  }}
                >
                  {MOCK_TRADE.asset}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    fontFamily: fonts.body,
                  }}
                >
                  {MOCK_TRADE.assetName}
                </div>
              </div>
            </div>
          </div>

          {/* Price display */}
          <div
            style={{
              opacity: priceOpacity,
              transform: `translateY(${priceY}px)`,
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: colors.textPrimary,
                fontFamily: fonts.body,
                lineHeight: 1.1,
              }}
            >
              ${MOCK_TRADE.currentPrice}
            </div>
            <div
              style={{
                fontSize: 14,
                color: colors.long,
                fontFamily: fonts.body,
                marginTop: 2,
                opacity: changeOpacity,
              }}
            >
              {MOCK_TRADE.priceChange}
            </div>
          </div>

          {/* Chart */}
          <div
            style={{
              backgroundColor: colors.surface0,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <MockCandleChart
              drawStartFrame={40}
              drawDuration={60}
              width={1040}
              height={280}
            />
          </div>

          {/* Time range buttons */}
          <div
            style={{
              display: "flex",
              gap: 4,
              opacity: timeButtonsOpacity,
            }}
          >
            {["1H", "4H", "1D", "7D", "6M", "ALL"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "4px 12px",
                  borderRadius: 3,
                  fontSize: 11,
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
          <div
            style={{
              opacity: infoBarOpacity,
              transform: `translateY(${infoBarY}px)`,
            }}
          >
            <MockMarketInfoBar />
          </div>
        </div>

        <MockBottomNav />
      </div>
    </AbsoluteFill>
  );
};
