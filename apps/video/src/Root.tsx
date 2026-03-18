import React from "react";
import { Composition, Folder, staticFile } from "remotion";
import {
  ICON_SCENE_FRAMES,
  PARTNERSHIP_TOTAL_FRAMES,
  PromoPrimeRevealScene,
  PromoUsdcIconSequenceScene,
  PromoUsdcPartnership,
  PromoUsdcSpinScene,
  SCENE3_FRAMES,
  SPIN_SCENE_FRAMES,
} from "./PromoUsdcPartnership";
import { Video } from "./Video";
import { Video2 } from "./Video2";
import { Video3 } from "./Video3";
import { SHOWCASE_TOTAL_FRAMES } from "./scenes/v3/MarketShowcase";

const fontFaces = [
  { family: "CSRentoPixel", file: "CSRentoPixel-Regular.otf", weight: 400 },
  { family: "NerillaPixel", file: "NerillaPixel-Regular.otf", weight: 400 },
  { family: "CSRodneyPixel", file: "CSRodneyPixel-Regular.otf", weight: 400 },
  { family: "ABCDiatype", file: "ABCDiatype-Regular.otf", weight: 400 },
  { family: "ABCDiatype", file: "ABCDiatype-Medium.otf", weight: 500 },
  { family: "ABCDiatype", file: "ABCDiatype-Bold.otf", weight: 700 },
  { family: "ValtinePixel", file: "ValtinePixel-Regular.otf", weight: 400 },
  { family: "FaintEraScript", file: "FaintEraScript.otf", weight: 400 },
];

const fontCss = fontFaces
  .map(
    (f) => `@font-face {
  font-family: "${f.family}";
  src: url("${staticFile(`fonts/${f.file}`)}") format("opentype");
  font-weight: ${f.weight};
  font-style: normal;
}`,
  )
  .join("\n");

export const RemotionRoot: React.FC = () => (
  <>
    <style dangerouslySetInnerHTML={{ __html: fontCss }} />
    <Folder name="v1">
      <Composition
        id="PrimeIntro"
        component={Video}
        durationInFrames={1330}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="v2">
      <Composition
        id="PrimeV2"
        component={Video2}
        durationInFrames={1205}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="v3">
      <Composition
        id="MarketShowcase"
        component={Video3}
        durationInFrames={SHOWCASE_TOTAL_FRAMES + 75}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="promos">
      <Composition
        id="PrimeRelaySpinScene"
        component={PromoUsdcSpinScene}
        durationInFrames={SPIN_SCENE_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="PrimeRelayIconSequenceScene"
        component={PromoUsdcIconSequenceScene}
        durationInFrames={ICON_SCENE_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="PrimePToPrimeScene"
        component={PromoPrimeRevealScene}
        durationInFrames={SCENE3_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="PrimeRelayAnnouncement"
        component={PromoUsdcPartnership}
        durationInFrames={PARTNERSHIP_TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  </>
);
