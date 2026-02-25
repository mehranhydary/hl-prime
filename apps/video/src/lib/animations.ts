import { spring, interpolate, type SpringConfig } from "remotion";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const SPRING_ENTER: Partial<SpringConfig> = { damping: 12, mass: 0.5 };
export const SPRING_PRESS: Partial<SpringConfig> = { damping: 20, mass: 0.3 };
export const SPRING_SLIDE: Partial<SpringConfig> = { damping: 15, mass: 0.8 };
export const SPRING_GENTLE: Partial<SpringConfig> = { damping: 14, mass: 0.6 };

/** Fade in over N frames starting at startFrame */
export function fadeIn(
  frame: number,
  startFrame: number,
  duration = 15,
): number {
  return interpolate(frame, [startFrame, startFrame + duration], [0, 1], CLAMP);
}

/** Fade out over N frames starting at startFrame */
export function fadeOut(
  frame: number,
  startFrame: number,
  duration = 15,
): number {
  return interpolate(frame, [startFrame, startFrame + duration], [1, 0], CLAMP);
}

/** Slide up from offset using spring */
export function slideUp(
  fps: number,
  frame: number,
  startFrame: number,
  offset = 30,
): number {
  if (frame < startFrame) return offset;
  const s = spring({
    fps,
    frame: frame - startFrame,
    config: SPRING_ENTER,
  });
  return interpolate(s, [0, 1], [offset, 0], CLAMP);
}

/** Slide in from right using spring */
export function slideFromRight(
  fps: number,
  frame: number,
  startFrame: number,
  offset = 100,
): number {
  if (frame < startFrame) return offset;
  const s = spring({
    fps,
    frame: frame - startFrame,
    config: SPRING_ENTER,
  });
  return interpolate(s, [0, 1], [offset, 0], CLAMP);
}

/** Slide in from left using spring */
export function slideFromLeft(
  fps: number,
  frame: number,
  startFrame: number,
  offset = 100,
): number {
  if (frame < startFrame) return -offset;
  const s = spring({
    fps,
    frame: frame - startFrame,
    config: SPRING_ENTER,
  });
  return interpolate(s, [0, 1], [-offset, 0], CLAMP);
}

/** Typewriter effect: returns number of visible characters */
export function typewriter(
  frame: number,
  startFrame: number,
  totalChars: number,
  framesPerChar = 3,
): number {
  if (frame < startFrame) return 0;
  return Math.min(totalChars, Math.floor((frame - startFrame) / framesPerChar));
}

/** Scale bounce for button press/release */
export function pressScale(
  fps: number,
  frame: number,
  pressFrame: number,
  releaseFrame: number,
): number {
  if (frame < pressFrame) return 1;
  if (frame < releaseFrame) {
    return interpolate(frame, [pressFrame, pressFrame + 5], [1, 0.97], CLAMP);
  }
  const s = spring({
    fps,
    frame: frame - releaseFrame,
    config: SPRING_PRESS,
  });
  return interpolate(s, [0, 1], [0.97, 1], CLAMP);
}

/** Spring scale from 0 to 1 */
export function springScale(
  fps: number,
  frame: number,
  startFrame: number,
  config: Partial<SpringConfig> = SPRING_ENTER,
): number {
  if (frame < startFrame) return 0;
  return spring({
    fps,
    frame: frame - startFrame,
    config,
  });
}

/** Glow intensity (0 to 1) */
export function glowPulse(
  frame: number,
  startFrame: number,
  rampDuration = 20,
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + rampDuration],
    [0, 1],
    CLAMP,
  );
}
