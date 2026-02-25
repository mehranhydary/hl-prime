import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_TRADE } from "../lib/mock-data";

interface Props {
  /** Number of amount digits visible (0-4 for "5000") */
  visibleDigits?: number;
  /** Current leverage value (1-50) */
  leverageValue?: number;
  /** Whether the long tab is active */
  longActive?: boolean;
  /** Show the quote request button or the execute button */
  showExecute?: boolean;
  /** Button text override */
  buttonText?: string;
  /** Button state */
  buttonScale?: number;
}

export const MockTradeForm: React.FC<Props> = ({
  visibleDigits = 4,
  leverageValue = 10,
  longActive = true,
  showExecute = false,
  buttonText,
  buttonScale = 1,
}) => {
  const amountStr = MOCK_TRADE.amount.slice(0, visibleDigits);
  const leveragePercent = ((leverageValue - 1) / 49) * 100;
  const side = longActive ? "long" : "short";
  const sideColor = side === "long" ? colors.long : colors.short;
  const defaultButtonText = showExecute
    ? `Long ${MOCK_TRADE.asset}`
    : "Get Quote";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: "8px 0",
            fontSize: 13,
            color: colors.textPrimary,
            fontFamily: fonts.body,
            borderBottom: `2px solid ${colors.accent}`,
          }}
        >
          Trade
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: "8px 0",
            fontSize: 13,
            color: colors.textMuted,
            fontFamily: fonts.body,
          }}
        >
          Info
        </div>
      </div>

      {/* Long / Short toggle */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          backgroundColor: colors.surface3,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 0",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: fonts.body,
            backgroundColor: longActive ? colors.long : colors.surface2,
            color: longActive ? "white" : colors.textMuted,
            boxShadow: longActive
              ? `0 0 20px rgba(34, 197, 94, 0.12)`
              : "none",
          }}
        >
          Long
        </div>
        <div
          style={{
            padding: "10px 0",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: fonts.body,
            backgroundColor: !longActive ? colors.short : colors.surface2,
            color: !longActive ? "white" : colors.textMuted,
            boxShadow: !longActive
              ? `0 0 20px rgba(239, 68, 68, 0.12)`
              : "none",
          }}
        >
          Short
        </div>
      </div>

      {/* Amount input */}
      <div
        style={{
          backgroundColor: colors.surface1,
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: visibleDigits > 0 ? colors.textPrimary : colors.textDim,
            fontFamily: fonts.body,
          }}
        >
          {visibleDigits > 0 ? amountStr : "0.00"}
        </div>
        <div
          style={{
            backgroundColor: colors.surface3,
            padding: "3px 8px",
            borderRadius: 3,
            fontSize: 11,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          USD
        </div>
      </div>

      {/* Conversion hint */}
      {visibleDigits >= 4 && (
        <div
          style={{
            fontSize: 11,
            color: colors.textDim,
            fontFamily: fonts.body,
            marginTop: -10,
          }}
        >
          {MOCK_TRADE.conversionAmount}
        </div>
      )}

      {/* Leverage */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: colors.textMuted,
              fontFamily: fonts.body,
            }}
          >
            Leverage
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: colors.textPrimary,
              fontFamily: fonts.body,
            }}
          >
            {Math.round(leverageValue)}x
          </span>
        </div>
        {/* Slider track */}
        <div
          style={{
            position: "relative",
            height: 6,
            backgroundColor: colors.surface3,
            borderRadius: 999,
          }}
        >
          {/* Filled portion */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 6,
              width: `${leveragePercent}%`,
              backgroundColor: colors.accent,
              borderRadius: 999,
              opacity: 0.4,
            }}
          />
          {/* Thumb */}
          <div
            style={{
              position: "absolute",
              left: `${leveragePercent}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: colors.textPrimary,
              border: `2px solid ${colors.surface0}`,
              boxShadow: "0 0 8px rgba(80, 227, 181, 0.2)",
            }}
          />
        </div>
      </div>

      {/* Action button */}
      <div
        style={{
          backgroundColor: sideColor,
          padding: "14px 0",
          borderRadius: 4,
          textAlign: "center",
          fontSize: 15,
          fontWeight: 700,
          color: "white",
          fontFamily: fonts.body,
          boxShadow: `0 0 20px ${sideColor}20`,
          transform: `scale(${buttonScale})`,
          opacity: visibleDigits === 0 ? 0.3 : 1,
        }}
      >
        {buttonText || defaultButtonText}
      </div>
    </div>
  );
};
