import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { Confetti } from "../../components/Confetti";

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

  // Phase 3: Large center button reveal after the countdown.
  const buttonProgress = frame < 66
    ? 0
    : spring({ fps, frame: frame - 66, config: { damping: 12, mass: 0.3 } });
  const buttonScale = interpolate(buttonProgress, [0, 1], [0.6, 1], CLAMP);
  const buttonOpacity = interpolate(frame, [66, 72], [0, 1], CLAMP);

  // Phase 4: Cursor slides in and clicks the button.
  const cursorProgress = frame < 72
    ? 0
    : spring({ fps, frame: frame - 72, config: { damping: 14, mass: 0.35 } });
  const cursorX = interpolate(cursorProgress, [0, 1], [1500, 1070], CLAMP);
  const cursorY = interpolate(cursorProgress, [0, 1], [900, 575], CLAMP);
  const cursorOpacity = interpolate(cursorProgress, [0, 0.3], [0, 1], CLAMP);

  // Button click after cursor settles.
  const isClicking = frame >= 82 && frame <= 86;
  const clickScale = isClicking
    ? interpolate(frame, [82, 84, 86], [1, 0.94, 1], CLAMP)
    : 1;

  // Glow after click
  const clickGlow = frame >= 84
    ? interpolate(frame, [84, 90], [0, 1], CLAMP)
    : 0;

  // Phase 5: Success page appears after the click completes.
  const successProgress = frame < 88
    ? 0
    : spring({ fps, frame: frame - 88, config: { damping: 15, mass: 0.35 } });
  const successScale = interpolate(successProgress, [0, 1], [0.86, 1], CLAMP);
  const successOpacity = frame >= 88
    ? interpolate(frame, [88, 92, 101, 105], [0, 1, 1, 0], CLAMP)
    : 0;
  const successY = interpolate(successProgress, [0, 1], [120, 0], CLAMP);

  // Fade the button scene out as the success page comes in.
  const buttonSceneOpacity = interpolate(frame, [88, 92], [1, 0], CLAMP);

  // Exit
  const exitOpacity = interpolate(frame, [101, 105], [1, 0], CLAMP);

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

      {/* Long NVDA button */}
      {frame >= 66 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${buttonScale * clickScale})`,
            backgroundColor: colors.long,
            padding: "28px 120px",
            borderRadius: 18,
            boxShadow: clickGlow > 0
              ? `0 0 ${52 * clickGlow}px rgba(34, 197, 94, 0.5)`
              : `0 10px 30px rgba(0,0,0,0.3)`,
            cursor: "pointer",
            opacity: buttonOpacity * buttonSceneOpacity,
            zIndex: 20,
          }}
        >
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 48,
              fontWeight: 700,
              color: "white",
              letterSpacing: "0.02em",
            }}
          >
            Long NVDA
          </span>
        </div>
      )}

      {/* Click cursor on button */}
      {frame >= 72 && frame < 92 && (
        <div
          style={{
            position: "absolute",
            left: cursorX,
            top: cursorY,
            zIndex: 100,
            opacity: cursorOpacity * buttonSceneOpacity,
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

      {/* Success page after click */}
      {frame >= 88 && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            <Confetti triggerFrame={90} count={54} originX={960} originY={360} />
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "fit-content",
              maxWidth: 820,
              padding: "28px 34px 24px",
              borderRadius: 28,
              backgroundColor: colors.surface1,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
              transform: `translate(-50%, -50%) translateY(${successY}px) scale(${successScale})`,
              boxSizing: "border-box",
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  backgroundColor: colors.longMuted,
                  border: `2px solid ${colors.long}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 40px rgba(34, 197, 94, 0.2)",
                  flexShrink: 0,
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={colors.long} strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 66,
                  color: colors.long,
                  lineHeight: 1.05,
                  textAlign: "left",
                  textShadow: "0 0 34px rgba(34, 197, 94, 0.28)",
                  whiteSpace: "nowrap",
                }}
              >
                Position opened
              </div>
            </div>

            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 28,
                color: colors.textSecondary,
                lineHeight: 1.35,
                textAlign: "left",
              }}
            >
              Long NVDA routed and filled
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
