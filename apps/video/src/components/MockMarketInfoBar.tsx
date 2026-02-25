import React from "react";
import { colors, fonts } from "../styles/tokens";
import { MOCK_TRADE } from "../lib/mock-data";

export const MockMarketInfoBar: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 0",
      borderBottom: `1px solid ${colors.border}`,
    }}
  >
    <InfoCol label="Funding" value={MOCK_TRADE.fundingRate} />
    <InfoCol label="Markets" value={MOCK_TRADE.marketsCount} />
    <InfoCol label="Collateral" value={MOCK_TRADE.collaterals} />
  </div>
);

const InfoCol: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ textAlign: "center", flex: 1 }}>
    <div
      style={{
        fontSize: 9,
        letterSpacing: "0.08em",
        color: colors.textMuted,
        fontFamily: fonts.body,
        marginBottom: 2,
      }}
    >
      {label.toUpperCase()}
    </div>
    <div
      style={{
        fontSize: 12,
        color: colors.textSecondary,
        fontFamily: fonts.body,
      }}
    >
      {value}
    </div>
  </div>
);
