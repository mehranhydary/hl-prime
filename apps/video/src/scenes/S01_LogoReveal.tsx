import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { typewriter, glowPulse, fadeIn } from "../lib/animations";
import { hlTokenIcon } from "../lib/mock-data";

const APP_NAME = "Prime";
const SUBTITLE = "on Hyperliquid";
const HYPE_LOGO = hlTokenIcon("HYPE");

export const S01_LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "P" scales in with spring (frames 15-45)
  const logoScale = frame < 15
    ? 0
    : spring({ fps, frame: frame - 15, config: { damping: 12, mass: 0.5 } });

  // Glow ramps up (frames 30-50)
  const glowIntensity = glowPulse(frame, 30, 20);

  // Subtle glow pulse after reveal (frames 90+)
  const pulsePhase = frame > 90 ? Math.sin((frame - 90) * 0.08) * 0.15 + 0.85 : 1;
  const finalGlow = glowIntensity * pulsePhase;

  // App name typewriter (frames 50-70)
  const visibleChars = typewriter(frame, 50, APP_NAME.length, 3);
  const nameText = APP_NAME.slice(0, visibleChars);

  // Name opacity
  const nameOpacity = interpolate(frame, [50, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle fades in after name completes (frames 75-90)
  const subtitleOpacity = fadeIn(frame, 75, 15);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {/* Logo "P" */}
      <div
        style={{
          fontFamily: fonts.logo,
          fontSize: 360,
          color: colors.accent,
          transform: `scale(${logoScale})`,
          textShadow: `0 0 ${40 * finalGlow}px rgba(80, 227, 181, ${0.6 * finalGlow}), 0 0 ${80 * finalGlow}px rgba(80, 227, 181, ${0.3 * finalGlow})`,
          lineHeight: 1,
        }}
      >
        P
      </div>

      {/* App name + subtitle on one line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minHeight: 120,
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 112,
            color: colors.textPrimary,
            letterSpacing: "0.05em",
            opacity: nameOpacity,
          }}
        >
          {nameText}
          {visibleChars < APP_NAME.length && visibleChars > 0 && (
            <span
              style={{
                opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                color: colors.accent,
              }}
            >
              |
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 44,
            color: colors.textMuted,
            letterSpacing: "0.08em",
            opacity: subtitleOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {SUBTITLE}
          <img
            src={HYPE_LOGO}
            alt="HYPE"
            style={{ width: 40, height: 40, borderRadius: "50%" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
