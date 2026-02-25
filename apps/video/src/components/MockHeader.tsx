import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_ADDRESS } from "../lib/mock-data";

export const MockHeader: React.FC = () => (
  <div
    style={{
      position: "relative",
      width: "100%",
      flexShrink: 0,
    }}
  >
    {/* Main header */}
    <div
      style={{
        height: 48,
        backgroundColor: `${colors.surface0}e6`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {/* Logo */}
      <span
        style={{
          fontFamily: fonts.logo,
          fontSize: 24,
          color: colors.accent,
        }}
      >
        P
      </span>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Network */}
        <div
          style={{
            backgroundColor: colors.surface2,
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 11,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          Mainnet
        </div>

        {/* Signed in */}
        <div
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 11,
            color: colors.long,
            fontFamily: fonts.body,
          }}
        >
          Signed in
        </div>

        {/* Address */}
        <div
          style={{
            backgroundColor: colors.surface2,
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 11,
            color: colors.textMuted,
            fontFamily: fonts.body,
          }}
        >
          {MOCK_ADDRESS}
        </div>
      </div>
    </div>
  </div>
);
