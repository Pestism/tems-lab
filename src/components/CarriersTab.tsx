"use client";
import type { Dashboard } from "@/parser/extract";
import UPlotChart, { type ChartSeries } from "./UPlotChart";
import { num } from "@/lib/format";

const CC_COLORS = ["#007afc", "#16a34a", "#ea580c", "#7c3aed", "#0891b2"];

export default function CarriersTab({ d }: { d: Dashboard }) {
  const cc = d.carriers;
  if (!cc.length) return null;
  const data: (number | null)[][] = [d.series.t, ...cc.map((c) => d.series[c.seriesKey])];
  const series: ChartSeries[] = cc.map((c, i) => ({
    label: c.label,
    stroke: CC_COLORS[i % CC_COLORS.length],
    scale: "y",
  }));

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <span className="text-muted">Carrier aggregation: </span>
        <span className="font-semibold">
          {(d.caDegree ?? cc.length)}-carrier · {cc.length} LTE component carriers
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted">
              {["Carrier", "Band", "EARFCN", "Freq", "Bandwidth", "PCI", "Mean DL", "Max DL"].map((h) => (
                <th key={h} className="border-b border-line py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cc.map((c, i) => (
              <tr key={i}>
                <td className="border-b border-line py-2 pr-4 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CC_COLORS[i % CC_COLORS.length] }} />
                    {c.label}
                  </span>
                </td>
                <td className="border-b border-line py-2 pr-4">{c.band != null ? `B${c.band}` : "–"}</td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{c.earfcn ?? "–"}</td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{c.freqMHz != null ? `${num(c.freqMHz, 1)} MHz` : "–"}</td>
                <td className="border-b border-line py-2 pr-4">{c.bandwidth ?? "–"}</td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{c.pci ?? "–"}</td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{num(c.meanMbps, 1, " Mbps")}</td>
                <td className="border-b border-line py-2 tabular-nums">{num(c.maxMbps, 1, " Mbps")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        <div className="text-sm font-medium">Per-carrier downlink (MAC)</div>
        <UPlotChart data={data} series={series} yLabel="Mbps" height={240} markers={d.handovers.map((h) => h.t)} />
        <p className="text-xs text-muted">
          Per-component-carrier MAC-layer downlink throughput. Drag across the chart to zoom; double-click to reset.
        </p>
      </div>
    </div>
  );
}
