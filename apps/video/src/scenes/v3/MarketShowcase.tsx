import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
  Img,
} from "remotion";
import { colors, fonts } from "../../styles/tokens";
import { getBaseToken, tokenIconUrl } from "../v2/market-icon-set";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ── Market data (30 markets from HL) ──────────────────────────────────────────

interface ShowcaseMarket {
  coin: string;       // Full market ID (e.g. "xyz:NVDA")
  base: string;       // Base token for icon URL
  deployer: string;   // Deployer name or "HL" for native
  collateral: string; // USDC, USDT, etc.
}

const MARKETS: ShowcaseMarket[] = [
  { coin: "xyz:NVDA",       base: "NVDA",      deployer: "xyz",  collateral: "USDC" },
  { coin: "BTC",            base: "BTC",       deployer: "HL",   collateral: "USDC" },
  { coin: "xyz:TSLA",       base: "TSLA",      deployer: "xyz",  collateral: "USDC" },
  { coin: "vntl:SPACEX",    base: "SPACEX",    deployer: "vntl", collateral: "USDC" },
  { coin: "ETH",            base: "ETH",       deployer: "HL",   collateral: "USDC" },
  { coin: "xyz:GOLD",       base: "GOLD",      deployer: "xyz",  collateral: "USDC" },
  { coin: "xyz:AAPL",       base: "AAPL",      deployer: "xyz",  collateral: "USDC" },
  { coin: "cash:USA500",    base: "USA500",    deployer: "cash", collateral: "USDT" },
  { coin: "SOL",            base: "SOL",       deployer: "HL",   collateral: "USDC" },
  { coin: "xyz:META",       base: "META",      deployer: "xyz",  collateral: "USDC" },
  { coin: "vntl:OPENAI",    base: "OPENAI",    deployer: "vntl", collateral: "USDC" },
  { coin: "xyz:AMZN",       base: "AMZN",      deployer: "xyz",  collateral: "USDC" },
  { coin: "HYPE",           base: "HYPE",      deployer: "HL",   collateral: "USDC" },
  { coin: "xyz:GOOGL",      base: "GOOGL",     deployer: "xyz",  collateral: "USDC" },
  { coin: "km:USOIL",       base: "USOIL",     deployer: "km",   collateral: "USDT" },
  { coin: "vntl:ANTHROPIC", base: "ANTHROPIC", deployer: "vntl", collateral: "USDC" },
  { coin: "xyz:MSFT",       base: "MSFT",      deployer: "xyz",  collateral: "USDC" },
  { coin: "XRP",            base: "XRP",       deployer: "HL",   collateral: "USDC" },
  { coin: "xyz:SILVER",     base: "SILVER",    deployer: "xyz",  collateral: "USDC" },
  { coin: "vntl:MAG7",      base: "MAG7",      deployer: "vntl", collateral: "USDC" },
  { coin: "xyz:AMD",        base: "AMD",       deployer: "xyz",  collateral: "USDC" },
  { coin: "flx:COPPER",     base: "COPPER",    deployer: "flx",  collateral: "USDC" },
  { coin: "xyz:PLTR",       base: "PLTR",      deployer: "xyz",  collateral: "USDC" },
  { coin: "xyz:HOOD",       base: "HOOD",      deployer: "xyz",  collateral: "USDC" },
  { coin: "xyz:URANIUM",    base: "URANIUM",   deployer: "xyz",  collateral: "USDC" },
  { coin: "vntl:SEMIS",     base: "SEMIS",     deployer: "vntl", collateral: "USDC" },
  { coin: "xyz:NFLX",       base: "NFLX",      deployer: "xyz",  collateral: "USDC" },
  { coin: "xyz:COIN",       base: "COIN",      deployer: "xyz",  collateral: "USDC" },
  { coin: "km:US500",       base: "US500",     deployer: "km",   collateral: "USDT" },
  { coin: "xyz:MSTR",       base: "MSTR",      deployer: "xyz",  collateral: "USDC" },
];

// ── Timing constants ──────────────────────────────────────────────────────────

const INTRO_FRAMES = 40;
const FRAMES_PER_MARKET = 26;
const MARKET_SECTION_FRAMES = MARKETS.length * FRAMES_PER_MARKET; // 780

export const SHOWCASE_TOTAL_FRAMES = INTRO_FRAMES + MARKET_SECTION_FRAMES + 15; // +15 exit

// ── Icon card size ────────────────────────────────────────────────────────────

const CARD_SIZE = 320;
const ICON_SIZE = 220;

// ── Component ─────────────────────────────────────────────────────────────────

export const MarketShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Intro ─────────────────────────────────────────────────────────────────
  const introTitleOpacity = interpolate(frame, [0, 15], [0, 1], CLAMP);
  const introTitleY = interpolate(
    spring({ fps, frame, config: { damping: 14, mass: 0.5 } }),
    [0, 1],
    [30, 0],
    CLAMP,
  );
  // Fade intro title out when markets start
  const introFadeOut = interpolate(frame, [INTRO_FRAMES - 10, INTRO_FRAMES], [1, 0], CLAMP);

  // ── Market cycling ────────────────────────────────────────────────────────
  const marketFrame = Math.max(0, frame - INTRO_FRAMES);
  const rawIndex = Math.floor(marketFrame / FRAMES_PER_MARKET);
  const marketIndex = Math.min(rawIndex, MARKETS.length - 1);
  const localFrame = marketFrame - marketIndex * FRAMES_PER_MARKET;
  const market = MARKETS[marketIndex];
  const isInMarketSection = frame >= INTRO_FRAMES && frame < INTRO_FRAMES + MARKET_SECTION_FRAMES;

  // ── Icon animation (per market) ───────────────────────────────────────────
  // Spring in: scale from 0.7 → 1
  const iconEnterProgress = isInMarketSection
    ? spring({ fps, frame: localFrame, config: { damping: 12, mass: 0.35 } })
    : 0;
  const iconEnterScale = interpolate(iconEnterProgress, [0, 1], [0.7, 1], CLAMP);
  const iconEnterOpacity = interpolate(iconEnterProgress, [0, 0.4], [0, 1], CLAMP);

  // Click press: scale dip at frame 16-18
  const pressScale = localFrame >= 16 && localFrame <= 20
    ? interpolate(localFrame, [16, 18, 20], [1, 0.93, 1], CLAMP)
    : 1;

  // Ripple effect on click
  const rippleProgress = localFrame >= 17
    ? interpolate(localFrame, [17, 24], [0, 1], CLAMP)
    : 0;
  const rippleScale = interpolate(rippleProgress, [0, 1], [0.5, 2.5], CLAMP);
  const rippleOpacity = interpolate(rippleProgress, [0, 0.3, 1], [0, 0.5, 0], CLAMP);

  // Exit: fade out at end of slot
  const iconExitOpacity = localFrame >= 22
    ? interpolate(localFrame, [22, 26], [1, 0], CLAMP)
    : 1;

  const iconScale = iconEnterScale * pressScale;
  const iconOpacity = iconEnterOpacity * iconExitOpacity;

  // ── Toast animation ───────────────────────────────────────────────────────
  const toastEnterY = isInMarketSection
    ? interpolate(
        spring({ fps, frame: Math.max(0, localFrame - 2), config: { damping: 14, mass: 0.4 } }),
        [0, 1],
        [60, 0],
        CLAMP,
      )
    : 60;
  const toastOpacity = isInMarketSection
    ? interpolate(localFrame, [2, 8, 20, 26], [0, 1, 1, 0], CLAMP)
    : 0;

  // ── Counter ───────────────────────────────────────────────────────────────
  const counterOpacity = isInMarketSection
    ? interpolate(localFrame, [0, 5, 20, 26], [0, 0.6, 0.6, 0], CLAMP)
    : 0;

  // ── Overall exit ──────────────────────────────────────────────────────────
  const exitStart = INTRO_FRAMES + MARKET_SECTION_FRAMES;
  const sceneExitOpacity = interpolate(frame, [exitStart, exitStart + 15], [1, 0], CLAMP);

  // ── Icon URL ──────────────────────────────────────────────────────────────
  const iconUrl = tokenIconUrl(market.base);
  const collateralIconUrl = staticFile(`collateral/${market.collateral.toLowerCase()}.png`);

  // ── Deployer badge URL ────────────────────────────────────────────────────
  const deployerIconUrl = market.deployer !== "HL"
    ? staticFile(`perp-dexes/${market.deployer === "vntl" ? "vntls" : market.deployer}.png`)
    : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: sceneExitOpacity,
      }}
    >
      {/* ── Intro title ──────────────────────────────────────────────────── */}
      {frame < INTRO_FRAMES && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: introTitleOpacity * introFadeOut,
            transform: `translateY(${introTitleY}px)`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.heading,
              fontSize: 90,
              color: colors.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            Trade{" "}
            <span style={{ color: colors.accent }}>any</span>
            {" "}market
          </span>
        </div>
      )}

      {/* ── Market counter (top) ─────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 140,
          opacity: counterOpacity,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {deployerIconUrl && (
          <img
            src={deployerIconUrl}
            style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }}
          />
        )}
        <span
          style={{
            fontFamily: fonts.body,
            fontSize: 28,
            color: colors.textMuted,
            letterSpacing: "0.06em",
          }}
        >
          {marketIndex + 1} / {MARKETS.length}
        </span>
      </div>

      {/* ── Market icon card (center) ────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          width: CARD_SIZE,
          height: CARD_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${iconScale})`,
          opacity: iconOpacity,
        }}
      >
        {/* Card background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: colors.surface2,
            borderRadius: 40,
            border: `2px solid ${colors.border}`,
            boxShadow: `0 8px 40px rgba(0,0,0,0.4), 0 0 60px ${colors.accentMuted}`,
          }}
        />

        {/* Ripple ring on click */}
        {rippleOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              width: CARD_SIZE * 0.6,
              height: CARD_SIZE * 0.6,
              borderRadius: "50%",
              border: `3px solid ${colors.accent}`,
              transform: `scale(${rippleScale})`,
              opacity: rippleOpacity,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Market icon */}
        <img
          src={iconUrl}
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            objectFit: "contain",
            position: "relative",
            zIndex: 1,
            filter: market.base === "ETH" || market.base === "XRP"
              ? "drop-shadow(0 0 8px rgba(255,255,255,0.3))"
              : "none",
          }}
        />
      </div>

      {/* ── Market name below icon ───────────────────────────────────────── */}
      <div
        style={{
          marginTop: 28,
          opacity: iconOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 42,
            color: colors.textPrimary,
            letterSpacing: "0.02em",
          }}
        >
          {market.base}
        </span>
        {market.deployer !== "HL" && (
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 20,
              color: colors.textMuted,
              letterSpacing: "0.04em",
            }}
          >
            {market.deployer}
          </span>
        )}
      </div>

      {/* ── Bottom toast ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          transform: `translateY(${toastEnterY}px)`,
          opacity: toastOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            backgroundColor: colors.surface2,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: "16px 32px",
            boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 40px ${colors.accentSubtle}`,
          }}
        >
          {/* Collateral icon */}
          <Img
            src={collateralIconUrl}
            style={{ width: 36, height: 36, borderRadius: 8 }}
          />

          {/* Symbol */}
          <span
            style={{
              fontFamily: fonts.heading,
              fontSize: 30,
              color: colors.accent,
              letterSpacing: "0.02em",
            }}
          >
            {market.coin}
          </span>

          {/* Separator dot */}
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: colors.textDim,
            }}
          />

          {/* Collateral name */}
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 26,
              color: colors.textSecondary,
              letterSpacing: "0.04em",
            }}
          >
            {market.collateral}
          </span>
        </div>
      </div>

      {/* ── Cursor overlay ───────────────────────────────────────────────── */}
      {isInMarketSection && localFrame >= 12 && localFrame <= 22 && (
        <CursorOverlay localFrame={localFrame} fps={fps} />
      )}
    </AbsoluteFill>
  );
};

// ── Cursor component ──────────────────────────────────────────────────────────

const CursorOverlay: React.FC<{ localFrame: number; fps: number }> = ({ localFrame, fps }) => {
  // Cursor fades in, moves to center, clicks
  const cursorProgress = interpolate(localFrame, [12, 16], [0, 1], CLAMP);
  const cursorX = interpolate(cursorProgress, [0, 1], [1200, 960], CLAMP);
  const cursorY = interpolate(cursorProgress, [0, 1], [700, 540], CLAMP);
  const cursorOpacity = interpolate(localFrame, [12, 14, 20, 22], [0, 0.9, 0.9, 0], CLAMP);

  // Click effect: cursor shrinks slightly
  const cursorScale = localFrame >= 16 && localFrame <= 20
    ? interpolate(localFrame, [16, 17, 19, 20], [1, 0.85, 0.85, 1], CLAMP)
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: cursorX,
        top: cursorY,
        opacity: cursorOpacity,
        transform: `scale(${cursorScale})`,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Simple cursor pointer */}
      <svg width="32" height="40" viewBox="0 0 24 30" fill="none">
        <path
          d="M5 2L5 22L10 17L15 26L18 24.5L13 15.5L20 15.5L5 2Z"
          fill="white"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
