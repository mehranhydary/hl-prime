import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors } from "../styles/tokens";
import { CHART_DATA, type ChartAssetKey } from "../lib/chart-data";

interface Props {
  /** Chart asset key — loads close prices from indexed chart data */
  coin?: ChartAssetKey;
  /** Or pass close prices directly */
  data?: number[];
  /** Frame at which the line starts drawing (relative to scene) */
  drawStartFrame?: number;
  /** Duration of draw animation in frames */
  drawDuration?: number;
  width?: number;
  height?: number;
}

export const MockCandleChart: React.FC<Props> = ({
  coin = "xyz:TSLA",
  data: dataProp,
  drawStartFrame = 0,
  drawDuration = 60,
  width = 1000,
  height = 280,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const data = dataProp ?? CHART_DATA[coin].map((c) => c.close);
  const minVal = Math.min(...data) - 20;
  const maxVal = Math.max(...data) + 20;
  const range = maxVal - minVal;

  const padX = 0;
  const padY = 10;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Build SVG path
  const points = data.map((val, i) => {
    const x = padX + (i / (data.length - 1)) * chartW;
    const y = padY + (1 - (val - minVal) / range) * chartH;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Area path (line + close to bottom)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Approximate total path length for dash animation
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  // If drawStartFrame is far negative, the chart is already fully drawn
  const alreadyDrawn = drawStartFrame + drawDuration < 0;

  // Animate stroke-dashoffset
  const drawProgress = alreadyDrawn
    ? 0
    : interpolate(
        frame,
        [drawStartFrame, drawStartFrame + drawDuration],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

  const dashOffset = totalLength * drawProgress;

  // Area fill fades in (ensure end > start for valid range)
  const areaStart = drawStartFrame + 10;
  const areaEnd = drawStartFrame + Math.max(drawDuration, 11);
  const areaOpacity = alreadyDrawn
    ? 1
    : interpolate(
        frame,
        [areaStart, areaEnd],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colors.accent} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill="url(#areaGrad)" opacity={areaOpacity} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={colors.accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={totalLength}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};
