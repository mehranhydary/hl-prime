import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S07_BrowseText: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text slides in from right (frames 0-15)
  const slideProgress = spring({ fps, frame, config: { damping: 16, mass: 0.4 } });
  const textX = interpolate(slideProgress, [0, 1], [400, 0], CLAMP);
  const textOpacity = interpolate(slideProgress, [0, 0.3], [0, 1], CLAMP);

  // "sleek UI" highlight glow
  const glowIntensity = interpolate(frame, [15, 30], [0, 1], CLAMP);

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
          transform: `translateX(${textX}px)`,
          opacity: textOpacity,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 64,
            color: colors.textPrimary,
            lineHeight: 1.4,
          }}
        >
          Use Prime's{" "}
          <span
            style={{
              color: colors.accent,
              textShadow: glowIntensity > 0
                ? `0 0 ${20 * glowIntensity}px rgba(80, 227, 181, ${0.4 * glowIntensity})`
                : "none",
            }}
          >
            sleek UI
          </span>
          {" "}to browse markets
        </span>
      </div>
    </AbsoluteFill>
  );
};
