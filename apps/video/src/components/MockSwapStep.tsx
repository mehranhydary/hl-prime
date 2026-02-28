import React from "react";
import { useCurrentFrame } from "remotion";
import { colors, fonts } from "../styles/tokens";
import { MOCK_SWAP } from "../lib/mock-data";

interface Props {
  /** 0-1 progress of the card expanding in */
  expandProgress: number;
  /** Whether the swap is actively executing */
  isSwapping: boolean;
  /** Whether the swap completed */
  swapComplete: boolean;
}

/**
 * Shows "Collateral Swap Required" card between quote and execution.
 * Displays the USDC → USDT conversion for the second leg.
 */
export const MockSwapStep: React.FC<Props> = ({
  expandProgress,
  isSwapping,
  swapComplete,
}) => {
  const frame = useCurrentFrame();
  const maxHeight = expandProgress * 80;

  const statusColor = swapComplete
    ? colors.long
    : isSwapping
      ? colors.accent
      : colors.warning;

  const statusText = swapComplete
    ? "Complete"
    : isSwapping
      ? "Swapping..."
      : "Required";

  const swappingPulse = isSwapping ? Math.sin(frame * 0.3) * 0.3 + 0.7 : 1;

  return (
    <div
      style={{
        backgroundColor: colors.surface1,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        overflow: "hidden",
        maxHeight,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: colors.textMuted,
            fontFamily: fonts.body,
          }}
        >
          Collateral Swap
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: statusColor,
            fontFamily: fonts.body,
            backgroundColor: `${statusColor}18`,
            padding: "2px 8px",
            borderRadius: 3,
            opacity: swappingPulse,
          }}
        >
          {statusText}
        </div>
      </div>

      {/* Swap row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px 10px",
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        {/* From token */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: colors.surface3,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src={MOCK_SWAP.fromIconUrl}
            alt={MOCK_SWAP.fromToken}
            style={{ width: 18, height: 18, objectFit: "cover" }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: colors.textPrimary,
            fontFamily: fonts.body,
          }}
        >
          {MOCK_SWAP.fromToken}
        </span>

        {/* Arrow */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.accent}
          strokeWidth="2"
        >
          <path
            d="M5 12h14M12 5l7 7-7 7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* To token */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: colors.surface3,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src={MOCK_SWAP.toIconUrl}
            alt={MOCK_SWAP.toToken}
            style={{ width: 18, height: 18, objectFit: "cover" }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: colors.textPrimary,
            fontFamily: fonts.body,
          }}
        >
          {MOCK_SWAP.toToken}
        </span>

        {/* Amount */}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          {MOCK_SWAP.amount}
        </span>

        {/* Checkmark when complete */}
        {swapComplete && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.long}
            strokeWidth="2.5"
          >
            <path
              d="M20 6L9 17l-5-5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
};
