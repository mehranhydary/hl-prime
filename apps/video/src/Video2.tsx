import { AbsoluteFill, Series } from "remotion";
import { V2S01_LogoReveal } from "./scenes/v2/S01_LogoReveal";
import { V2S02_SayHello } from "./scenes/v2/S02_SayHello";
import { V2S03_LongOrShort } from "./scenes/v2/S03_LongOrShort";
import { V2S04_OneClick } from "./scenes/v2/S04_OneClick";
import { V2S05_BestRoute } from "./scenes/v2/S05_BestRoute";
import { V2S06_FastExecution } from "./scenes/v2/S06_FastExecution";
import { V2S07_BrowseText } from "./scenes/v2/S07_BrowseText";
import { V2S08_MarketsPage } from "./scenes/v2/S08_MarketsPage";
import { V2S09_TradeText } from "./scenes/v2/S09_TradeText";
import { V2S10_NvdaTrade } from "./scenes/v2/S10_NvdaTrade";
import { V2S11_TradeAnyMarket } from "./scenes/v2/S11_TradeAnyMarket";
import { V2S12_CTA } from "./scenes/v2/S12_CTA";
import { V2S13_Outro } from "./scenes/v2/S13_Outro";
import { colors } from "./styles/tokens";

export const Video2: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
    <Series>
      {/* 1. Logo reveal — P appears, slides left, "Prime", zoom in (3s) */}
      <Series.Sequence durationInFrames={90}>
        <V2S01_LogoReveal />
      </Series.Sequence>

      {/* 2. "Say hello to Prime" (1.5s) */}
      <Series.Sequence durationInFrames={50}>
        <V2S02_SayHello />
      </Series.Sequence>

      {/* 3. Long/short on Hyperliquid + orbiting asset circles (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <V2S03_LongOrShort />
      </Series.Sequence>

      {/* 4. "In 1 click" — circles converge, mouse clicks, circles explode (2.5s) */}
      <Series.Sequence durationInFrames={75}>
        <V2S04_OneClick />
      </Series.Sequence>

      {/* 5. Best route — exchange logos + money emoji split (3s) */}
      <Series.Sequence durationInFrames={90}>
        <V2S05_BestRoute />
      </Series.Sequence>

      {/* 6. Fastest execution — 3-2-1, Long NVDA click (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <V2S06_FastExecution />
      </Series.Sequence>

      {/* 7. "Use Prime's sleek UI to browse markets" text (1.5s) */}
      <Series.Sequence durationInFrames={50}>
        <V2S07_BrowseText />
      </Series.Sequence>

      {/* 8. Markets page with phone mock + scroll (4.5s) */}
      <Series.Sequence durationInFrames={135}>
        <V2S08_MarketsPage />
      </Series.Sequence>

      {/* 9. "Trade any market in a single click" text (1.5s) */}
      <Series.Sequence durationInFrames={50}>
        <V2S09_TradeText />
      </Series.Sequence>

      {/* 10. NVDA trading page full flow (9s) */}
      <Series.Sequence durationInFrames={270}>
        <V2S10_NvdaTrade />
      </Series.Sequence>

      {/* 11. App slides down + "Trade any market" (1.5s) */}
      <Series.Sequence durationInFrames={50}>
        <V2S11_TradeAnyMarket />
      </Series.Sequence>

      {/* 12. CTA — "Try it out on app.hlprime.xyz" (2.5s) */}
      <Series.Sequence durationInFrames={75}>
        <V2S12_CTA />
      </Series.Sequence>

      {/* 13. Outro — P logo (2s) */}
      <Series.Sequence durationInFrames={60}>
        <V2S13_Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
