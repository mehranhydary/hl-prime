import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S09_TradeText: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text springs in from center (scale up)
  const textProgress = spring({ fps, frame, config: { damping: 14, mass: 0.3 } });
  const textScale = interpolate(textProgress, [0, 1], [0.6, 1], CLAMP);
  const textOpacity = interpolate(textProgress, [0, 0.3], [0, 1], CLAMP);

  // "single click" accent highlight
  const accentGlow = interpolate(frame, [15, 30], [0, 1], CLAMP);

  // Exit
  const exitOpacity = interpolate(frame, [40, 50], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exitOpacity,
      }}
    >
      <div
        style={{
          transform: `scale(${textScale})`,
          opacity: textOpacity,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 62,
            color: colors.textPrimary,
            lineHeight: 1.3,
          }}
        >
          Trade any market in a{" "}
          <span
            style={{
              color: colors.accent,
              textShadow: accentGlow > 0
                ? `0 0 ${25 * accentGlow}px rgba(80, 227, 181, ${0.4 * accentGlow})`
                : "none",
            }}
          >
            single click
          </span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
