import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export interface CursorKeyframe {
  frame: number;
  x: number;
  y: number;
  /** Show click ripple effect */
  click?: boolean;
}

interface Props {
  keyframes: CursorKeyframe[];
}

const ArrowSVG: React.FC = () => (
  <svg width="20" height="24" viewBox="0 0 16 20" style={{ display: "block" }}>
    <path
      d="M1 1L1 15L5 11L8.5 18L10.5 17L7 10.5L12 10.5L1 1Z"
      fill="white"
      stroke="#111"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

export const AnimatedCursor: React.FC<Props> = ({ keyframes }) => {
  const frame = useCurrentFrame();

  if (keyframes.length === 0) return null;
  if (frame < keyframes[0].frame) return null;

  const frames = keyframes.map((k) => k.frame);
  const xs = keyframes.map((k) => k.x);
  const ys = keyframes.map((k) => k.y);

  const x = interpolate(frame, frames, xs, CLAMP);
  const y = interpolate(frame, frames, ys, CLAMP);

  // Determine click state from nearest past keyframe
  let isClicking = false;
  for (let i = keyframes.length - 1; i >= 0; i--) {
    if (frame >= keyframes[i].frame) {
      isClicking = keyframes[i].click ?? false;
      break;
    }
  }

  const opacity = interpolate(
    frame,
    [keyframes[0].frame, keyframes[0].frame + 10],
    [0, 1],
    CLAMP,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 100,
        pointerEvents: "none",
        opacity,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
      }}
    >
      <ArrowSVG />
      {isClicking && (
        <div
          style={{
            position: "absolute",
            top: -13,
            left: -13,
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "rgba(80, 227, 181, 0.2)",
            border: "1.5px solid rgba(80, 227, 181, 0.35)",
          }}
        />
      )}
    </div>
  );
};
