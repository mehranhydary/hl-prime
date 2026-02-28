import React from "react";
import { AbsoluteFill } from "remotion";
import { colors } from "../styles/tokens";
import { IPhoneFrame } from "./IPhoneFrame";

/**
 * Phone dimensions — iPhone 17 Pro Max logical pixels.
 * All screen content should be authored at this size.
 */
export const PHONE_W = 393;
export const PHONE_H = 852;

interface Props {
  /** Scale applied to the phone+frame (1 = full phone visible, 2.5 = zoomed in) */
  zoom?: number;
  /** Horizontal offset of the phone center in phone-pixels (positive = pan right) */
  focusX?: number;
  /** Vertical offset of the phone center in phone-pixels (positive = pan down) */
  focusY?: number;
  /** Overall opacity */
  opacity?: number;
  /** Layout alignment within the 1920x1080 viewport */
  alignment?: "center" | "right";
  /** Viewport-level vertical offset in px (positive = push phone down, clips bottom) */
  offsetY?: number;
  /** Right-side padding in px when alignment="right" */
  paddingRight?: number;
  /** Content to render inside the phone screen */
  children?: React.ReactNode;
}

/**
 * Wrapper that places screen content inside an IPhoneFrame in
 * the 1920x1080 landscape video, with configurable zoom/pan to focus
 * on specific areas of the app.
 */
export const PhoneScene: React.FC<Props> = ({
  zoom = 1,
  focusX = 0,
  focusY = 0,
  opacity = 1,
  alignment = "center",
  offsetY = 0,
  paddingRight: padRight = 0,
  children,
}) => {
  // Base phone width so full phone fits in 1080px height with padding
  const basePhoneW = 360;
  // Screen area is inset by bezel on each side — content must scale to fit this
  const bezel = basePhoneW * 0.025;
  const screenW = basePhoneW - bezel * 2;
  const screenH = basePhoneW * (19.5 / 9) - bezel * 2;
  const contentScale = Math.min(screenW / PHONE_W, screenH / PHONE_H);

  const isRight = alignment === "right";

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Inner layer: flex-positions the phone, then shifted by offsetY so the
          AbsoluteFill's overflow:hidden clips the bottom of the phone */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: isRight ? "flex-end" : "center",
          paddingRight: isRight ? padRight : 0,
          transform: offsetY ? `translateY(${offsetY}px)` : undefined,
        }}
      >
        <div
          style={{
            transform: [
              `scale(${zoom})`,
              `translate(${-focusX}px, ${-focusY}px)`,
            ].join(" "),
            transformOrigin: isRight ? "right center" : "center center",
            opacity,
            willChange: "transform",
          }}
        >
          <IPhoneFrame width={basePhoneW}>
            {/* Inner content scales from phone logical size to screen area size */}
            <div
              style={{
                width: PHONE_W,
                height: PHONE_H,
                transform: `scale(${contentScale})`,
                transformOrigin: "top left",
                overflow: "hidden",
                backgroundColor: colors.surface0,
              }}
            >
              {children}
            </div>
          </IPhoneFrame>
        </div>
      </div>
    </AbsoluteFill>
  );
};
