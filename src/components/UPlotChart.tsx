"use client";
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export type ChartSeries = { label: string; stroke: string; scale?: string };

function minMaxPlugin(): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const xs = u.data[0] as number[];
        const ys = u.data[1] as (number | null)[];
        if (!xs?.length || !ys) return;
        const xmin = u.scales.x.min ?? -Infinity;
        const xmax = u.scales.x.max ?? Infinity;
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = 0; i < xs.length; i++) {
          if (xs[i] < xmin || xs[i] > xmax) continue;
          const v = ys[i];
          if (v == null) continue;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (!isFinite(mn)) return;
        const scale = u.series[1]?.scale || "y";
        const ctx = u.ctx;
        const { left, top, width, height } = u.bbox;
        const line = (val: number, label: string, above: boolean) => {
          const py = u.valToPos(val, scale, true);
          if (py < top || py > top + height) return;
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "rgba(242, 85, 6, 0.75)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, py);
          ctx.lineTo(left + width, py);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(242, 85, 6, 0.95)";
          ctx.font = "600 10px Inter, sans-serif";
          ctx.textAlign = "right";
          ctx.textBaseline = above ? "bottom" : "top";
          ctx.fillText(label, left + width - 3, py + (above ? -3 : 3));
          ctx.restore();
        };
        line(mx, "max", true);
        if (mn !== mx) line(mn, "min", false);
      },
    },
  };
}

export default function UPlotChart({
  data,
  series,
  height = 260,
  yLabel,
  markMinMax,
}: {
  data: (number | null)[][];
  series: ChartSeries[];
  height?: number;
  yLabel?: string;
  markMinMax?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const axisColor = "#8b949e";
    const gridColor = "rgba(139,148,158,0.22)";
    const opts: uPlot.Options = {
      width: host.current.clientWidth || 600,
      height,
      scales: { x: { time: false } },
      legend: { live: true },
      cursor: { points: { size: 5 }, drag: { x: true, y: false, dist: 12, setScale: true } },
      plugins: markMinMax ? [minMaxPlugin()] : [],
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
          size: 52,
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
  }, [data, series, height, yLabel, markMinMax]);

  return <div ref={host} className="w-full" />;
}
