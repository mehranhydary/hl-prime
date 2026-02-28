import React, { useRef, useEffect, useState } from "react";
import { useCurrentFrame } from "remotion";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CandlestickSeries,
  AreaSeries,
} from "lightweight-charts";
import { colors } from "../styles/tokens";
import { CHART_DATA, type OHLCPoint, type ChartAssetKey } from "../lib/chart-data";

interface Props {
  /** Chart asset key — loads real data from indexed chart data */
  coin?: ChartAssetKey;
  /** Or pass OHLC data directly */
  data?: OHLCPoint[];
  width?: number;
  height?: number;
  drawStartFrame?: number;
  drawDuration?: number;
  mode?: "area" | "candle";
  /** Minimum visible data points (so chart doesn't start empty) */
  minPoints?: number;
}

export const LightweightChart: React.FC<Props> = ({
  coin = "xyz:TSLA",
  data: dataProp,
  width = 380,
  height = 200,
  drawStartFrame = 0,
  drawDuration = 60,
  mode = "area",
  minPoints = 1,
}) => {
  const frame = useCurrentFrame();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null>(null);
  const [mounted, setMounted] = useState(false);

  const data = dataProp ?? CHART_DATA[coin];
  const totalPoints = data.length;

  const progress = Math.min(
    1,
    Math.max(0, (frame - drawStartFrame) / Math.max(drawDuration, 1)),
  );
  const visibleCount = Math.max(minPoints, Math.round(progress * totalPoints));

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.textDim,
        fontFamily: "CSRodneyPixel, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(80, 227, 181, 0.04)" },
        horzLines: { color: "rgba(80, 227, 181, 0.04)" },
      },
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        visible: true,
        timeVisible: false,
      },
      handleScale: false,
      handleScroll: false,
    });

    let series: ISeriesApi<"Area"> | ISeriesApi<"Candlestick">;

    if (mode === "candle") {
      series = chart.addSeries(CandlestickSeries, {
        upColor: colors.long,
        downColor: colors.short,
        borderUpColor: colors.long,
        borderDownColor: colors.short,
        wickUpColor: colors.long,
        wickDownColor: colors.short,
      });
    } else {
      series = chart.addSeries(AreaSeries, {
        lineColor: colors.accent,
        topColor: "rgba(80, 227, 181, 0.28)",
        bottomColor: "rgba(80, 227, 181, 0.02)",
        lineWidth: 2,
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    setMounted(true);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [width, height, mode]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !mounted) return;

    const sliced = data.slice(0, visibleCount);

    if (mode === "candle") {
      (seriesRef.current as ISeriesApi<"Candlestick">).setData(
        sliced.map((d) => ({
          time: d.time as any,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
    } else {
      (seriesRef.current as ISeriesApi<"Area">).setData(
        sliced.map((d) => ({
          time: d.time as any,
          value: d.close,
        })),
      );
    }

    chartRef.current.timeScale().fitContent();
  }, [visibleCount, mounted, mode, data]);

  return (
    <div
      ref={containerRef}
      style={{ width, height, borderRadius: 4, overflow: "hidden" }}
    />
  );
};
