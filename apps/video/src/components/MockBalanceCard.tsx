import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_BALANCE } from "../lib/mock-data";

export const MockBalanceCard: React.FC = () => (
  <div
    style={{
      backgroundColor: colors.surface2,
      border: `1px solid ${colors.border}`,
      borderRadius: 4,
      padding: 16,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    {/* Icon */}
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        backgroundColor: "rgba(80, 227, 181, 0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: colors.accent,
        fontSize: 18,
        fontFamily: fonts.body,
        fontWeight: 700,
      }}
    >
      $
    </div>

    {/* Balance info */}
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: colors.textMuted,
          fontFamily: fonts.body,
          marginBottom: 2,
        }}
      >
        AVAILABLE BALANCE
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: colors.textPrimary,
          fontFamily: fonts.body,
        }}
      >
        {MOCK_BALANCE}
      </div>
    </div>

    {/* Deposit button */}
    <div
      style={{
        backgroundColor: "rgba(80, 227, 181, 0.1)",
        border: "1px solid rgba(80, 227, 181, 0.3)",
        borderRadius: 4,
        padding: "6px 14px",
        fontSize: 12,
        color: colors.accent,
        fontFamily: fonts.body,
      }}
    >
      Deposit
    </div>
  </div>
);
