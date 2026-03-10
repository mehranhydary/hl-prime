import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S06_FastExecution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: "And the fastest execution(s)" text (frames 0-20)
  const titleProgress = spring({ fps, frame, config: { damping: 16, mass: 0.4 } });
  const titleScale = interpolate(titleProgress, [0, 1], [0.8, 1], CLAMP);
  const titleOpacity = interpolate(titleProgress, [0, 0.3], [0, 1], CLAMP);
  const titleExit = interpolate(frame, [25, 35], [1, 0], CLAMP);

  // Phase 2: Countdown 3-2-1 (frames 30-70)
  const countdownNumber =
    frame < 30 ? null :
    frame < 42 ? "3" :
    frame < 54 ? "2" :
    frame < 66 ? "1" :
    null;

  const countdownFrame =
    frame < 42 ? frame - 30 :
    frame < 54 ? frame - 42 :
    frame < 66 ? frame - 54 : 0;

  const countScale = countdownNumber
    ? spring({ fps, frame: countdownFrame, config: { damping: 10, mass: 0.3 } })
    : 0;
  const countOpacity = countdownNumber
    ? interpolate(countdownFrame, [0, 3, 9, 12], [0, 1, 1, 0], CLAMP)
    : 0;

  // Phase 3: Flash "Orders Opened!" (frames 66-80)
  const flashProgress = frame < 66
    ? 0
    : spring({ fps, frame: frame - 66, config: { damping: 12, mass: 0.3 } });
  const flashScale = interpolate(flashProgress, [0, 1], [0.5, 1], CLAMP);
  const flashOpacity = frame >= 66 ? interpolate(frame, [66, 70, 78, 82], [0, 1, 1, 0], CLAMP) : 0;

  // Phase 4: Long NVDA button (frames 78-105)
  const buttonProgress = frame < 78
    ? 0
    : spring({ fps, frame: frame - 78, config: { damping: 14, mass: 0.4 } });
  const buttonScale = interpolate(buttonProgress, [0, 1], [0, 1], CLAMP);

  // Button click at frame 88
  const isClicking = frame >= 88 && frame <= 92;
  const clickScale = isClicking
    ? interpolate(frame, [88, 90, 92], [1, 0.95, 1], CLAMP)
    : 1;

  // Glow after click
  const clickGlow = frame >= 90
    ? interpolate(frame, [90, 95], [0, 1], CLAMP)
    : 0;

  // Exit
  const exitOpacity = interpolate(frame, [95, 105], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: exitOpacity,
      }}
    >
      {/* Title */}
      {frame < 35 && (
        <div
          style={{
            position: "absolute",
            fontFamily: fonts.heading,
            fontSize: 68,
            color: colors.textPrimary,
            transform: `scale(${titleScale})`,
            opacity: titleOpacity * titleExit,
            textAlign: "center",
          }}
        >
          And the{" "}
          <span style={{ color: colors.accent }}>fastest</span>
          {" "}execution(s)
        </div>
      )}

      {/* Countdown numbers */}
      {countdownNumber && (
        <div
          style={{
            position: "absolute",
            fontFamily: fonts.logo,
            fontSize: 300,
            color: colors.accent,
            transform: `scale(${countScale})`,
            opacity: countOpacity,
            textShadow: `0 0 60px rgba(80, 227, 181, 0.5)`,
            lineHeight: 1,
          }}
        >
          {countdownNumber}
        </div>
      )}

      {/* "Orders Opened!" flash */}
      {frame >= 66 && frame < 82 && (
        <div
          style={{
            position: "absolute",
            fontFamily: fonts.heading,
            fontSize: 80,
            color: colors.long,
            transform: `scale(${flashScale})`,
            opacity: flashOpacity,
            textShadow: `0 0 40px rgba(34, 197, 94, 0.5)`,
          }}
        >
          Orders Opened!
        </div>
      )}

      {/* Long NVDA button */}
      {frame >= 78 && (
        <div
          style={{
            position: "absolute",
            bottom: 300,
            transform: `scale(${buttonScale * clickScale})`,
            backgroundColor: colors.long,
            padding: "20px 80px",
            borderRadius: 12,
            boxShadow: clickGlow > 0
              ? `0 0 ${40 * clickGlow}px rgba(34, 197, 94, 0.5)`
              : `0 4px 20px rgba(0,0,0,0.3)`,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 36,
              fontWeight: 700,
              color: "white",
            }}
          >
            Long NVDA
          </span>
        </div>
      )}

      {/* Click cursor on button */}
      {frame >= 82 && frame < 95 && (
        <div
          style={{
            position: "absolute",
            bottom: 270,
            left: "50%",
            transform: "translateX(40px)",
            zIndex: 100,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          }}
        >
          <svg width="24" height="28" viewBox="0 0 16 20">
            <path
              d="M1 1L1 15L5 11L8.5 18L10.5 17L7 10.5L12 10.5L1 1Z"
              fill="white"
              stroke="#111"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          {isClicking && (
            <div
              style={{
                position: "absolute",
                top: -14,
                left: -14,
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: "rgba(80, 227, 181, 0.25)",
                border: "2px solid rgba(80, 227, 181, 0.4)",
              }}
            />
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
