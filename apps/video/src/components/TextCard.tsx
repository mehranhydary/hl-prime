import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, typewriter } from "../lib/animations";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

interface Props {
  heading: string;
  bullets: string[];
}

/**
 * Full-screen text card scene for displaying key points.
 * Each bullet types in with a staggered entrance.
 */
export const TextCard: React.FC<Props> = ({ heading, bullets }) => {
  const frame = useCurrentFrame();

  // Heading fades in (frames 0-15)
  const headingOpacity = fadeIn(frame, 0, 15);
  const headingY = interpolate(frame, [0, 20], [20, 0], CLAMP);

  // Accent line grows (frames 10-25)
  const lineWidth = interpolate(frame, [10, 30], [0, 120], CLAMP);

  // Bullets stagger in
  const bulletStartFrame = 25;
  const bulletSpacing = 20; // frames between each bullet

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          padding: "0 80px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* Heading */}
        <div
          style={{
            opacity: headingOpacity,
            transform: `translateY(${headingY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 44,
              color: colors.accent,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
            }}
          >
            {heading}
          </div>
          {/* Accent underline */}
          <div
            style={{
              height: 3,
              width: lineWidth,
              backgroundColor: colors.accent,
              borderRadius: 2,
              marginTop: 12,
              opacity: 0.6,
            }}
          />
        </div>

        {/* Bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {bullets.map((text, i) => {
            const start = bulletStartFrame + i * bulletSpacing;
            const opacity = fadeIn(frame, start, 12);
            const y = interpolate(frame, [start, start + 15], [15, 0], CLAMP);
            const chars = typewriter(frame, start, text.length, 1);
            const visibleText = text.slice(0, chars);

            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                {/* Bullet dot */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: colors.accent,
                    flexShrink: 0,
                    marginTop: 10,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 26,
                    color: colors.textPrimary,
                    lineHeight: 1.4,
                    minHeight: 36,
                  }}
                >
                  {visibleText}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
