import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors } from "../styles/tokens";

interface Props {
  /** Frame at which confetti triggers */
  triggerFrame: number;
  /** Number of particles */
  count?: number;
  /** Center X in phone coordinates */
  originX?: number;
  /** Center Y in phone coordinates */
  originY?: number;
}

const PARTICLE_COLORS = [colors.accent, colors.long, "#FFD700"];
const DURATION = 70; // frames for full animation

/**
 * Deterministic confetti particle burst.
 * Uses index-based math (no Math.random) for Remotion frame-determinism.
 */
export const Confetti: React.FC<Props> = ({
  triggerFrame,
  count = 40,
  originX = 196,
  originY = 500,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < triggerFrame) return null;

  const elapsed = frame - triggerFrame;
  if (elapsed > DURATION) return null;

  const progress = elapsed / DURATION;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        // Deterministic angle using golden angle distribution
        const angle = i * 2.399 + (i % 5) * 0.3;
        // Varied speed per particle
        const speed = 3 + ((i * 7 + 3) % 6);
        // Varied start delay (0-5 frames)
        const delay = (i * 3) % 6;
        const localElapsed = Math.max(0, elapsed - delay);
        const localProgress = Math.min(1, localElapsed / (DURATION - delay));

        // Position: burst outward then gravity pulls down
        const burstX = Math.cos(angle) * speed * localProgress * 60;
        const burstY =
          Math.sin(angle) * speed * localProgress * 40 -
          localProgress * localProgress * 120; // gravity (negative = down in screen coords → positive burstY pulls up initially)
        const x = originX + burstX;
        const y = originY - burstY; // subtract because we want upward burst

        // Opacity fades out
        const opacity = interpolate(localProgress, [0, 0.6, 1], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Rotation
        const rotation = localProgress * (180 + i * 30);

        // Size varies by particle
        const size = 4 + (i % 3) * 2;
        const color = PARTICLE_COLORS[i % 3];
        const isCircle = i % 2 === 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: isCircle ? size : size * 1.6,
              borderRadius: isCircle ? "50%" : 1,
              backgroundColor: color,
              opacity,
              transform: `rotate(${rotation}deg)`,
              willChange: "transform",
            }}
          />
        );
      })}
    </div>
  );
};
