import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S13_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "P" scales in with spring (frames 0-20)
  const logoScale = spring({ fps, frame, config: { damping: 10, mass: 0.4 } });

  // Glow builds
  const glowIntensity = interpolate(frame, [10, 25], [0, 1], CLAMP);

  // Subtle pulse after reveal
  const pulsePhase = frame > 25 ? Math.sin((frame - 25) * 0.1) * 0.15 + 0.85 : 1;
  const finalGlow = glowIntensity * pulsePhase;

  // Fade to black (frames 45-60)
  const blackFade = interpolate(frame, [45, 60], [0, 1], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Logo "P" */}
      <div
        style={{
          fontFamily: fonts.logo,
          fontSize: 360,
          color: colors.accent,
          transform: `scale(${logoScale})`,
          textShadow: `0 0 ${50 * finalGlow}px rgba(80, 227, 181, ${0.6 * finalGlow}), 0 0 ${100 * finalGlow}px rgba(80, 227, 181, ${0.3 * finalGlow})`,
          lineHeight: 1,
        }}
      >
        P
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
