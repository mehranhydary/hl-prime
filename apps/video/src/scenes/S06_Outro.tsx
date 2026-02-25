import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { typewriter } from "../lib/animations";
import { PhoneScene } from "../components/PhoneScene";
import { MockHeader } from "../components/MockHeader";
import { MockBottomNav } from "../components/MockBottomNav";
import { MockFillResult } from "../components/MockFillResult";
import { MOCK_TRADE } from "../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const TAGLINE = "Trade every market.";

export const S06_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -- Phase 1: Phone zooms out and shrinks (frames 0-40) --
  const shrinkProgress = frame < 0
    ? 0
    : interpolate(
        spring({ fps, frame, config: { damping: 14, mass: 0.7 } }),
        [0, 1], [0, 1], CLAMP,
      );

  const phoneZoom = interpolate(shrinkProgress, [0, 1], [1.7, 0.7], CLAMP);
  const phoneOpacity = interpolate(frame, [30, 50], [1, 0], CLAMP);

  // -- Phase 2: Logo + tagline (frames 40-100) --
  const logoScale = frame < 45
    ? 0
    : spring({ fps, frame: frame - 45, config: { damping: 12, mass: 0.5 } });

  const visibleChars = typewriter(frame, 60, TAGLINE.length, 2);
  const taglineText = TAGLINE.slice(0, visibleChars);
  const taglineOpacity = interpolate(frame, [60, 65], [0, 1], CLAMP);

  // -- Phase 3: Fade to black (frames 100-120) --
  const blackFade = interpolate(frame, [100, 120], [0, 1], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
      {/* Phone shrinking away */}
      {phoneOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: phoneOpacity }}>
          <PhoneScene zoom={phoneZoom} focusX={0} focusY={100}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", backgroundColor: colors.surface2 }}>
                    <img src={MOCK_TRADE.iconUrl} alt={MOCK_TRADE.asset} style={{ width: 24, height: 24 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                    {MOCK_TRADE.asset}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body, marginLeft: "auto" }}>
                    ${MOCK_TRADE.currentPrice}
                  </span>
                </div>
                <MockFillResult visibleLegs={2} />
              </div>
              <MockBottomNav />
            </div>
          </PhoneScene>
        </div>
      )}

      {/* Center logo + tagline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: fonts.logo,
            fontSize: 140,
            color: colors.accent,
            transform: `scale(${logoScale})`,
            textShadow: `0 0 40px rgba(80, 227, 181, 0.5), 0 0 80px rgba(80, 227, 181, 0.25)`,
            lineHeight: 1,
          }}
        >
          P
        </div>
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 40,
            color: colors.accent,
            letterSpacing: "0.04em",
            opacity: taglineOpacity,
            minHeight: 48,
          }}
        >
          {taglineText}
        </div>
      </div>

      {/* Fade to black */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "black",
          opacity: blackFade,
        }}
      />
    </AbsoluteFill>
  );
};
