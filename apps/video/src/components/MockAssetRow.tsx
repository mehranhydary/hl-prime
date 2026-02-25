import React from "react";
import { colors, fonts } from "../styles/tokens";
import type { MockAsset } from "../lib/mock-data";

interface Props {
  asset: MockAsset;
  highlighted?: boolean;
}

export const MockAssetRow: React.FC<Props> = ({ asset, highlighted }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      padding: "12px 0",
      gap: 10,
      backgroundColor: highlighted ? colors.surface1 : "transparent",
      borderRadius: highlighted ? 4 : 0,
      paddingLeft: highlighted ? 8 : 0,
      paddingRight: highlighted ? 8 : 0,
    }}
  >
    {/* Token icon */}
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        backgroundColor: colors.surface3,
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={asset.iconUrl}
        alt={asset.symbol}
        style={{ width: 32, height: 32, objectFit: "cover" }}
      />
    </div>

    {/* Name */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.textPrimary,
          fontFamily: fonts.body,
        }}
      >
        {asset.symbol}
      </div>
      <div
        style={{
          fontSize: 11,
          color: colors.textMuted,
          fontFamily: fonts.body,
        }}
      >
        {asset.name}
      </div>
    </div>

    {/* Price */}
    <div
      style={{
        fontSize: 14,
        color: colors.textPrimary,
        fontFamily: fonts.body,
        textAlign: "right",
        minWidth: 80,
      }}
    >
      ${asset.price}
    </div>

    {/* 24h change */}
    <div
      style={{
        fontSize: 13,
        color: asset.positive ? colors.long : colors.short,
        fontFamily: fonts.body,
        textAlign: "right",
        minWidth: 65,
      }}
    >
      {asset.change}
    </div>
  </div>
);
