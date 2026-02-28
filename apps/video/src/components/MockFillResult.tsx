import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_FILL } from "../lib/mock-data";

interface Props {
  visibleLegs?: number;
  scale?: number;
}

export const MockFillResult: React.FC<Props> = ({
  visibleLegs = 2,
  scale = 1,
}) => (
  <div
    style={{
      backgroundColor: colors.surface1,
      border: `1px solid rgba(34, 197, 94, 0.2)`,
      borderLeft: `3px solid ${colors.long}`,
      borderRadius: 4,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transform: `scale(${scale})`,
    }}
  >
    {/* Header row */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.long,
          fontFamily: fonts.body,
          backgroundColor: colors.longMuted,
          padding: "2px 8px",
          borderRadius: 3,
        }}
      >
        Filled
      </div>
      <div
        style={{
          fontSize: 13,
          color: colors.textPrimary,
          fontFamily: fonts.body,
        }}
      >
        {MOCK_FILL.totalSize} @ {MOCK_FILL.avgPrice}
      </div>
    </div>

    {/* Divider */}
    <div style={{ height: 1, backgroundColor: colors.border }} />

    {/* Legs */}
    {MOCK_FILL.legs.slice(0, visibleLegs).map((leg) => (
      <div
        key={leg.coin}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 4,
        }}
      >
        {/* Token icon */}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            backgroundColor: colors.surface3,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img
            src={leg.deployerIconUrl || leg.coinIconUrl}
            alt={leg.coin}
            style={{ width: 16, height: 16, objectFit: "cover" }}
          />
        </div>

        <span
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          {leg.coin}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: colors.textPrimary,
            fontFamily: fonts.body,
          }}
        >
          {leg.size} @ {leg.price}
        </span>
      </div>
    ))}
  </div>
);
