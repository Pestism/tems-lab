"use client";
import type { Dashboard } from "@/parser/extract";
import UPlotChart, { type ChartSeries } from "./UPlotChart";

const COLORS: Record<string, string> = {
  rsrp: "#1f6feb",
  rssi: "#7c3aed",
  rsrq: "#0891b2",
  sinr: "#16a34a",
  nr_rsrp: "#ea580c",
  nr_rsrq: "#0891b2",
  nr_sinr: "#16a34a",
};

const GROUPS: { title: string; unit: string; keys: string[] }[] = [
  { title: "LTE signal strength", unit: "dBm", keys: ["rsrp", "rssi"] },
  { title: "LTE signal quality", unit: "dB", keys: ["rsrq", "sinr"] },
  { title: "NR signal strength", unit: "dBm", keys: ["nr_rsrp"] },
  { title: "NR signal quality", unit: "dB", keys: ["nr_rsrq", "nr_sinr"] },
];

export default function SignalCharts({ d }: { d: Dashboard }) {
  const present = new Set(d.seriesMeta.map((m) => m.key));
  const label = (k: string) => d.seriesMeta.find((m) => m.key === k)?.label ?? k;

  const groups = GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => present.has(k)) })).filter(
    (g) => g.keys.length
  );
  const ho = d.handovers.map((h) => h.t);

  return (
    <div className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-2">
      {groups.map((g) => {
        const data: (number | null)[][] = [d.series.t, ...g.keys.map((k) => d.series[k])];
        const series: ChartSeries[] = g.keys.map((k) => ({ label: label(k), stroke: COLORS[k] ?? "#1f6feb", scale: "y" }));
        return (
          <div key={g.title}>
            <div className="mb-1 text-sm font-medium">{g.title}</div>
            <UPlotChart
              data={data}
              series={series}
              yLabel={g.unit}
              height={240}
              minMaxSeries={g.keys.map((_, i) => i + 1)}
              markers={ho}
            />
          </div>
        );
      })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {ho.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 border-t border-dashed" style={{ borderColor: "#64748b" }} />
            handover
          </span>
        )}
        <span>Read values off the axis. Drag across a chart to zoom; double-click to reset.</span>
      </div>
    </div>
  );
}
