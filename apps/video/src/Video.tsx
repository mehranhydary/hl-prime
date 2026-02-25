import { AbsoluteFill, Series } from "remotion";
import { S01_LogoReveal } from "./scenes/S01_LogoReveal";
import { S02_PhoneDashboard } from "./scenes/S02_PhoneDashboard";
import { S03_TradePageZoom } from "./scenes/S03_TradePageZoom";
import { S04_FillFormZoom } from "./scenes/S04_FillFormZoom";
import { S05_QuoteExecute } from "./scenes/S05_QuoteExecute";
import { S06_Outro } from "./scenes/S06_Outro";
import { TextCard } from "./components/TextCard";
import { KEY_POINTS } from "./lib/mock-data";
import { colors } from "./styles/tokens";

export const Video: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
    <Series>
      {/* 1. Logo reveal (4s) */}
      <Series.Sequence durationInFrames={120}>
        <S01_LogoReveal />
      </Series.Sequence>

      {/* 2. "What Hyperliquid Prime Does" text card (4.5s) */}
      <Series.Sequence durationInFrames={135}>
        <TextCard heading={KEY_POINTS[0].heading} bullets={KEY_POINTS[0].bullets} />
      </Series.Sequence>

      {/* 3. Phone appears + dashboard with TSLA, NVDA, GOLD, SILVER (7s) */}
      <Series.Sequence durationInFrames={210}>
        <S02_PhoneDashboard />
      </Series.Sequence>

      {/* 4. TSLA tap → trade page + chart draw + zoom (7s) */}
      <Series.Sequence durationInFrames={210}>
        <S03_TradePageZoom />
      </Series.Sequence>

      {/* 5. "Smart Order Routing" text card (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <TextCard heading={KEY_POINTS[1].heading} bullets={KEY_POINTS[1].bullets} />
      </Series.Sequence>

      {/* 6. Trade form: Long tab, amount, leverage (6s) */}
      <Series.Sequence durationInFrames={180}>
        <S04_FillFormZoom />
      </Series.Sequence>

      {/* 7. Quote generation + order execution (5.5s) */}
      <Series.Sequence durationInFrames={165}>
        <S05_QuoteExecute />
      </Series.Sequence>

      {/* 8. Outro: phone shrinks, logo + tagline (4s) */}
      <Series.Sequence durationInFrames={120}>
        <S06_Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
