import React, { useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img } from "remotion";
import { colors, fonts } from "../../styles/tokens";
import {
  MARKET_ICON_ASSETS,
  getBaseToken,
  needsLightIconBackplate,
  tokenIconFallbackUrl,
  tokenIconUrl,
} from "./market-icon-set";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const ASSETS = MARKET_ICON_ASSETS;
const ICON_SIZE = 44;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type OneClickAssetProps = {
  coin: string;
  frame: number;
  fps: number;
  index: number;
  total: number;
  explodeProgress: number;
  spreadProgress: number;
};

const OneClickAsset: React.FC<OneClickAssetProps> = ({
  coin,
  frame,
  fps,
  index,
  total,
  explodeProgress,
  spreadProgress,
}) => {
  const [src, setSrc] = useState(() => tokenIconUrl(coin));
  const [isHidden, setIsHidden] = useState(false);
  const showLightBackplate = needsLightIconBackplate(coin);

  const normalizedIndex = (index + 0.5) / total;
  const angle = index * GOLDEN_ANGLE;
  const finalRadius = 140 + Math.sqrt(normalizedIndex) * 240;
  const orbitRadius = 8 + normalizedIndex * 12;

  const spreadX = Math.cos(angle) * finalRadius * spreadProgress;
  const spreadY = Math.sin(angle) * finalRadius * 0.72 * spreadProgress;
  const floatX = Math.cos(angle + frame * 0.02) * orbitRadius;
  const floatY = Math.sin(angle + frame * 0.02) * orbitRadius * 0.75;

  // After click: explode farther out in the same radial direction.
  const explodeDistance = 820 + finalRadius * 0.9;
  const explodeX = Math.cos(angle) * explodeDistance * explodeProgress;
  const explodeY = Math.sin(angle) * explodeDistance * 0.92 * explodeProgress;

  const x = spreadX + floatX + explodeX;
  const y = spreadY + floatY + explodeY;
  const scale = 1 + explodeProgress * 0.45;
  const spinDirection = index % 2 === 0 ? 1 : -1;
  const spinY = explodeProgress * (900 + normalizedIndex * 540) * spinDirection;
  const circleOpacity = interpolate(explodeProgress, [0, 0.5, 1], [1, 0.82, 0], CLAMP);
  const enterScale = spring({ fps, frame: Math.max(0, frame - (index % 10)), config: { damping: 16, mass: 0.35 } });

  if (isHidden) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `perspective(1200px) translate(${x - ICON_SIZE / 2}px, ${y - ICON_SIZE / 2}px) scale(${enterScale * scale}) rotateY(${spinY}deg)`,
        opacity: circleOpacity,
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: "50%",
        overflow: "hidden",
        backgroundColor: colors.surface2,
        border: `2px solid ${colors.border}`,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transformStyle: "preserve-3d",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          width: showLightBackplate ? ICON_SIZE * 0.82 : ICON_SIZE,
          height: showLightBackplate ? ICON_SIZE * 0.82 : ICON_SIZE,
          borderRadius: "50%",
          backgroundColor: showLightBackplate ? "#ffffff" : "transparent",
          padding: showLightBackplate ? Math.max(4, ICON_SIZE * 0.09) : 0,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Img
          src={src}
          alt={getBaseToken(coin)}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
          onError={() => {
            const fallback = tokenIconFallbackUrl(coin);
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

export const V2S04_OneClick: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Icons start clustered at center (from S03), then spread outward first.
  const spreadProgress = spring({ fps, frame, config: { damping: 18, mass: 0.45 } });

  // Phase 2: "In 1 click" appears only after the spread-out beat.
  const textIntroFrame = Math.max(0, frame - 18);
  const textScale = spring({ fps, frame: textIntroFrame, config: { damping: 16, mass: 0.3 } });
  const textOpacity = interpolate(frame, [18, 30], [0, 1], CLAMP);

  // Phase 3: Mouse cursor slides in from bottom-right corner (frames 28-44).
  const cursorProgress = frame < 28
    ? 0
    : spring({ fps, frame: frame - 28, config: { damping: 14, mass: 0.4 } });
  const cursorX = interpolate(cursorProgress, [0, 1], [1800, 960], CLAMP);
  const cursorY = interpolate(cursorProgress, [0, 1], [1000, 540], CLAMP);
  const cursorOpacity = interpolate(cursorProgress, [0, 0.3], [0, 1], CLAMP);

  // Phase 4: Click at frame 50.
  const isClicking = frame >= 50 && frame <= 54;
  const clickFlash = interpolate(frame, [50, 52, 54], [0, 1, 0], CLAMP);

  // Phase 5: Circles explode farther outward after click (frames 52-74).
  const explodeProgress = frame < 52
    ? 0
    : spring({ fps, frame: frame - 52, config: { damping: 8, mass: 0.4 } });

  // Text fades with "1" highlighted
  const textExit = interpolate(frame, [52, 66], [1, 0], CLAMP);

  // Full scene fade out (frames 68-75)
  const sceneExit = interpolate(frame, [68, 75], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: sceneExit,
      }}
    >
      {/* "In 1 click" text */}
      <div
        style={{
          position: "absolute",
          zIndex: 20,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          transform: `scale(${textScale})`,
          opacity: textOpacity * textExit,
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            color: colors.textPrimary,
          }}
        >
          In
        </span>
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            color: colors.accent,
            textShadow: `0 0 40px rgba(80, 227, 181, 0.4)`,
          }}
        >
          1
        </span>
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            color: colors.textPrimary,
          }}
        >
          click
        </span>
      </div>

      {/* Asset circles — explode outward from center on click */}
      {ASSETS.map((coin, i) => {
        return (
          <OneClickAsset
            key={coin}
            coin={coin}
            frame={frame}
            fps={fps}
            index={i}
            total={ASSETS.length}
            explodeProgress={explodeProgress}
            spreadProgress={spreadProgress}
          />
        );
      })}

      {/* Click flash ring */}
      {clickFlash > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 120 + clickFlash * 200,
            height: 120 + clickFlash * 200,
            borderRadius: "50%",
            border: `3px solid ${colors.accent}`,
            opacity: clickFlash * 0.6,
            zIndex: 15,
          }}
        />
      )}

      {/* Mouse cursor */}
      <div
        style={{
          position: "absolute",
          left: cursorX,
          top: cursorY,
          zIndex: 100,
          opacity: cursorOpacity,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
        }}
      >
        <svg width="28" height="32" viewBox="0 0 16 20">
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
              top: -16,
              left: -16,
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: "rgba(80, 227, 181, 0.25)",
              border: "2px solid rgba(80, 227, 181, 0.4)",
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
