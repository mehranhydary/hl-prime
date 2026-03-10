import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S02_SayHello: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole line slides in from left (frames 0-15)
  const lineProgress = spring({ fps, frame, config: { damping: 18, mass: 0.4 } });
  const lineX = interpolate(lineProgress, [0, 1], [-600, 0], CLAMP);
  const lineOpacity = interpolate(lineProgress, [0, 0.3], [0, 1], CLAMP);

  // Glow on "Prime" (frames 15-30)
  const primeGlow = interpolate(frame, [15, 30], [0, 1], CLAMP);

  // Exit fade (frames 40-50)
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
          display: "flex",
          alignItems: "baseline",
          gap: 20,
          transform: `translateX(${lineX}px)`,
          opacity: lineOpacity,
        }}
      >
        <span
          style={{
            fontFamily: fonts.body,
            fontSize: 88,
            color: colors.textSecondary,
            letterSpacing: "0.04em",
          }}
        >
          Say hello to
        </span>
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 88,
            color: colors.accent,
            letterSpacing: "0.02em",
            textShadow: `0 0 ${50 * primeGlow}px rgba(80, 227, 181, ${0.5 * primeGlow}), 0 0 ${100 * primeGlow}px rgba(80, 227, 181, ${0.2 * primeGlow})`,
          }}
        >
          Prime
        </span>
      </div>
    </AbsoluteFill>
  );
};
