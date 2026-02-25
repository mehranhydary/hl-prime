import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_QUOTE } from "../lib/mock-data";

interface Props {
  expandProgress?: number;
  visibleLegs?: number;
  showMetrics?: boolean;
  loading?: boolean;
}

export const MockQuoteBox: React.FC<Props> = ({
  expandProgress = 1,
  visibleLegs = 2,
  showMetrics = true,
  loading = false,
}) => {
  const maxHeight = expandProgress * 420;

  return (
    <div
      style={{
        backgroundColor: colors.surface1,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
        }}
      >
        <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body }}>
          Quote
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: colors.accent, fontFamily: fonts.body }}>
            Fetching...
          </div>
        ) : (
          <div style={{ fontSize: 12, color: colors.textPrimary, fontFamily: fonts.body }}>
            {MOCK_QUOTE.baseSize} ETH &middot; {MOCK_QUOTE.usdNotional}
          </div>
        )}
      </div>

      {/* Expandable content */}
      <div style={{ maxHeight, overflow: "hidden" }}>
        {/* Route header */}
        <div
          style={{
            padding: "0 14px 8px",
            fontSize: 11,
            color: colors.textMuted,
            fontFamily: fonts.body,
          }}
        >
          Route — {MOCK_QUOTE.legs.length} legs
        </div>

        {/* Legs */}
        {MOCK_QUOTE.legs.slice(0, visibleLegs).map((leg) => (
          <div
            key={leg.coin}
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${colors.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* Leg header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Token icon */}
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: colors.surface3,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={leg.coinIconUrl}
                  alt={leg.coin}
                  style={{ width: 20, height: 20, objectFit: "cover" }}
                />
              </div>

              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  fontFamily: fonts.body,
                }}
              >
                {leg.coin}
              </span>

              {leg.deployer && leg.deployerIconUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <img
                    src={leg.deployerIconUrl}
                    alt={leg.deployer}
                    style={{ width: 14, height: 14, borderRadius: 2 }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      backgroundColor: colors.surface3,
                      borderRadius: 3,
                      color: colors.textMuted,
                      fontFamily: fonts.body,
                    }}
                  >
                    {leg.deployer}
                  </span>
                </div>
              )}

              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 13,
                  color: colors.textSecondary,
                  fontFamily: fonts.body,
                }}
              >
                {(leg.proportion * 100).toFixed(1)}%
              </span>
            </div>

            {/* Leg stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                paddingLeft: 28,
              }}
            >
              <StatCell label="Size" value={leg.size} />
              <StatCell label="Est. Price" value={leg.price} />
              <StatCell
                label="Collateral"
                value={leg.collateral}
                iconUrl={leg.collateralIconUrl}
              />
            </div>
          </div>
        ))}

        {/* Metrics */}
        {showMetrics && (
          <div
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${colors.border}`,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <MetricRow label="Leverage" value={MOCK_QUOTE.leverage} />
            <MetricRow label="Margin Req." value={MOCK_QUOTE.marginRequired} />
            <MetricRow label="Est. Avg Price" value={MOCK_QUOTE.estimatedAvgPrice} />
            <MetricRow label="Impact" value={MOCK_QUOTE.impactBps} />
            <MetricRow label="Funding Rate" value={MOCK_QUOTE.fundingRate} />
          </div>
        )}
      </div>
    </div>
  );
};

const StatCell: React.FC<{ label: string; value: string; iconUrl?: string }> = ({
  label,
  value,
  iconUrl,
}) => (
  <div>
    <div
      style={{
        fontSize: 9,
        color: colors.textDim,
        fontFamily: fonts.body,
        marginBottom: 1,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 11,
        color: colors.textSecondary,
        fontFamily: fonts.body,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          style={{ width: 12, height: 12, borderRadius: "50%" }}
        />
      )}
      {value}
    </div>
  </div>
);

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "2px 0",
    }}
  >
    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.body }}>
      {label}
    </span>
    <span style={{ fontSize: 11, color: colors.textPrimary, fontFamily: fonts.body }}>
      {value}
    </span>
  </div>
);
