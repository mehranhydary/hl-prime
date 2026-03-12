import React, { useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import {
  getBaseToken,
  MARKET_ICON_ASSETS,
  needsLightIconBackplate,
  tokenIconFallbackUrl,
  tokenIconUrl,
} from "./market-icon-set";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const TYPEWRITER_TEXT = "An app that lets you trade on Hyperliquid";
const TEXT_SAFE_WIDTH = 1420;
const TEXT_SAFE_HEIGHT = 220;
const ICON_COUNT = Math.min(50, MARKET_ICON_ASSETS.length);

type ScatterIcon = {
  coin: string;
  x: number;
  y: number;
  size: number;
  phase: number;
  ampX: number;
  ampY: number;
  speed: number;
};

type ScatterTokenProps = {
  convergeProgress: number;
  frame: number;
  fps: number;
  icon: ScatterIcon;
  iconIndex: number;
  iconsOpacity: number;
};

const seeded = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
};

const buildScatterField = (): ScatterIcon[] => {
  const icons: ScatterIcon[] = [];
  let seed = 1;

  while (icons.length < ICON_COUNT && seed < 5000) {
    const size = 44 + Math.round(seeded(seed + 17) * 44);
    const x = seeded(seed + 31) * (SCENE_WIDTH - 180) - (SCENE_WIDTH - 180) / 2;
    const y = seeded(seed + 53) * (SCENE_HEIGHT - 160) - (SCENE_HEIGHT - 160) / 2;
    const safeHalfW = TEXT_SAFE_WIDTH / 2 + size / 2 + 40;
    const safeHalfH = TEXT_SAFE_HEIGHT / 2 + size / 2 + 26;
    const insideSafeTextZone = Math.abs(x) < safeHalfW && Math.abs(y) < safeHalfH;

    const overlapsExisting = icons.some((icon) => {
      const dx = icon.x - x;
      const dy = icon.y - y;
      const minDist = (icon.size + size) * 0.44;
      return dx * dx + dy * dy < minDist * minDist;
    });

    if (!insideSafeTextZone && !overlapsExisting) {
      const coin = MARKET_ICON_ASSETS[icons.length];
      if (!coin) break;
      icons.push({
        coin,
        x,
        y,
        size,
        phase: seeded(seed + 71) * Math.PI * 2,
        ampX: 8 + seeded(seed + 89) * 14,
        ampY: 6 + seeded(seed + 97) * 12,
        speed: 0.012 + seeded(seed + 103) * 0.018,
      });
    }

    seed += 1;
  }

  return icons;
};

const SCATTER_ICONS = buildScatterField();

const ScatterToken: React.FC<ScatterTokenProps> = ({
  convergeProgress,
  frame,
  fps,
  icon,
  iconIndex,
  iconsOpacity,
}) => {
  const [src, setSrc] = useState(() => tokenIconUrl(icon.coin));
  const [isHidden, setIsHidden] = useState(false);
  const showLightBackplate = needsLightIconBackplate(icon.coin);

  const driftX = Math.sin(frame * icon.speed + icon.phase) * icon.ampX;
  const driftY = Math.cos(frame * icon.speed * 0.9 + icon.phase) * icon.ampY;
  const x = interpolate(convergeProgress, [0, 1], [icon.x + driftX, 0], CLAMP);
  const y = interpolate(convergeProgress, [0, 1], [icon.y + driftY, 0], CLAMP);

  // Staggered entrance
  const enterDelay = 8 + (iconIndex % 12);
  const enterScale = frame < enterDelay
    ? 0
    : spring({ fps, frame: frame - enterDelay, config: { damping: 14, mass: 0.3 } });
  const pulse = 1 + Math.sin(frame * 0.04 + icon.phase) * 0.06;

  if (isHidden) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(${x - icon.size / 2}px, ${y - icon.size / 2}px) scale(${enterScale * pulse})`,
        opacity: iconsOpacity,
        width: icon.size,
        height: icon.size,
        borderRadius: "50%",
        overflow: "hidden",
        backgroundColor: colors.surface2,
        border: `2px solid ${colors.border}`,
        boxShadow: `0 0 20px rgba(80, 227, 181, 0.15)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: showLightBackplate ? icon.size * 0.82 : icon.size,
          height: showLightBackplate ? icon.size * 0.82 : icon.size,
          borderRadius: "50%",
          backgroundColor: showLightBackplate ? "#ffffff" : "transparent",
          padding: showLightBackplate ? Math.max(4, icon.size * 0.09) : 0,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={src}
          alt={getBaseToken(icon.coin)}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
          onError={() => {
            const fallback = tokenIconFallbackUrl(icon.coin);
            if (fallback && src !== fallback) {
              setSrc(fallback);
              return;
            }

            setIsHidden(true);
          }}
        />
      </div>
    </div>
  );
};

export const V2S03_LongOrShort: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text fades in and types out from left to right.
  const textOpacity = interpolate(frame, [0, 10], [0, 1], CLAMP);
  const typedCharCount = Math.floor(
    interpolate(frame, [4, 40], [0, TYPEWRITER_TEXT.length], CLAMP),
  );
  const typedText = TYPEWRITER_TEXT.slice(0, typedCharCount);
  const cursorOpacity = frame >= 80 ? 0 : Math.floor(frame / 8) % 2 === 0 ? 1 : 0;

  // Icons fade in and hold across the scene.
  const iconsOpacity = interpolate(frame, [8, 22], [0, 1], CLAMP);

  // Converge only after text is gone so icons never cross over the text area.
  const convergeProgress = frame < 94
    ? 0
    : interpolate(frame, [94, 105], [0, 1], CLAMP);

  // Text fades out before icon convergence starts.
  const textExit = interpolate(frame, [78, 92], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Center text */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: textOpacity * textExit,
          zIndex: 10,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 52,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}
        >
          {typedText}
        </span>
        <span
          style={{
            width: 3,
            height: 58,
            borderRadius: 999,
            backgroundColor: colors.accent,
            opacity: cursorOpacity,
          }}
        />
      </div>

      {/* Scattered icons across scene, with center text kept clear */}
      {SCATTER_ICONS.map((icon, i) => {
        return (
          <ScatterToken
            key={`${icon.coin}-${i}`}
            convergeProgress={convergeProgress}
            frame={frame}
            fps={fps}
            icon={icon}
            iconIndex={i}
            iconsOpacity={iconsOpacity}
          />
        );
      })}
    </AbsoluteFill>
  );
};
