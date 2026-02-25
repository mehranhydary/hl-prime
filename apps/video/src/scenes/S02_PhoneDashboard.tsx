import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { MOCK_POSITIONS, MOCK_ASSETS } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const S02_PhoneDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone scales in from 0 (frames 0-30)
  const phoneScale = frame < 0
    ? 0
    : spring({ fps, frame, config: { damping: 14, mass: 0.6 } });
  const phoneOpacity = fadeIn(frame, 0, 20);

  // Header slides in (frames 30-50)
  const headerY = slideUp(fps, frame, 30, -50);

  // Balance card slides from left (frames 45-65)
  const balanceX = frame < 45
    ? -400
    : interpolate(
        spring({ fps, frame: frame - 45, config: { damping: 12, mass: 0.5 } }),
        [0, 1], [-400, 0], CLAMP,
      );
  const balanceOpacity = fadeIn(frame, 45, 15);

  // Positions fade in (frames 60-80)
  const pos1Opacity = fadeIn(frame, 60, 12);
  const pos1Y = slideUp(fps, frame, 60, 20);
  const pos2Opacity = fadeIn(frame, 65, 12);
  const pos2Y = slideUp(fps, frame, 65, 20);

  // "Markets" heading (frames 75-85)
  const marketsOpacity = fadeIn(frame, 75, 12);

  // Market list scroll (frames 90-180)
  const scrollOffset = interpolate(frame, [90, 180], [0, -180], CLAMP);

  // Staggered row appearance
  const rowOpacities = MOCK_ASSETS.map((_, i) => fadeIn(frame, 85 + i * 4, 10));

  // Zoom into ETH area at end (frames 190-240)
  const zoomProgress = frame < 190
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 190, config: { damping: 15, mass: 0.8 } }),
        [0, 1], [0, 1], CLAMP,
      );
  const zoom = interpolate(zoomProgress, [0, 1], [1, 1.8], CLAMP);
  const focusY = interpolate(zoomProgress, [0, 1], [0, 120], CLAMP);

  return (
    <PhoneScene
      zoom={zoom}
      focusX={0}
      focusY={focusY}
      opacity={interpolate(phoneScale, [0, 0.3], [0, 1], CLAMP)}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          opacity: phoneOpacity,
        }}
      >
        {/* Header */}
        <div style={{ transform: `translateY(${headerY}px)` }}>
          <MockHeader />
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            padding: "12px 16px",
            paddingBottom: 60,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Balance card */}
          <div style={{ transform: `translateX(${balanceX}px)`, opacity: balanceOpacity }}>
            <MockBalanceCard />
          </div>

          {/* Positions section */}
          <div
            style={{
              backgroundColor: colors.surface2,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              padding: "8px 12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, fontFamily: fonts.body }}>
                OPEN POSITIONS ({MOCK_POSITIONS.length})
              </span>
              <span style={{ fontSize: 11, color: colors.accent, fontFamily: fonts.body }}>
                View all
              </span>
            </div>
            <div style={{ opacity: pos1Opacity, transform: `translateY(${pos1Y}px)` }}>
              <MockPositionRow position={MOCK_POSITIONS[0]} />
            </div>
            <div style={{ borderTop: `1px solid ${colors.border}`, opacity: pos2Opacity, transform: `translateY(${pos2Y}px)` }}>
              <MockPositionRow position={MOCK_POSITIONS[1]} />
            </div>
          </div>

          {/* Markets heading */}
          <div style={{ opacity: marketsOpacity, fontSize: 16, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.heading, marginTop: 2 }}>
            Markets
          </div>

          {/* Asset list header */}
          <div style={{ display: "flex", alignItems: "center", padding: "2px 0", opacity: marketsOpacity }}>
            <div style={{ flex: 1, fontSize: 9, letterSpacing: "0.1em", color: colors.textDim, fontFamily: fonts.body, paddingLeft: 42 }}>
              ASSET
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: colors.textDim, fontFamily: fonts.body, minWidth: 70, textAlign: "right" }}>
              PRICE
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: colors.textDim, fontFamily: fonts.body, minWidth: 55, textAlign: "right" }}>
              24H
            </div>
          </div>

          {/* Asset list (scrolling) */}
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div style={{ transform: `translateY(${scrollOffset}px)` }}>
              {MOCK_ASSETS.map((asset, i) => (
                <div key={asset.symbol} style={{ opacity: rowOpacities[i], borderBottom: `1px solid ${colors.border}` }}>
                  <MockAssetRow asset={asset} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <MockBottomNav />
      </div>
    </PhoneScene>
  );
};
