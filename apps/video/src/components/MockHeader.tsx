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
    {/* Status bar — notch / Dynamic Island clearance */}
    <div
      style={{
        height: 50,
        backgroundColor: colors.surface0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 24px 4px",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.textSecondary,
          fontFamily: fonts.body,
        }}
      >
        9:41
      </span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {/* Signal bars */}
        <svg width="14" height="10" viewBox="0 0 14 10">
          <rect x="0" y="7" width="2.5" height="3" rx="0.5" fill={colors.textSecondary} />
          <rect x="3.5" y="5" width="2.5" height="5" rx="0.5" fill={colors.textSecondary} />
          <rect x="7" y="3" width="2.5" height="7" rx="0.5" fill={colors.textSecondary} />
          <rect x="10.5" y="0" width="2.5" height="10" rx="0.5" fill={colors.textSecondary} />
        </svg>
        {/* Battery */}
        <svg width="22" height="10" viewBox="0 0 22 10">
          <rect x="0" y="1" width="18" height="8" rx="1.5" stroke={colors.textSecondary} strokeWidth="1" fill="none" />
          <rect x="1.5" y="2.5" width="14" height="5" rx="0.5" fill={colors.textSecondary} />
          <rect x="18.5" y="3" width="2" height="4" rx="0.5" fill={colors.textSecondary} />
        </svg>
      </div>
    </div>

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
