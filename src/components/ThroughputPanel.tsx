"use client";
import type { Dashboard } from "@/parser/extract";
import UPlotChart from "./UPlotChart";
import { num, bytes } from "@/lib/format";

export default function ThroughputPanel({ d }: { d: Dashboard }) {
  const hasSeries = d.seriesMeta.some((m) => m.key === "dl_mbps");
  const hasUl = d.seriesMeta.some((m) => m.key === "ul_mbps");
  const sessMax = Math.max(1, ...d.sessions.map((s) => (s.throughputKbps ?? 0) / 1000));
  const chartData = hasUl ? [d.series.t, d.series.dl_mbps, d.series.ul_mbps] : [d.series.t, d.series.dl_mbps];
  const chartSeries = hasUl
    ? [
        { label: "Downlink", stroke: "#007afc", scale: "y" },
        { label: "Uplink", stroke: "#16a34a", scale: "y" },
      ]
    : [{ label: "Downlink", stroke: "#007afc", scale: "y" }];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-muted">Data downloaded: </span>
          <span className="font-semibold">{bytes(d.overview.downloadBytes)}</span>
        </div>
      </div>

      {hasSeries && (
        <div className="space-y-1">
          <UPlotChart data={chartData} series={chartSeries} yLabel="Mbps" height={240} minMaxSeries={[1]} />
          <p className="text-xs text-muted">
            Dashed lines mark the downlink peak and trough — read their values off the Mbps axis.
            {hasUl ? " Uplink is the green line." : ""} Drag across the chart to zoom; double-click to reset.
          </p>
        </div>
      )}

      {d.sessions.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Per-download throughput</div>
          <div className="space-y-1.5">
            {d.sessions.map((s, i) => {
              const mbps = s.throughputKbps !== null ? s.throughputKbps / 1000 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-6 text-muted">{i + 1}</span>
                  <div className="h-3 flex-1 rounded bg-line">
                    <div
                      className="h-3 rounded bg-brand"
                      style={{ width: `${Math.min(100, (mbps / sessMax) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right tabular-nums">{num(mbps, 1, " Mbps")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
