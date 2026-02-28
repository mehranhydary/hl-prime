import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn, fadeOut, typewriter } from "../lib/animations";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

interface Props {
  heading: string;
  bullets: (string | React.ReactNode)[];
  /** Frame at which heading starts appearing */
  startFrame?: number;
  /** Frame at which bullets start appearing */
  bulletsStartFrame?: number;
  /** Frame at which everything fades out (0 = no fade out) */
  fadeOutFrame?: number;
  /** Frames per character for typewriter (lower = faster). Default 2 */
  typeSpeed?: number;
  /** Frames between bullet start times. Default 40 */
  bulletGap?: number;
}

/**
 * Left-side explanatory text that appears alongside the phone.
 * Uses typewriter + fade patterns from TextCard, positioned on the left
 * half of the 1920x1080 viewport.
 */
export const SideCaption: React.FC<Props> = ({
  heading,
  bullets,
  startFrame = 20,
  bulletsStartFrame = 50,
  fadeOutFrame = 0,
  typeSpeed = 2,
  bulletGap = 40,
}) => {
  const frame = useCurrentFrame();

  const headingOpacity = fadeIn(frame, startFrame, 15);
  const headingY = interpolate(frame, [startFrame, startFrame + 20], [20, 0], CLAMP);
  const lineWidth = interpolate(frame, [startFrame + 10, startFrame + 30], [0, 100], CLAMP);

  // Optional fade out
  const groupOpacity = fadeOutFrame > 0 ? fadeOut(frame, fadeOutFrame, 20) : 1;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        pointerEvents: "none",
        opacity: groupOpacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 0,
          bottom: 0,
          width: 800,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 28,
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
              fontSize: 72,
              color: colors.accent,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
            }}
          >
            {heading}
          </div>
          <div
            style={{
              height: 3,
              width: lineWidth,
              backgroundColor: colors.accent,
              borderRadius: 2,
              marginTop: 10,
              opacity: 0.6,
            }}
          />
        </div>

        {/* Bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {bullets.map((item, i) => {
            const start = bulletsStartFrame + i * bulletGap;
            const opacity = fadeIn(frame, start, 12);
            const y = interpolate(frame, [start, start + 15], [15, 0], CLAMP);
            const isString = typeof item === "string";
            const content = isString
              ? item.slice(0, typewriter(frame, start, item.length, typeSpeed))
              : item;

            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: colors.accent,
                    flexShrink: 0,
                    opacity: 0.7,
                  }}
                />
                <div
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 48,
                    color: colors.textPrimary,
                    lineHeight: 1.4,
                    minHeight: 54,
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
