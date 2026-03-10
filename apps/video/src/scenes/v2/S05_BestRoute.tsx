import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { hlTokenIcon } from "../../lib/mock-data";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const MARKETPLACES = [
  { name: "xyz", icon: staticFile("perp-dexes/xyz.png") },
  { name: "flx", icon: staticFile("perp-dexes/flx.png") },
  { name: "km", icon: staticFile("perp-dexes/km.png") },
  { name: "cash", icon: staticFile("perp-dexes/cash.png") },
  { name: "hyna", icon: staticFile("perp-dexes/hyna.png") },
  { name: "vntls", icon: staticFile("perp-dexes/vntls.png") },
  { name: "HL", icon: hlTokenIcon("HYPE") },
];

const TEXT_SAFE_ZONE = {
  left: 560,
  right: 1360,
  top: 430,
  bottom: 650,
};

const LOGO_LAYOUT: Array<{ x: number; y: number }> = [
  { x: 180, y: 180 },
  { x: 360, y: 320 },
  { x: 220, y: 510 },
  { x: 340, y: 700 },
  { x: 190, y: 900 },
  { x: 1740, y: 180 },
  { x: 1560, y: 320 },
  { x: 1700, y: 510 },
  { x: 1580, y: 700 },
  { x: 1730, y: 900 },
  { x: 650, y: 170 },
  { x: 1270, y: 170 },
  { x: 560, y: 320 },
  { x: 1360, y: 320 },
  { x: 500, y: 760 },
  { x: 1420, y: 760 },
  { x: 760, y: 880 },
  { x: 1160, y: 880 },
  { x: 120, y: 560 },
  { x: 1800, y: 560 },
];

const LOGO_NODES = LOGO_LAYOUT.map((point, i) => {
  const market = MARKETPLACES[i % MARKETPLACES.length];
  return {
    id: `${market.name}-${i}`,
    name: market.name,
    icon: market.icon,
    x: point.x,
    y: point.y,
    size: 64 + ((i * 11) % 22),
    phase: i * 0.77,
  };
});

const MONEY_EMOJIS = 220;
const SOURCE_X = 960;
const SOURCE_Y = 930;

const seeded = (n: number): number => {
  const x = Math.sin(n * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
};

const cubicBezier = (
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number => {
  const inv = 1 - t;
  return (
    inv * inv * inv * p0
    + 3 * inv * inv * t * p1
    + 3 * inv * t * t * p2
    + t * t * t * p3
  );
};

export const V2S05_BestRoute: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Center headline
  const textProgress = spring({ fps, frame, config: { damping: 16, mass: 0.45 } });
  const textY = interpolate(textProgress, [0, 1], [40, 0], CLAMP);
  const textOpacity = interpolate(textProgress, [0, 0.4], [0, 1], CLAMP);

  // Scattered marketplace node reveal + glow
  const nodesOpacity = interpolate(frame, [8, 24], [0, 1], CLAMP);
  const glowIntro = interpolate(frame, [36, 70], [0, 1], CLAMP);

  // Exit
  const exitOpacity = interpolate(frame, [80, 90], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        opacity: exitOpacity,
      }}
    >
      {/* "With the best route..." */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, calc(-50% + ${textY}px))`,
          textAlign: "center",
          opacity: textOpacity,
          zIndex: 30,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 78,
            color: colors.textPrimary,
            lineHeight: 1.15,
          }}
        >
          With the{" "}
          <span style={{ color: colors.accent }}>best route</span>
          {" "}
        </span>
      </div>

      {/* Scattered marketplace icons */}
      {LOGO_NODES.map((node, i) => {
        const enterDelay = 8 + (i % 10);
        const logoScale = frame < enterDelay
          ? 0
          : spring({ fps, frame: frame - enterDelay, config: { damping: 13, mass: 0.32 } });
        const driftX = Math.sin(frame * 0.026 + node.phase) * 10;
        const driftY = Math.cos(frame * 0.023 + node.phase) * 8;
        const pulse = 1 + Math.sin(frame * 0.05 + node.phase) * 0.04;
        const glow = glowIntro * (0.65 + Math.sin(frame * 0.08 + node.phase) * 0.2);
        const isHL = node.name === "HL";
        const x = node.x + driftX;
        const y = node.y + driftY;

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: x - node.size / 2,
              top: y - node.size / 2,
              width: node.size,
              height: node.size,
              borderRadius: "50%",
              overflow: "hidden",
              backgroundColor: colors.surface2,
              border: `2px solid ${isHL ? colors.accent : colors.border}`,
              transform: `scale(${logoScale * pulse})`,
              opacity: nodesOpacity,
              boxShadow: glow > 0
                ? `0 0 ${18 * glow}px rgba(80, 227, 181, ${0.35 * glow})`
                : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 14,
            }}
          >
            <Img src={node.icon} style={{ width: node.size, height: node.size, display: "block", objectFit: "cover" }} />
          </div>
        );
      })}

      {/* Marketplace labels */}
      {LOGO_NODES.map((node, i) => {
        const enterDelay = 14 + (i % 10);
        const labelOpacity = interpolate(frame, [enterDelay, enterDelay + 10], [0, 1], CLAMP);
        const driftX = Math.sin(frame * 0.026 + node.phase) * 10;
        const driftY = Math.cos(frame * 0.023 + node.phase) * 8;
        const x = node.x + driftX;
        const y = node.y + driftY;

        return (
          <div
            key={`label-${node.id}`}
            style={{
              position: "absolute",
              left: x - node.size / 2,
              top: y + node.size / 2 + 8,
              width: node.size,
              textAlign: "center",
              opacity: labelOpacity,
              fontFamily: fonts.body,
              fontSize: 14,
              color: colors.textMuted,
              letterSpacing: "0.05em",
              zIndex: 15,
            }}
          >
            {node.name.toUpperCase()}
          </div>
        );
      })}

      {/* High-volume money flow: mid-bottom source into scattered marketplace icons */}
      {Array.from({ length: MONEY_EMOJIS }).map((_, i) => {
        const target = LOGO_NODES[(i * 7 + Math.floor(i / 5)) % LOGO_NODES.length];
        const spawnDelay = i * 0.15;
        const particleFrame = frame - 18 - spawnDelay;
        if (particleFrame <= 0) return null;

        const travelProgress = interpolate(particleFrame, [0, 32], [0, 1], CLAMP);

        const startX = SOURCE_X + (seeded(i + 11) - 0.5) * 220;
        const startY = SOURCE_Y + seeded(i + 19) * 28;
        const targetX = target.x + (seeded(i + 23) - 0.5) * target.size * 0.28;
        const targetY = target.y + (seeded(i + 29) - 0.5) * target.size * 0.28;
        const side = targetX < 960 ? -1 : 1;

        // Route around the centered headline block.
        const control1X = 960 + side * (360 + seeded(i + 41) * 220);
        const control1Y = 760 - seeded(i + 43) * 170;
        const control2X = targetX + side * (50 + seeded(i + 47) * 90);
        const control2Y = targetY + 120 + seeded(i + 53) * 110;

        const x = cubicBezier(travelProgress, startX, control1X, control2X, targetX);
        const y = cubicBezier(travelProgress, startY, control1Y, control2Y, targetY);
        const insideTextZone = (
          x > TEXT_SAFE_ZONE.left
          && x < TEXT_SAFE_ZONE.right
          && y > TEXT_SAFE_ZONE.top
          && y < TEXT_SAFE_ZONE.bottom
        );

        const emojiOpacity = insideTextZone
          ? 0
          : interpolate(travelProgress, [0, 0.08, 0.92, 1], [0, 1, 1, 0], CLAMP);
        const emojiSize = 22 + seeded(i + 61) * 16;
        const emojiRotate = (seeded(i + 67) - 0.5) * 36 + travelProgress * side * 20;

        return (
          <div
            key={`money-${i}`}
            style={{
              position: "absolute",
              left: x - emojiSize / 2,
              top: y - emojiSize / 2,
              fontSize: emojiSize,
              opacity: emojiOpacity,
              zIndex: 12,
              transform: `rotate(${emojiRotate}deg)`,
            }}
          >
            {"💸"}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
