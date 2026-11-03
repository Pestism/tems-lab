"use client";
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export type ChartSeries = { label: string; stroke: string; scale?: string };

function minMaxPlugin(marks: { idx: number; color: string }[]): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const xs = u.data[0] as number[];
        if (!xs?.length) return;
        const xmin = u.scales.x.min ?? -Infinity;
        const xmax = u.scales.x.max ?? Infinity;
        const ctx = u.ctx;
        const { left, top, width, height } = u.bbox;
        for (const { idx, color } of marks) {
          const ys = u.data[idx] as (number | null)[] | undefined;
          if (!ys) continue;
          const scale = u.series[idx]?.scale || "y";
          let mn = Infinity;
          let mx = -Infinity;
          for (let i = 0; i < xs.length; i++) {
            if (xs[i] < xmin || xs[i] > xmax) continue;
            const v = ys[i];
            if (v == null) continue;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          if (!isFinite(mn)) continue;
          const line = (val: number, label: string, above: boolean) => {
            const py = u.valToPos(val, scale, true);
            if (py < top || py > top + height) return;
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left, py);
            ctx.lineTo(left + width, py);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.font = "600 10px Inter, sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = above ? "bottom" : "top";
            ctx.fillText(label, left + width - 3, py + (above ? -3 : 3));
            ctx.restore();
          };
          line(mx, "max", true);
          if (mn !== mx) line(mn, "min", false);
        }
      },
    },
  };
}

export default function UPlotChart({
  data,
  series,
  height = 260,
  yLabel,
  minMaxSeries,
}: {
  data: (number | null)[][];
  series: ChartSeries[];
  height?: number;
  yLabel?: string;
  minMaxSeries?: number[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const axisColor = "#8b949e";
    const gridColor = "rgba(139,148,158,0.22)";
    const marks = (minMaxSeries ?? [])
      .filter((i) => series[i - 1])
      .map((i) => ({ idx: i, color: series[i - 1].stroke }));
    const opts: uPlot.Options = {
      width: host.current.clientWidth || 600,
      height,
      scales: { x: { time: false } },
      legend: { live: true },
      cursor: { points: { size: 5 }, drag: { x: true, y: false, dist: 12, setScale: true } },
      plugins: marks.length ? [minMaxPlugin(marks)] : [],
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
  }, [data, series, height, yLabel, minMaxSeries]);

  return <div ref={host} className="w-full" />;
}
