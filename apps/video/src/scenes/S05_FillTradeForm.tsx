import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockCandleChart } from "../components/MockCandleChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MOCK_TRADE } from "../lib/mock-data";

export const S05_FillTradeForm: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Trade form fades in (frames 0-20)
  const formOpacity = fadeIn(frame, 0, 20);
  const formY = slideUp(fps, frame, 0, 30);

  // Long tab glow pulse (frames 15-25)
  // Handled implicitly by MockTradeForm's longActive prop

  // Amount types in digit by digit (frames 35-95)
  // "5", "0", "0", "0" — 15 frames per digit
  const digits = interpolate(frame, [35, 50, 65, 80, 95], [0, 1, 2, 3, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleDigits = Math.floor(digits);

  // Leverage slider animates 1→10 (frames 95-130)
  const leverageValue = interpolate(frame, [95, 130], [1, 10], {
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
          {/* Compact asset header + price (persisted from S04) */}
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
            <span
              style={{
                fontSize: 12,
                color: colors.long,
                fontFamily: fonts.body,
              }}
            >
              {MOCK_TRADE.priceChange}
            </span>
          </div>

          {/* Compact chart (static, already drawn) */}
          <div style={{ height: 140, overflow: "hidden" }}>
            <MockCandleChart
              drawStartFrame={-100}
              drawDuration={1}
              width={1040}
              height={140}
            />
          </div>

          {/* Market info */}
          <MockMarketInfoBar />

          {/* Trade form */}
          <div
            style={{
              opacity: formOpacity,
              transform: `translateY(${formY}px)`,
            }}
          >
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
      </div>
    </AbsoluteFill>
  );
};
