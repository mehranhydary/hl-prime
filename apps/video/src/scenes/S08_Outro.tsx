import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { typewriter } from "../lib/animations";

const TAGLINE = "Trade every market.";

export const S08_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade out previous content (frames 0-25)
  const contentFade = interpolate(frame, [0, 25], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo fades in (frames 25-40)
  const logoScale = frame < 25
    ? 0
    : spring({ fps, frame: frame - 25, config: { damping: 12, mass: 0.5 } });

  // Tagline typewriter (frames 40-68 — ~1.5 frames per char for 19 chars)
  const visibleChars = typewriter(frame, 40, TAGLINE.length, 2);
  const taglineText = TAGLINE.slice(0, visibleChars);
  const taglineOpacity = interpolate(frame, [40, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade to black (frames 90-104)
  const blackFade = interpolate(frame, [90, 104], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
      {/* Center content */}
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
        {/* Logo "P" */}
        <div
          style={{
            fontFamily: fonts.logo,
            fontSize: 150,
            color: colors.accent,
            transform: `scale(${logoScale})`,
            textShadow: `0 0 40px rgba(80, 227, 181, 0.5), 0 0 80px rgba(80, 227, 181, 0.25)`,
            lineHeight: 1,
          }}
        >
          P
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 36,
            color: colors.accent,
            letterSpacing: "0.04em",
            opacity: taglineOpacity,
            minHeight: 44,
          }}
        >
          {taglineText}
        </div>
      </div>

      {/* Fade to black overlay */}
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
