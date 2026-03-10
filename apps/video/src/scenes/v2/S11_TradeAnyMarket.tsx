import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const V2S11_TradeAnyMarket: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Simulated phone sliding down (like a panel) — dark overlay first
  const panelProgress = spring({ fps, frame, config: { damping: 14, mass: 0.4 } });
  const panelY = interpolate(panelProgress, [0, 1], [0, 1080], CLAMP);

  // Phone silhouette rectangle sliding down
  const phoneOpacity = interpolate(panelProgress, [0, 0.5], [0.4, 0], CLAMP);

  // Text pops in after phone exits (frames 12-25)
  const textProgress = frame < 12
    ? 0
    : spring({ fps, frame: frame - 12, config: { damping: 12, mass: 0.3 } });
  const textScale = interpolate(textProgress, [0, 1], [0.7, 1], CLAMP);
  const textOpacity = interpolate(textProgress, [0, 0.3], [0, 1], CLAMP);

  // Exit (frames 40-50)
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
      {/* Phone silhouette sliding down */}
      <div
        style={{
          position: "absolute",
          right: 200,
          top: panelY - 500,
          width: 300,
          height: 600,
          borderRadius: 24,
          backgroundColor: colors.surface2,
          opacity: phoneOpacity,
          boxShadow: `0 0 40px rgba(0,0,0,0.3)`,
        }}
      />

      {/* "Trade any market" text */}
      <div
        style={{
          transform: `scale(${textScale})`,
          opacity: textOpacity,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 80,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}
        >
          Trade{" "}
          <span style={{ color: colors.accent }}>any</span>
          {" "}market
        </div>
      </div>
    </AbsoluteFill>
  );
};
