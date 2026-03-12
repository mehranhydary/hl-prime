import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S01_LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: "P" scales in from 0 at center (frames 0-20)
  const logoScale = frame < 5
    ? 0
    : spring({ fps, frame: frame - 5, config: { damping: 14, mass: 0.4 } });

  // Glow ramps up with logo
  const glowIntensity = interpolate(frame, [10, 25], [0, 1], CLAMP);

  // Subtle glow pulse after reveal (frames 40+)
  const pulsePhase = frame > 40 ? Math.sin((frame - 40) * 0.1) * 0.15 + 0.85 : 1;
  const glowFadeOut = interpolate(frame, [56, 70], [1, 0], CLAMP);
  const finalGlow = glowIntensity * pulsePhase * glowFadeOut;

  // Phase 2: Everything zooms in (frames 65-90) — scale up + fade out
  const zoomOutProgress = frame < 65
    ? 0
    : spring({ fps, frame: frame - 65, config: { damping: 12, mass: 0.5 } });
  const exitScale = interpolate(zoomOutProgress, [0, 1], [1, 2.2], CLAMP);
  const exitOpacity = interpolate(frame, [68, 84], [1, 0], CLAMP);
  const textShadow = finalGlow > 0.02
    ? `0 0 ${24 * finalGlow}px rgba(80, 227, 181, ${0.4 * finalGlow}), 0 0 ${48 * finalGlow}px rgba(80, 227, 181, ${0.18 * finalGlow})`
    : "none";

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
          transform: `translateZ(0) scale(${logoScale * exitScale})`,
          opacity: exitOpacity,
          textShadow,
          lineHeight: 1,
          transformOrigin: "center center",
          willChange: "transform, opacity",
        }}
      >
        P
      </div>
    </AbsoluteFill>
  );
};
