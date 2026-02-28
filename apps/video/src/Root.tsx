import React from "react";
import { Composition, staticFile } from "remotion";
import { Video } from "./Video";

const fontFaces = [
  { family: "CSRentoPixel", file: "CSRentoPixel-Regular.otf", weight: 400 },
  { family: "FaintEraScript", file: "FaintEraScript.otf", weight: 400 },
  { family: "CSRodneyPixel", file: "CSRodneyPixel-Regular.otf", weight: 400 },
  { family: "ABCDiatype", file: "ABCDiatype-Regular.otf", weight: 400 },
  { family: "ABCDiatype", file: "ABCDiatype-Medium.otf", weight: 500 },
  { family: "ABCDiatype", file: "ABCDiatype-Bold.otf", weight: 700 },
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
    <Composition
      id="PrimeIntro"
      component={Video}
      durationInFrames={1330}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
