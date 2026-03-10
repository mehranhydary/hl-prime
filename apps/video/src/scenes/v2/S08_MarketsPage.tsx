import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { PhoneScene } from "../../components/PhoneScene";
import { MockHeader } from "../../components/MockHeader";
import { MockBottomNav } from "../../components/MockBottomNav";
import { MockBalanceCard } from "../../components/MockBalanceCard";
import { MockAssetRow } from "../../components/MockAssetRow";
import { MOCK_ASSETS } from "../../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Extended asset list for scrolling effect
const EXTRA_ASSETS = [
  { symbol: "DOGE", coin: "DOGE" as const, name: "Dogecoin", price: "0.3421", change: "+5.12%", positive: true, volume: "1.2B", iconUrl: "https://app.hyperliquid.xyz/coins/DOGE.svg" },
  { symbol: "LINK", coin: "LINK" as const, name: "Chainlink", price: "22.45", change: "+3.80%", positive: true, volume: "450M", iconUrl: "https://app.hyperliquid.xyz/coins/LINK.svg" },
  { symbol: "AVAX", coin: "AVAX" as const, name: "Avalanche", price: "38.12", change: "-1.23%", positive: false, volume: "380M", iconUrl: "https://app.hyperliquid.xyz/coins/AVAX.svg" },
  { symbol: "ARB", coin: "ARB" as const, name: "Arbitrum", price: "1.45", change: "+2.10%", positive: true, volume: "290M", iconUrl: "https://app.hyperliquid.xyz/coins/ARB.svg" },
];

const ALL_ASSETS = [...MOCK_ASSETS, ...EXTRA_ASSETS];

export const V2S08_MarketsPage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone slides in from bottom (frames 0-20)
  const phoneEnter = spring({ fps, frame, config: { damping: 14, mass: 0.5 } });
  const phoneY = interpolate(phoneEnter, [0, 1], [600, 0], CLAMP);
  const phoneOpacity = interpolate(phoneEnter, [0, 0.3], [0, 1], CLAMP);

  // Auto-scroll down through markets (frames 25-100)
  const scrollOffset = interpolate(frame, [25, 100], [0, -280], CLAMP);

  // Staggered row entrance
  const rowOpacities = ALL_ASSETS.map((_, i) =>
    interpolate(frame, [10 + i * 2, 18 + i * 2], [0, 1], CLAMP),
  );

  // Exit: phone slides down (frames 115-135)
  const exitProgress = frame < 115
    ? 0
    : interpolate(frame, [115, 135], [0, 1], CLAMP);
  const exitY = interpolate(exitProgress, [0, 1], [0, 800], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${phoneY + exitY}px)`,
          opacity: phoneOpacity,
        }}
      >
        <PhoneScene alignment="center" zoom={1.1} focusY={-20}>
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
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Balance card */}
              <MockBalanceCard />

              {/* Markets heading */}
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  fontFamily: fonts.heading,
                  marginTop: 4,
                }}
              >
                Markets
              </div>

              {/* Search bar */}
              <div
                style={{
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
              <div style={{ display: "flex", alignItems: "center", padding: "2px 0" }}>
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

              {/* Scrollable asset list */}
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ transform: `translateY(${scrollOffset}px)` }}>
                  {ALL_ASSETS.map((asset, i) => (
                    <div
                      key={asset.symbol}
                      style={{
                        opacity: rowOpacities[i] ?? 1,
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <MockAssetRow asset={asset as any} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <MockBottomNav />
          </div>
        </PhoneScene>
      </div>
    </AbsoluteFill>
  );
};
