import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { fonts } from "./styles/tokens";

const relayLogo = staticFile("partnerships/relay/logo.png");
const relayTextLogo = staticFile("partnerships/relay/text.png");

const PRIME_GREEN = "#50e3b5";
const BG = "#070b12";
const RELAY_AURA = "rgba(124, 144, 255, 0.4)";
const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const SWAP_FRAME = 56;
const RELAY_ONE_SPIN_END_FRAME = 92;
const STEP_DURATION = 28;

export const SPIN_SCENE_FRAMES = 102;
export const ICON_SCENE_FRAMES = STEP_DURATION * 3 + 12;
export const SCENE3_FRAMES = 170;
export const PARTNERSHIP_TOTAL_FRAMES =
  SPIN_SCENE_FRAMES + ICON_SCENE_FRAMES + SCENE3_FRAMES;

const SceneBackground: React.FC<{ frame: number; durationInFrames: number }> = ({
  frame,
  durationInFrames,
}) => {
  const drift = interpolate(frame, [0, durationInFrames - 1], [0, 1], clamp);

  return (
    <div
      style={{
        position: "absolute",
        inset: -120,
        background: `
          radial-gradient(circle at ${20 + drift * 8}% ${24 + drift * 4}%, rgba(124,144,255,0.22), transparent 24%),
          radial-gradient(circle at ${84 - drift * 8}% ${74 - drift * 8}%, rgba(80,227,181,0.16), transparent 22%),
          radial-gradient(circle at 50% 36%, rgba(16, 20, 38, 0.96), rgba(7, 11, 18, 1) 64%)
        `,
      }}
    />
  );
};

const PrimeGlyph: React.FC<{ size: number }> = ({ size }) => {
  return (
    <div
      style={{
        fontFamily: fonts.logo,
        fontSize: size,
        lineHeight: 1,
        color: PRIME_GREEN,
        textShadow:
          "0 0 18px rgba(80, 227, 181, 0.45), 0 0 48px rgba(80, 227, 181, 0.22)",
        transform: "translateY(-3%)",
        userSelect: "none",
      }}
    >
      P
    </div>
  );
};

const SpinFace: React.FC<{ flipped?: boolean; showRelay: boolean; size: number }> = ({
  flipped = false,
  showRelay,
  size,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backfaceVisibility: "hidden",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
      }}
    >
      {showRelay ? (
        <Img
          src={relayLogo}
          style={{
            width: size * 0.8,
            height: size * 0.8,
            objectFit: "contain",
            filter: "drop-shadow(0 0 30px rgba(124, 144, 255, 0.33))",
          }}
        />
      ) : (
        <PrimeGlyph size={size * 0.78} />
      )}
    </div>
  );
};

const StepItem: React.FC<{
  localFrame: number;
  aura: string;
  children: React.ReactNode;
  exitStart?: number;
  exitEnd?: number;
}> = ({ localFrame, aura, children, exitStart = 14, exitEnd = 22 }) => {
  const inOpacity = interpolate(localFrame, [0, 4], [0, 1], clamp);
  const outOpacity = interpolate(localFrame, [exitStart, exitEnd], [1, 0], clamp);
  const opacity = Math.min(inOpacity, outOpacity);

  const enterY = interpolate(localFrame, [0, 8], [110, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const exitY = interpolate(localFrame, [exitStart, exitEnd], [0, -180], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const scaleIn = interpolate(localFrame, [0, 8], [0.72, 1], {
    ...clamp,
    easing: Easing.out(Easing.back(1.4)),
  });
  const scaleOut = interpolate(localFrame, [exitStart, exitEnd], [1, 0.72], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });

  const rotateOut = interpolate(localFrame, [exitStart, exitEnd], [0, 22], clamp);
  const blurOut = interpolate(localFrame, [exitStart, exitEnd], [0, 5], clamp);
  const afterLeave = localFrame >= exitEnd && localFrame <= exitEnd + 6;
  const rippleScale = interpolate(localFrame, [exitEnd, exitEnd + 6], [1, 1.9], clamp);
  const rippleOpacity = interpolate(localFrame, [exitEnd, exitEnd + 6], [0.24, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 980,
        height: 320,
        marginLeft: -490,
        marginTop: -160,
        pointerEvents: "none",
      }}
    >
      {afterLeave ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 180,
            height: 180,
            marginLeft: -90,
            marginTop: -90,
            borderRadius: "50%",
            border: `2px solid ${aura}`,
            opacity: rippleOpacity,
            transform: `scale(${rippleScale})`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity,
          filter: `blur(${blurOut}px)`,
          transform: `translateY(${enterY + exitY}px) scale(${scaleIn * scaleOut}) rotate(${rotateOut}deg)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const PromoUsdcSpinScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const scale = interpolate(frame, [0, 70], [0.18, 1.28], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const lift = interpolate(frame, [0, 70], [180, -26], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const rotateZ = interpolate(frame, [0, RELAY_ONE_SPIN_END_FRAME], [-18, 16], clamp);
  const rotateY = interpolate(
    frame,
    [0, SWAP_FRAME, RELAY_ONE_SPIN_END_FRAME],
    [0, 450, 810],
    clamp,
  );
  const opacity = interpolate(
    frame,
    [0, 6, RELAY_ONE_SPIN_END_FRAME, SPIN_SCENE_FRAMES - 1],
    [0, 1, 1, 0],
    clamp,
  );
  const showRelay = frame >= SWAP_FRAME;

  const spinRadians = (rotateY * Math.PI) / 180;
  const edge = Math.abs(Math.cos(spinRadians));
  const squashX = interpolate(edge, [0, 1], [0.04, 1], clamp);
  const blur = interpolate(edge, [0, 1], [7, 0], clamp);
  const size = Math.min(width, height) * 0.34;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        overflow: "hidden",
        perspective: "1800px",
      }}
    >
      <SceneBackground frame={frame} durationInFrames={SPIN_SCENE_FRAMES} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "38%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: "50%",
          background: showRelay
            ? "radial-gradient(circle, rgba(124,144,255,0.28), rgba(124,144,255,0) 72%)"
            : "radial-gradient(circle, rgba(80,227,181,0.22), rgba(80,227,181,0) 72%)",
          opacity,
          transform: `translateY(${lift}px) scale(${scale}) rotateZ(${rotateZ}deg)`,
          filter: `blur(${blur * 0.35}px)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "38%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity,
          transformStyle: "preserve-3d",
          transform: `translateY(${lift}px) scale(${scale}) rotateZ(${rotateZ}deg)`,
          filter: showRelay
            ? "drop-shadow(0 28px 80px rgba(124, 144, 255, 0.38))"
            : "drop-shadow(0 24px 72px rgba(80, 227, 181, 0.24))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: `rotateY(${rotateY}deg) scaleX(${squashX})`,
          }}
        >
          <SpinFace showRelay={showRelay} size={size} />
          <SpinFace flipped showRelay={showRelay} size={size} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PromoUsdcIconSequenceScene: React.FC = () => {
  const frame = useCurrentFrame();

  const pStepFrame = frame;
  const handshakeStepFrame = frame - STEP_DURATION;
  const relayStepFrame = frame - STEP_DURATION * 2;

  const lockupProgress = interpolate(relayStepFrame, [8, 18], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const iconX = interpolate(lockupProgress, [0, 1], [0, -210], clamp);
  const wordmarkX = interpolate(lockupProgress, [0, 1], [760, 180], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const wordmarkOpacity = interpolate(lockupProgress, [0, 0.2, 1], [0, 0.45, 1], clamp);
  const wordmarkScale = interpolate(lockupProgress, [0, 1], [0.95, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        overflow: "hidden",
      }}
    >
      <SceneBackground frame={frame} durationInFrames={ICON_SCENE_FRAMES} />

      <StepItem localFrame={pStepFrame} aura="rgba(80, 227, 181, 0.45)">
        <PrimeGlyph size={198} />
      </StepItem>

      <StepItem localFrame={handshakeStepFrame} aura="rgba(245, 158, 11, 0.35)">
        <div
          style={{
            fontSize: 176,
            lineHeight: 1,
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
            transform: "translateY(6px)",
          }}
        >
          🤝
        </div>
      </StepItem>

      <StepItem
        localFrame={relayStepFrame}
        aura={RELAY_AURA}
        exitStart={22}
        exitEnd={30}
      >
        <div
          style={{
            position: "relative",
            width: 980,
            height: 260,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translateX(${iconX}px)`,
            }}
          >
            <Img
              src={relayLogo}
              style={{
                width: 188,
                height: 188,
                objectFit: "contain",
                filter: "drop-shadow(0 0 24px rgba(124, 144, 255, 0.42))",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translateX(${wordmarkX}px) scale(${wordmarkScale})`,
              opacity: wordmarkOpacity,
            }}
          >
            <Img
              src={relayTextLogo}
              style={{
                width: 470,
                height: 188,
                objectFit: "contain",
                filter: "drop-shadow(0 0 22px rgba(124, 144, 255, 0.2))",
              }}
            />
          </div>
        </div>
      </StepItem>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 50%, transparent 52%, rgba(2, 6, 16, 0.28) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export const PromoPrimeRevealScene: React.FC = () => {
  const frame = useCurrentFrame();

  const ctaPrefix = "try it out now on";
  const ctaSpace = " ";
  const ctaLink = "app.hlprime.xyz";
  const cta = `${ctaPrefix}${ctaSpace}${ctaLink}`;
  const charsPerFrame = 0.95;
  const typeEndFrame = Math.ceil(cta.length / charsPerFrame);
  const pStartFrame = typeEndFrame + 90;

  const typedChars = Math.min(cta.length, Math.max(0, Math.floor(frame * charsPerFrame)));
  const typedPrefix = ctaPrefix.slice(0, Math.min(ctaPrefix.length, typedChars));
  const linkGapVisible = typedChars > ctaPrefix.length;
  const typedLink =
    typedChars > ctaPrefix.length + ctaSpace.length
      ? ctaLink.slice(0, typedChars - ctaPrefix.length - ctaSpace.length)
      : "";
  const showCaret = typedChars < cta.length;
  const ctaOpacity = Math.min(
    interpolate(frame, [0, 8], [0, 1], clamp),
    interpolate(frame, [pStartFrame - 10, pStartFrame], [1, 0], clamp),
  );
  const ctaY = interpolate(frame, [0, 8], [14, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  const pOpacity = Math.min(
    interpolate(frame, [pStartFrame, pStartFrame + 10], [0, 1], clamp),
    interpolate(frame, [SCENE3_FRAMES - 12, SCENE3_FRAMES - 1], [1, 0], clamp),
  );
  const pScaleIn = interpolate(frame, [pStartFrame, pStartFrame + 10], [0.82, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const pScaleOut = interpolate(frame, [SCENE3_FRAMES - 12, SCENE3_FRAMES - 1], [1, 0.84], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const pScale = pScaleIn * pScaleOut;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        overflow: "hidden",
      }}
    >
      <SceneBackground frame={frame} durationInFrames={SCENE3_FRAMES} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: ctaOpacity,
          transform: `translateY(${ctaY}px)`,
          fontFamily: fonts.heading,
          fontSize: 72,
          letterSpacing: "0.015em",
          color: "#f4f8ff",
          textShadow: "0 0 24px rgba(124, 144, 255, 0.18)",
          lineHeight: 1,
        }}
      >
        <span>{typedPrefix}</span>
        <span
          style={{
            color: PRIME_GREEN,
            textShadow: "0 0 16px rgba(80, 227, 181, 0.25)",
            marginLeft: linkGapVisible ? "0.25em" : 0,
          }}
        >
          {typedLink}
        </span>
        {showCaret ? (
          <span
            style={{
              opacity: Math.sin(frame * 0.35) > 0 ? 1 : 0,
              marginLeft: 6,
            }}
          >
            |
          </span>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: pOpacity,
          transform: `scale(${pScale})`,
        }}
      >
        <PrimeGlyph size={260} />
      </div>
    </AbsoluteFill>
  );
};

export const PromoUsdcPartnership: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={SPIN_SCENE_FRAMES}>
        <PromoUsdcSpinScene />
      </Sequence>
      <Sequence from={SPIN_SCENE_FRAMES} durationInFrames={ICON_SCENE_FRAMES}>
        <PromoUsdcIconSequenceScene />
      </Sequence>
      <Sequence
        from={SPIN_SCENE_FRAMES + ICON_SCENE_FRAMES}
        durationInFrames={SCENE3_FRAMES}
      >
        <PromoPrimeRevealScene />
      </Sequence>
    </>
  );
};
