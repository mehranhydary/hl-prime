import React from "react";

interface Props {
  /** Width of the device frame in px (default 280) */
  width?: number;
  /** Body color of the device (default "black") */
  color?: string;
  /** Content rendered inside the screen */
  children?: React.ReactNode;
}

/**
 * Realistic iPhone 17 front-facing device mockup.
 * Pure CSS/inline styles — no external images or dependencies beyond React.
 */
export const IPhoneFrame: React.FC<Props> = ({
  width = 280,
  color = "black",
  children,
}) => {
  // iPhone 17 Pro proportions: ~6.9" display, ~19.5:9 aspect
  const aspectRatio = 19.5 / 9;
  const height = width * aspectRatio;

  const bezel = width * 0.025; // thin bezels
  const cornerRadius = width * 0.175; // ~50px at 280w
  const screenCornerRadius = cornerRadius - bezel;

  // Dynamic Island dimensions
  const islandW = width * 0.27;
  const islandH = width * 0.032;
  const islandRadius = islandH / 2;
  const islandTop = bezel + width * 0.022;

  // Frame edge highlight widths
  const highlightW = 1.5;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: cornerRadius,
        backgroundColor: color,
        boxShadow: [
          // Outer shadow for depth
          `0 8px 40px rgba(0,0,0,0.55)`,
          `0 2px 12px rgba(0,0,0,0.35)`,
          // Subtle outer rim highlight
          `inset 0 0 0 ${highlightW}px rgba(255,255,255,0.12)`,
        ].join(", "),
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Left edge highlight */}
      <div
        style={{
          position: "absolute",
          top: cornerRadius,
          left: 0,
          width: highlightW,
          height: height - cornerRadius * 2,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.14) 100%)",
          zIndex: 3,
        }}
      />

      {/* Right edge highlight */}
      <div
        style={{
          position: "absolute",
          top: cornerRadius,
          right: 0,
          width: highlightW,
          height: height - cornerRadius * 2,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.10) 100%)",
          zIndex: 3,
        }}
      />

      {/* Top edge highlight (arc) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: cornerRadius,
          right: cornerRadius,
          height: highlightW,
          background: "rgba(255,255,255,0.16)",
          zIndex: 3,
        }}
      />

      {/* Side buttons — volume (left) */}
      <div
        style={{
          position: "absolute",
          left: -2,
          top: height * 0.2,
          width: 2.5,
          height: width * 0.08,
          borderRadius: "2px 0 0 2px",
          backgroundColor: color,
          boxShadow: `inset 1px 0 0 rgba(255,255,255,0.1)`,
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -2,
          top: height * 0.2 + width * 0.1,
          width: 2.5,
          height: width * 0.08,
          borderRadius: "2px 0 0 2px",
          backgroundColor: color,
          boxShadow: `inset 1px 0 0 rgba(255,255,255,0.1)`,
          zIndex: 4,
        }}
      />

      {/* Side button — power (right) */}
      <div
        style={{
          position: "absolute",
          right: -2,
          top: height * 0.22,
          width: 2.5,
          height: width * 0.12,
          borderRadius: "0 2px 2px 0",
          backgroundColor: color,
          boxShadow: `inset -1px 0 0 rgba(255,255,255,0.1)`,
          zIndex: 4,
        }}
      />

      {/* Screen area */}
      <div
        style={{
          position: "absolute",
          top: bezel,
          left: bezel,
          right: bezel,
          bottom: bezel,
          borderRadius: screenCornerRadius,
          backgroundColor: "#000",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {children}
      </div>

      {/* Dynamic Island */}
      <div
        style={{
          position: "absolute",
          top: islandTop,
          left: "50%",
          transform: "translateX(-50%)",
          width: islandW,
          height: islandH,
          borderRadius: islandRadius,
          backgroundColor: "#000",
          zIndex: 2,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.05)`,
        }}
      />
    </div>
  );
};
