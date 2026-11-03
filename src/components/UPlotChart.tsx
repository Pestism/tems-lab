"use client";
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export type ChartSeries = { label: string; stroke: string; scale?: string };

export default function UPlotChart({
  data,
  series,
  height = 260,
  yLabel,
}: {
  data: (number | null)[][];
  series: ChartSeries[];
  height?: number;
  yLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const axisColor = "#8b949e";
    const gridColor = "rgba(139,148,158,0.15)";
    const opts: uPlot.Options = {
      width: host.current.clientWidth || 600,
      height,
      scales: { x: { time: false } },
      legend: { live: true },
      cursor: { points: { size: 5 } },
      series: [
        { label: "t (s)" },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          width: 1.5,
          scale: s.scale,
          spanGaps: false,
          points: { show: false },
        })),
      ],
      axes: [
        { stroke: axisColor, grid: { stroke: gridColor }, ticks: { stroke: gridColor } },
        {
          stroke: axisColor,
          grid: { stroke: gridColor },
          ticks: { stroke: gridColor },
          label: yLabel,
          labelSize: yLabel ? 30 : 0,
        },
      ],
    };
    plot.current = new uPlot(opts, data as uPlot.AlignedData, host.current);
    const ro = new ResizeObserver(() => {
      if (host.current) plot.current?.setSize({ width: host.current.clientWidth, height });
    });
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [data, series, height, yLabel]);

  return <div ref={host} className="w-full" />;
}
