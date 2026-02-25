import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, slideUp } from "../lib/animations";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { MOCK_POSITIONS, MOCK_ASSETS } from "../lib/mock-data";

export const S02_DashboardDebut: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone frame fades in and scales (frames 0-20)
  const frameScale = interpolate(
    spring({ fps, frame, config: { damping: 14, mass: 0.6 } }),
    [0, 1],
    [0.95, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const frameOpacity = fadeIn(frame, 0, 20);

  // Header slides down (frames 20-40)
  const headerY = slideUp(fps, frame, 20, -50);

  // Balance card slides from left (frames 35-55)
  const balanceX = frame < 35
    ? -400
    : interpolate(
        spring({ fps, frame: frame - 35, config: { damping: 12, mass: 0.5 } }),
        [0, 1],
        [-400, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
  const balanceOpacity = fadeIn(frame, 35, 15);

  // Positions fade in (frames 50-70)
  const pos1Opacity = fadeIn(frame, 50, 12);
  const pos1Y = slideUp(fps, frame, 50, 20);
  const pos2Opacity = fadeIn(frame, 55, 12);
  const pos2Y = slideUp(fps, frame, 55, 20);

  // "Markets" heading (frames 65-75)
  const marketsOpacity = fadeIn(frame, 65, 12);

  // Market list scroll (frames 75-160) — smooth continuous scroll
  const scrollOffset = interpolate(
    frame,
    [75, 160],
    [0, -180],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Staggered row appearance
  const rowOpacities = MOCK_ASSETS.map((_, i) =>
    fadeIn(frame, 75 + i * 4, 10),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${frameScale})`,
          opacity: frameOpacity,
          display: "flex",
          flexDirection: "column",
          position: "relative",
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
            padding: "16px 20px",
            paddingBottom: 72,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Balance card */}
          <div
            style={{
              transform: `translateX(${balanceX}px)`,
              opacity: balanceOpacity,
            }}
          >
            <MockBalanceCard />
          </div>

          {/* Positions section */}
          <div
            style={{
              backgroundColor: colors.surface2,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: colors.textMuted,
                  fontFamily: fonts.body,
                }}
              >
                OPEN POSITIONS ({MOCK_POSITIONS.length})
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: colors.accent,
                  fontFamily: fonts.body,
                }}
              >
                View all
              </span>
            </div>
            <div
              style={{
                opacity: pos1Opacity,
                transform: `translateY(${pos1Y}px)`,
              }}
            >
              <MockPositionRow position={MOCK_POSITIONS[0]} />
            </div>
            <div
              style={{
                borderTop: `1px solid ${colors.border}`,
                opacity: pos2Opacity,
                transform: `translateY(${pos2Y}px)`,
              }}
            >
              <MockPositionRow position={MOCK_POSITIONS[1]} />
            </div>
          </div>

          {/* Markets heading */}
          <div
            style={{
              opacity: marketsOpacity,
              fontSize: 18,
              fontWeight: 600,
              color: colors.textPrimary,
              fontFamily: fonts.heading,
              marginTop: 4,
            }}
          >
            Markets
          </div>

          {/* Asset list header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "4px 0",
              opacity: marketsOpacity,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: 9,
                letterSpacing: "0.1em",
                color: colors.textDim,
                fontFamily: fonts.body,
                paddingLeft: 42,
              }}
            >
              ASSET
            </div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                color: colors.textDim,
                fontFamily: fonts.body,
                minWidth: 80,
                textAlign: "right",
              }}
            >
              PRICE
            </div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                color: colors.textDim,
                fontFamily: fonts.body,
                minWidth: 65,
                textAlign: "right",
              }}
            >
              24H
            </div>
          </div>

          {/* Asset list (scrolling) */}
          <div
            style={{
              overflow: "hidden",
              flex: 1,
            }}
          >
            <div
              style={{
                transform: `translateY(${scrollOffset}px)`,
              }}
            >
              {MOCK_ASSETS.map((asset, i) => (
                <div
                  key={asset.symbol}
                  style={{
                    opacity: rowOpacities[i],
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <MockAssetRow asset={asset} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom nav */}
        <MockBottomNav />
      </div>
    </AbsoluteFill>
  );
};
