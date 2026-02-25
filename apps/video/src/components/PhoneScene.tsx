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
  /** Content to render inside the phone screen */
  children?: React.ReactNode;
}

/**
 * Wrapper that places screen content inside an IPhoneFrame centered in
 * the 1920x1080 landscape video, with configurable zoom/pan to focus
 * on specific areas of the app.
 */
export const PhoneScene: React.FC<Props> = ({
  zoom = 1,
  focusX = 0,
  focusY = 0,
  opacity = 1,
  children,
}) => {
  // Base phone width so full phone fits in 1080px height with padding
  const basePhoneW = 360;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          transform: [
            `scale(${zoom})`,
            `translate(${-focusX}px, ${-focusY}px)`,
          ].join(" "),
          opacity,
          willChange: "transform",
        }}
      >
        <IPhoneFrame width={basePhoneW}>
          {/* Inner content scales from phone logical size to frame size */}
          <div
            style={{
              width: PHONE_W,
              height: PHONE_H,
              transform: `scale(${basePhoneW / PHONE_W})`,
              transformOrigin: "top left",
              overflow: "hidden",
              backgroundColor: colors.surface0,
            }}
          >
            {children}
          </div>
        </IPhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
