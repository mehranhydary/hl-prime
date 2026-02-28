import { AbsoluteFill, Series } from "remotion";
import { S01_LogoReveal } from "./scenes/S01_LogoReveal";
import { S02_PhoneDashboard } from "./scenes/S02_PhoneDashboard";
import { S03_TradePageZoom } from "./scenes/S03_TradePageZoom";
import { S04_FillFormZoom } from "./scenes/S04_FillFormZoom";
import { S05_QuoteExecute } from "./scenes/S05_QuoteExecute";
import { S06_Outro } from "./scenes/S06_Outro";
import { colors } from "./styles/tokens";

export const Video: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
    <Series>
      {/* 1. Logo reveal (4s) */}
      <Series.Sequence durationInFrames={120}>
        <S01_LogoReveal />
      </Series.Sequence>

      {/* 2. Phone dashboard — markets + positions (8s) */}
      <Series.Sequence durationInFrames={240}>
        <S02_PhoneDashboard />
      </Series.Sequence>

      {/* 3. NVDA trade page — chart + venues (8s) */}
      <Series.Sequence durationInFrames={240}>
        <S03_TradePageZoom />
      </Series.Sequence>

      {/* 4. Trade form — amount, leverage, routing (7s) */}
      <Series.Sequence durationInFrames={210}>
        <S04_FillFormZoom />
      </Series.Sequence>

      {/* 5. Quote → swap → execute → fill → confetti (13.3s) */}
      <Series.Sequence durationInFrames={400}>
        <S05_QuoteExecute />
      </Series.Sequence>

      {/* 6. Outro — logo + tagline (4s) */}
      <Series.Sequence durationInFrames={120}>
        <S06_Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
