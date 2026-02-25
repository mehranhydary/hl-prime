import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { LightweightChart } from "../components/LightweightChart";
import { MockMarketInfoBar } from "../components/MockMarketInfoBar";
import { MockTradeForm } from "../components/MockTradeForm";
import { MOCK_TRADE } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S04_FillFormZoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Zoom: start zoomed on chart (2.2), pull back to form area (frames 0-40) --
  const zoomOutProgress = frame < 0
    ? 0
    : interpolate(
        spring({ fps, frame, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );

  // Then zoom into form area (frames 40-80)
  const zoomFormProgress = frame < 40
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 40, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );

  const zoom = interpolate(zoomOutProgress, [0, 1], [2.2, 1], CLAMP)
    + interpolate(zoomFormProgress, [0, 1], [0, 1.4], CLAMP);

  const focusY =
    interpolate(zoomOutProgress, [0, 1], [-40, 0], CLAMP)
    + interpolate(zoomFormProgress, [0, 1], [0, 160], CLAMP);

  // -- Trade form animation --
  const formOpacity = fadeIn(frame, 30, 20);
  const formY = slideUp(fps, frame, 30, 30);

  // Amount types in digit by digit (frames 60-120)
  const digits = interpolate(frame, [60, 75, 90, 105, 120], [0, 1, 2, 3, 4], CLAMP);
  const visibleDigits = Math.floor(digits);

  // Leverage slider animates 1→10 (frames 120-160)
  const leverageValue = interpolate(frame, [120, 160], [1, 10], CLAMP);

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
          {/* Compact asset header + price */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: colors.textMuted, fontFamily: fonts.body }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", backgroundColor: colors.surface2 }}>
              <img src={MOCK_TRADE.iconUrl} alt={MOCK_TRADE.asset} style={{ width: 24, height: 24 }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
              {MOCK_TRADE.asset}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body, marginLeft: "auto" }}>
              ${MOCK_TRADE.currentPrice}
            </span>
            <span style={{ fontSize: 11, color: colors.long, fontFamily: fonts.body }}>
              {MOCK_TRADE.priceChange}
            </span>
          </div>

          {/* Compact chart (already drawn) */}
          <div style={{ height: 120, overflow: "hidden" }}>
            <LightweightChart
              drawStartFrame={-100}
              drawDuration={1}
              width={361}
              height={120}
              mode="area"
            />
          </div>

          {/* Market info */}
          <MockMarketInfoBar />

          {/* Trade form */}
          <div style={{ opacity: formOpacity, transform: `translateY(${formY}px)` }}>
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
    </PhoneScene>
  );
};
