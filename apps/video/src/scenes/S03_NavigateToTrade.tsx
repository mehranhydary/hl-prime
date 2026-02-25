import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockBalanceCard } from "../components/MockBalanceCard";
import { MockPositionRow } from "../components/MockPositionRow";
import { MockAssetRow } from "../components/MockAssetRow";
import { MOCK_POSITIONS, MOCK_ASSETS, MOCK_TRADE } from "../lib/mock-data";

export const S03_NavigateToTrade: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ETH row highlight (frames 0-15)
  const highlightOpacity = interpolate(frame, [0, 8, 15], [0, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slide transition (frames 15-75)
  // Dashboard slides out left, trade page slides in from right
  const slideProgress = frame < 15
    ? 0
    : spring({ fps, frame: frame - 15, config: { damping: 15, mass: 0.8 } });

  const dashboardX = interpolate(slideProgress, [0, 1], [0, -1080], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tradePageX = interpolate(slideProgress, [0, 1], [1080, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scroll position from end of S02
  const scrollOffset = -180;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0, overflow: "hidden" }}>
      {/* Dashboard page (sliding out) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${dashboardX}px)`,
        }}
      >
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
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <MockBalanceCard />
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
              {MOCK_POSITIONS.map((pos, i) => (
                <div
                  key={pos.symbol}
                  style={{
                    borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                  }}
                >
                  <MockPositionRow position={pos} />
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: colors.textPrimary,
                fontFamily: fonts.heading,
                marginTop: 4,
              }}
            >
              Markets
            </div>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div style={{ transform: `translateY(${scrollOffset}px)` }}>
                {MOCK_ASSETS.map((asset) => (
                  <div
                    key={asset.symbol}
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      position: "relative",
                    }}
                  >
                    <MockAssetRow
                      asset={asset}
                      highlighted={asset.symbol === "ETH"}
                    />
                    {/* ETH highlight overlay */}
                    {asset.symbol === "ETH" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundColor: colors.accent,
                          opacity: highlightOpacity * 0.15,
                          borderRadius: 4,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <MockBottomNav />
        </div>
      </div>

      {/* Trade page (sliding in) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${tradePageX}px)`,
        }}
      >
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
            }}
          >
            {/* Back button */}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </div>

            {/* Asset header */}
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

            {/* Price placeholder */}
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: colors.textPrimary,
                fontFamily: fonts.body,
              }}
            >
              ${MOCK_TRADE.currentPrice}
            </div>

            {/* Chart placeholder */}
            <div
              style={{
                height: 280,
                backgroundColor: colors.surface1,
                borderRadius: 4,
              }}
            />
          </div>
          <MockBottomNav />
        </div>
      </div>
    </AbsoluteFill>
  );
};
