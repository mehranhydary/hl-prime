import { AbsoluteFill, Series } from "remotion";
import { MarketShowcase, SHOWCASE_TOTAL_FRAMES } from "./scenes/v3/MarketShowcase";
import { V2S13_Outro } from "./scenes/v2/S13_Outro";
import { colors } from "./styles/tokens";

export const Video3: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.surface0 }}>
    <Series>
      {/* Market showcase: intro + 30 markets cycling + exit */}
      <Series.Sequence durationInFrames={SHOWCASE_TOTAL_FRAMES}>
        <MarketShowcase />
      </Series.Sequence>

      {/* Outro: P logo with glow + fade to black */}
      <Series.Sequence durationInFrames={75}>
        <V2S13_Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
