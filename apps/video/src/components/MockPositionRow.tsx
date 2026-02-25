import React from "react";
import { colors, fonts } from "../styles/tokens";
import type { MockPosition } from "../lib/mock-data";

interface Props {
  position: MockPosition;
}

export const MockPositionRow: React.FC<Props> = ({ position }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      padding: "10px 0",
      gap: 10,
    }}
  >
    {/* Token icon */}
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        backgroundColor: colors.surface3,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={position.iconUrl}
        alt={position.symbol}
        style={{ width: 28, height: 28, objectFit: "cover" }}
      />
    </div>

    {/* Info */}
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 13,
          color: colors.textPrimary,
          fontFamily: fonts.body,
        }}
      >
        {position.symbol}
      </div>
      <div
        style={{
          fontSize: 11,
          color: position.side === "long" ? colors.long : colors.short,
          fontFamily: fonts.body,
        }}
      >
        {position.side === "long" ? "Long" : "Short"} {position.size} @ {position.leverage}
      </div>
    </div>

    {/* PnL */}
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: position.pnlPositive ? colors.long : colors.short,
          fontFamily: fonts.body,
        }}
      >
        {position.pnl}
      </div>
      <div
        style={{
          fontSize: 10,
          color: colors.textMuted,
          fontFamily: fonts.body,
        }}
      >
        Entry {position.entryPrice}
      </div>
    </div>
  </div>
);
