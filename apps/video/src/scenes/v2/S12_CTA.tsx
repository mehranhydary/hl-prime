import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { typewriter } from "../../lib/animations";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const URL_TEXT = "app.hlprime.xyz";

export const V2S12_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const urlTextStyle = {
    fontFamily: fonts.heading,
    fontSize: 88,
    color: colors.accent,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap" as const,
  };

  // "Try it out on" slides up (frames 0-15)
  const line1Progress = spring({ fps, frame, config: { damping: 16, mass: 0.4 } });
  const line1Y = interpolate(line1Progress, [0, 1], [40, 0], CLAMP);
  const line1Opacity = interpolate(line1Progress, [0, 0.3], [0, 1], CLAMP);

  // URL typewriter effect (frames 15-45)
  const urlChars = typewriter(frame, 15, URL_TEXT.length, 2);
  const urlText = URL_TEXT.slice(0, urlChars);
  const urlOpacity = interpolate(frame, [15, 20], [0, 1], CLAMP);

  // Cursor blink for typewriter
  const showCursor = urlChars < URL_TEXT.length && urlChars > 0;

  // Glow pulse on URL (frames 45-65)
  const glowPhase = frame > 45 ? Math.sin((frame - 45) * 0.12) * 0.3 + 0.7 : 0;

  // Underline draws in (frames 40-55)
  const underlineWidth = interpolate(frame, [40, 55], [0, 100], CLAMP);

  // Exit (frames 65-75)
  const exitOpacity = interpolate(frame, [65, 75], [1, 0], CLAMP);

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
          whiteSpace: "nowrap",
          transform: `translateY(${line1Y}px)`,
          opacity: line1Opacity,
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
          Try it out on
        </span>
        <div
          style={{
            position: "relative",
            display: "inline-block",
            alignItems: "baseline",
            paddingBottom: 12,
          }}
        >
          <span
            style={{
              ...urlTextStyle,
              visibility: "hidden",
              pointerEvents: "none",
            }}
          >
            {URL_TEXT}
          </span>

          <span
            style={{
              ...urlTextStyle,
              position: "absolute",
              left: 0,
              top: 0,
              opacity: urlOpacity,
              textShadow: glowPhase > 0
                ? `0 0 ${30 * glowPhase}px rgba(80, 227, 181, ${0.4 * glowPhase})`
                : "none",
            }}
          >
            {urlText}
            {showCursor && (
              <span
                style={{
                  opacity: Math.sin(frame * 0.4) > 0 ? 1 : 0,
                  color: colors.accent,
                }}
              >
                |
              </span>
            )}
          </span>

          {/* Underline */}
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: 0,
              width: `${underlineWidth}%`,
              height: 3,
              backgroundColor: colors.accent,
              borderRadius: 2,
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
