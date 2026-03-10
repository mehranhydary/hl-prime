import { useRef, useEffect, useState } from "react";
import { createChart, AreaSeries, CandlestickSeries, type IChartApi } from "lightweight-charts";
import { useTheme } from "../lib/theme-context";
import type { CandleData, CandleInterval } from "@shared/types";

type TimeRange = "1H" | "4H" | "1D" | "7D" | "6M" | "ALL";
type ChartMode = "line" | "candle";

const RANGE_TO_INTERVAL: Record<TimeRange, CandleInterval> = {
  "1H": "1m",
  "4H": "5m",
  "1D": "15m",
  "7D": "1h",
  "6M": "1d",
  "ALL": "1w",
};

const TIME_RANGES: TimeRange[] = ["1H", "4H", "1D", "7D", "6M", "ALL"];

interface CandleChartProps {
  data: CandleData[];
  interval: CandleInterval;
  onIntervalChange: (interval: CandleInterval) => void;
  onHoverPrice?: (price: number | null) => void;
}

function deriveRange(interval: CandleInterval): TimeRange {
  for (const [range, ci] of Object.entries(RANGE_TO_INTERVAL)) {
    if (ci === interval) return range as TimeRange;
  }
  return "7D";
}

export function CandleChart({ data, interval, onIntervalChange, onHoverPrice }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const { theme } = useTheme();

  const activeRange = deriveRange(interval);

  function handleRangeChange(range: TimeRange) {
    onIntervalChange(RANGE_TO_INTERVAL[range]);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const themeColors = {
      green: {
        text: "#3d5a4e", crosshair: "rgba(168,240,212,0.06)", labelBg: "#1a3529",
        long: "#22c55e", short: "#ef4444", accent: "#50e3b5",
      },
      dark: {
        text: "#3a3a42", crosshair: "rgba(255,255,255,0.06)", labelBg: "#222226",
        long: "#22c55e", short: "#ef4444", accent: "#50e3b5",
      },
      light: {
        text: "#7a9e90", crosshair: "rgba(10,26,20,0.06)", labelBg: "#dceee7",
        long: "#16a34a", short: "#dc2626", accent: "#2d9e74",
      },
    } as const;
    const colors = themeColors[theme];
    const textColor = colors.text;
    const crosshairColor = colors.crosshair;
    const labelBg = colors.labelBg;
    const longColor = colors.long;
    const shortColor = colors.short;
    const accentColor = colors.accent;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor,
        fontFamily: "CSRodneyPixel, ABCDiatype, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        vertLine: { color: crosshairColor, labelBackgroundColor: labelBg },
        horzLine: { color: crosshairColor, labelBackgroundColor: labelBg },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    if (chartMode === "candle") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: longColor,
        downColor: shortColor,
        borderUpColor: longColor,
        borderDownColor: shortColor,
        wickUpColor: longColor,
        wickDownColor: shortColor,
      });

      if (data.length > 0) {
        series.setData(
          data.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        chart.timeScale().fitContent();
      }
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: accentColor,
        topColor: theme === "light" ? "rgba(45, 158, 116, 0.18)" : "rgba(80, 227, 181, 0.28)",
        bottomColor: theme === "light" ? "rgba(45, 158, 116, 0.01)" : "rgba(80, 227, 181, 0.01)",
        lineWidth: 2,
        crosshairMarkerBackgroundColor: accentColor,
        crosshairMarkerBorderColor: accentColor,
        crosshairMarkerRadius: 4,
        lastValueVisible: false,
        priceLineVisible: false,
      });

      if (data.length > 0) {
        series.setData(
          data.map((c) => ({
            time: c.time as any,
            value: c.close,
          })),
        );
        chart.timeScale().fitContent();
      }
    }

    // Report hovered price to parent
    chart.subscribeCrosshairMove((param) => {
      if (!onHoverPrice) return;
      if (!param.time || param.seriesData.size === 0) {
        onHoverPrice(null);
        return;
      }
      const val = param.seriesData.values().next().value as any;
      // AreaSeries → val.value, CandlestickSeries → val.close
      const price = val?.value ?? val?.close ?? null;
      onHoverPrice(price);
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, chartMode, theme]);

  return (
    <div className="flex flex-col">
      {/* Chart */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden"
        style={{ height: 280 }}
      />

      {/* Time range selector + candlestick toggle */}
      <div className="flex items-center mt-2">
        <div className="flex items-center gap-0.5 flex-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              className={`px-2.5 py-1 text-xs transition-colors ${
                activeRange === range
                  ? "bg-surface-3 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Separator + candlestick toggle */}
        <div className="flex items-center gap-2 ml-2">
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => setChartMode(chartMode === "line" ? "candle" : "line")}
            className={`p-1 transition-colors ${
              chartMode === "candle"
                ? "text-text-primary bg-surface-3"
                : "text-text-muted hover:text-text-secondary"
            }`}
            title={chartMode === "line" ? "Switch to candlesticks" : "Switch to line chart"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="4" width="2.5" height="5" rx="0.3" fill="#22c55e" />
              <line x1="3.25" y1="2" x2="3.25" y2="12" stroke="#22c55e" strokeWidth="0.8" />
              <rect x="6.75" y="5" width="2.5" height="6" rx="0.3" fill="#ef4444" />
              <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="#ef4444" strokeWidth="0.8" />
              <rect x="11.5" y="3" width="2.5" height="4.5" rx="0.3" fill="#22c55e" />
              <line x1="12.75" y1="1" x2="12.75" y2="11" stroke="#22c55e" strokeWidth="0.8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
