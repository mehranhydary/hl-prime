import React from "react";
import { useCurrentFrame } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { fadeIn } from "../lib/animations";

export const PrimeLogo: React.FC<{ fadeInStart?: number }> = ({ fadeInStart = 20 }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, fadeInStart, 20);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        left: 48,
        opacity,
        fontFamily: fonts.logo,
        fontSize: 42,
        color: colors.accent,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      P
    </div>
  );
};
