import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { SideCaption } from "../components/SideCaption";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { MOCK_POSITIONS, MOCK_ASSETS, SCENE_CAPTIONS } from "../lib/mock-data";
import { AnimatedCursor, type CursorKeyframe } from "../components/AnimatedCursor";
import { PrimeLogo } from "../components/PrimeLogo";

// Cursor drifts around dashboard; zoom into NVDA area (index 4), then click
// NVDA row center ≈ y=610 after scroll (search bar + 4 rows above it)
const CURSOR_KEYFRAMES: CursorKeyframe[] = [
  { frame: 40, x: 200, y: 280 },                          // appear center area
  { frame: 70, x: 160, y: 220 },                          // drift toward balance
  { frame: 100, x: 280, y: 300 },                         // drift toward positions
  { frame: 130, x: 200, y: 420 },                         // drift toward markets
  { frame: 160, x: 200, y: 540 },                         // drift down toward NVDA as zoom begins
  { frame: 185, x: 200, y: 610 },                         // on NVDA row after zoom settles
  { frame: 205, x: 200, y: 610 },                         // hover NVDA
  { frame: 210, x: 200, y: 610, click: true },            // click
  { frame: 218, x: 200, y: 610 },                         // release
];

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

  // Market list scroll — only scroll once zoom + cursor are moving toward NVDA
  const scrollOffset = interpolate(frame, [155, 190], [0, -100], CLAMP);

  // Staggered row appearance
  const rowOpacities = MOCK_ASSETS.map((_, i) => fadeIn(frame, 85 + i * 4, 10));

  // Hover highlight: cursor drifts across rows 0→4 (NVDA) between frames 130-185
  const NVDA_INDEX = 4;
  const hoverFloat = interpolate(frame, [130, 185], [0, NVDA_INDEX], CLAMP);
  // Click flash on NVDA (frame 210-218)
  const clickFlash = interpolate(frame, [210, 213, 218], [0, 1, 0], CLAMP);

  // Zoom into NVDA area — starts before cursor reaches the row (frames 160+)
  const zoomProgress = frame < 160
    ? 0
    : interpolate(
        spring({ fps, frame: frame - 160, config: { damping: 15, mass: 0.8 } }),
        [0, 1], [0, 1], CLAMP,
      );
  const zoom = interpolate(zoomProgress, [0, 1], [1.2, 2.0], CLAMP);
  const focusY = interpolate(zoomProgress, [0, 1], [0, 200], CLAMP);

  return (
    <>
      <PhoneScene
        alignment="right"
        paddingRight={80}
        offsetY={340}
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

            {/* Search bar */}
            <div
              style={{
                opacity: marketsOpacity,
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.surface2,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke={colors.textDim} strokeWidth="1.5" />
                <line x1="11" y1="11" x2="14.5" y2="14.5" stroke={colors.textDim} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.body }}>
                Search markets...
              </span>
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
                {MOCK_ASSETS.map((asset, i) => {
                  // Hover: glow when cursor is near this row
                  const dist = Math.abs(hoverFloat - i);
                  const hoverOpacity = frame >= 125 && frame <= 218 && dist < 1
                    ? interpolate(dist, [0, 1], [0.08, 0], CLAMP)
                    : 0;
                  // Click: bright flash on NVDA row
                  const isNvda = i === NVDA_INDEX;
                  const clickOpacity = isNvda ? clickFlash * 0.25 : 0;

                  return (
                    <div
                      key={asset.symbol}
                      style={{
                        opacity: rowOpacities[i],
                        borderBottom: `1px solid ${colors.border}`,
                        position: "relative",
                      }}
                    >
                      <MockAssetRow asset={asset} />
                      {/* Hover / click overlay */}
                      {(hoverOpacity > 0 || clickOpacity > 0) && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 4,
                            pointerEvents: "none",
                            backgroundColor: clickOpacity > 0
                              ? colors.accent
                              : colors.accent,
                            opacity: hoverOpacity + clickOpacity,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <MockBottomNav />
          <AnimatedCursor keyframes={CURSOR_KEYFRAMES} />
        </div>
      </PhoneScene>
      <SideCaption
        heading={SCENE_CAPTIONS.dashboard.heading}
        bullets={SCENE_CAPTIONS.dashboard.bullets}
        startFrame={30}
        bulletsStartFrame={60}
      />
      <PrimeLogo fadeInStart={30} />
    </>
  );
};
