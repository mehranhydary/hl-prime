import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_QUOTE, MOCK_TRADE, MOCK_COLLATERAL_PREP } from "../lib/mock-data";

interface Props {
  expandProgress?: number;
  visibleLegs?: number;
  showMetrics?: boolean;
  loading?: boolean;
  /** Override leverage display (e.g. animated value). Falls back to MOCK_QUOTE. */
  leverageDisplay?: string;
  /** Override margin required display (e.g. animated value). Falls back to MOCK_QUOTE. */
  marginDisplay?: string;
}

export const MockQuoteBox: React.FC<Props> = ({
  expandProgress = 1,
  visibleLegs = 4,
  showMetrics = true,
  loading = false,
  leverageDisplay,
  marginDisplay,
}) => {
  const maxHeight = expandProgress * 700;
  const activeLegs = MOCK_QUOTE.legs.filter((l) => l.proportion > 0);
  const inactiveLegs = MOCK_QUOTE.legs.filter((l) => l.proportion === 0);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
            Quote
          </span>
          {!loading && expandProgress > 0 && (
            <>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                {MOCK_QUOTE.baseSize} {MOCK_TRADE.asset}
              </span>
              <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.body }}>
                {MOCK_QUOTE.usdNotional}
              </span>
            </>
          )}
        </div>
        {loading ? (
          <div style={{ fontSize: 11, color: colors.accent, fontFamily: fonts.body }}>
            Fetching...
          </div>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
            <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Expandable content */}
      <div style={{ maxHeight, overflow: "hidden" }}>
        {/* Route header */}
        <div
          style={{
            padding: "6px 14px 8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, fontFamily: fonts.body }}>
            ROUTE — {MOCK_QUOTE.legs.length} LEGS
          </span>
          <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.body, fontStyle: "italic" }}>
            adjust routing below
          </span>
        </div>

        {/* Inactive legs (0% allocation, toggle off) */}
        {inactiveLegs.slice(0, visibleLegs).map((leg) => (
          <div
            key={leg.coin}
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: 0.5,
            }}
          >
            {/* Toggle off */}
            <TogglePill active={false} />
            {/* Deployer icon */}
            <div style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: colors.surface3, overflow: "hidden" }}>
              <img src={leg.deployerIconUrl || leg.coinIconUrl} alt={leg.coin} style={{ width: 20, height: 20, objectFit: "cover" }} />
            </div>
            <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body }}>
              {leg.coin}
            </span>
            {leg.deployer && (
              <span style={{ fontSize: 9, padding: "1px 4px", backgroundColor: colors.surface3, borderRadius: 3, color: colors.textDim, fontFamily: fonts.body }}>
                {leg.deployer}
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: colors.textDim, fontFamily: fonts.body }}>
              0.0%
            </span>
          </div>
        ))}

        {/* Active legs (with details) */}
        {activeLegs.slice(0, visibleLegs).map((leg) => (
          <div
            key={leg.coin}
            style={{
              margin: "0 8px",
              marginTop: 6,
              backgroundColor: colors.surface2,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {/* Leg header */}
            <div style={{ padding: "10px 10px 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <TogglePill active={true} />
              <div style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: colors.surface3, overflow: "hidden" }}>
                <img src={leg.deployerIconUrl || leg.coinIconUrl} alt={leg.coin} style={{ width: 20, height: 20, objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                {leg.coin}
              </span>
              {leg.deployer && (
                <span style={{ fontSize: 9, padding: "1px 4px", backgroundColor: colors.surface3, borderRadius: 3, color: colors.textMuted, fontFamily: fonts.body }}>
                  {leg.deployer}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                {(leg.proportion * 100).toFixed(1)}%
              </span>
            </div>

            {/* Proportion slider */}
            <div style={{ padding: "0 10px 8px" }}>
              <div style={{ position: "relative", height: 4, backgroundColor: colors.surface3, borderRadius: 999 }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: 4, width: `${leg.proportion * 100}%`, backgroundColor: colors.accent, borderRadius: 999, opacity: 0.5 }} />
                <div style={{ position: "absolute", left: `${leg.proportion * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%", backgroundColor: colors.textPrimary, border: `2px solid ${colors.surface0}` }} />
              </div>
            </div>

            {/* Leg stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "6px 10px 10px" }}>
              <StatCell label="Size" value={leg.size} />
              <StatCell label="Est. Price" value={leg.price} />
              <StatCell label="Collateral" value={leg.collateral} iconUrl={leg.collateralIconUrl} />
            </div>
          </div>
        ))}

        {/* Metrics */}
        {showMetrics && (
          <div style={{ padding: "10px 14px 6px", borderTop: `1px solid ${colors.border}`, marginTop: 8 }}>
            <MetricRow label="Leverage" value={leverageDisplay ?? MOCK_QUOTE.leverage} />
            <MetricRow label="Margin Required" value={marginDisplay ?? MOCK_QUOTE.marginRequired} />
            <MetricRow label="Est. Avg Price" value={MOCK_QUOTE.estimatedAvgPrice} />
            <MetricRow label="Impact" value={MOCK_QUOTE.impactBps} />
            {MOCK_QUOTE.builderFee && <MetricRow label="Builder Fee" value={MOCK_QUOTE.builderFee} />}
          </div>
        )}

        {/* Collateral Prep */}
        {showMetrics && MOCK_COLLATERAL_PREP.length > 0 && (
          <div style={{ padding: "8px 14px 10px", borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.body, fontStyle: "italic" }}>
                Collateral Prep
              </span>
              <span style={{ fontSize: 10, color: colors.short, fontFamily: fonts.body, fontStyle: "italic" }}>
                Swaps needed
              </span>
            </div>
            {MOCK_COLLATERAL_PREP.map((swap, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: colors.surface2,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <img src={swap.fromIconUrl} alt={swap.fromToken} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                    <span style={{ fontSize: 12, color: colors.textPrimary, fontFamily: fonts.body }}>{swap.fromToken}</span>
                    <span style={{ fontSize: 10, color: colors.textDim }}>→</span>
                    <img src={swap.toIconUrl} alt={swap.toToken} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                    <span style={{ fontSize: 12, color: colors.textPrimary, fontFamily: fonts.body }}>{swap.toToken}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.body }}>
                    {swap.amount}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.body }}>
                    Need {swap.need} · Have {swap.have}
                  </span>
                  <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.body, fontStyle: "italic" }}>
                    {swap.impactBps}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.body, fontStyle: "italic" }}>
                Weighted swap impact
              </span>
              <span style={{ fontSize: 10, color: colors.textPrimary, fontFamily: fonts.body }}>
                0.47 bps
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Small toggle pill (on/off indicator) */
const TogglePill: React.FC<{ active: boolean }> = ({ active }) => (
  <div
    style={{
      width: 28,
      height: 16,
      borderRadius: 999,
      backgroundColor: active ? colors.accent : colors.surface3,
      position: "relative",
      flexShrink: 0,
      opacity: active ? 1 : 0.6,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 2,
        left: active ? 14 : 2,
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: active ? "white" : colors.textDim,
      }}
    />
  </div>
);

const StatCell: React.FC<{ label: string; value: string; iconUrl?: string }> = ({
  label,
  value,
  iconUrl,
}) => (
  <div>
    <div style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.body, marginBottom: 1 }}>
      {label}
    </div>
    <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, display: "flex", alignItems: "center", gap: 4 }}>
      {iconUrl && <img src={iconUrl} alt="" style={{ width: 12, height: 12, borderRadius: "50%" }} />}
      {value}
    </div>
  </div>
);

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.body, fontStyle: "italic" }}>
      {label}
    </span>
    <span style={{ fontSize: 11, color: colors.textPrimary, fontFamily: fonts.body }}>
      {value}
    </span>
  </div>
);
