"use client";
import type { Dashboard } from "@/parser/extract";
import { num } from "@/lib/format";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Overview({ d }: { d: Dashboard }) {
  const o = d.overview;
  const lte = o.lteBands.map((b) => `B${b.band}`).join(" + ") || "–";
  const nr = o.nrBands.map((b) => `n${b.band}`).join(" + ") || "–";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="Operator" value={o.operator ?? "–"} sub={o.mcc ? `MCC ${o.mcc} / MNC ${o.mnc}` : undefined} />
      <Stat label="Technology" value={o.technology ?? "–"} />
      <Stat label="LTE bands" value={lte} sub={o.lteBands.map((b) => (b.freqMHz ? `${b.freqMHz} MHz` : `B${b.band}`)).join(", ") || undefined} />
      <Stat label="NR bands" value={nr} />
      <Stat label="Handovers occurred" value={String(d.handovers.length)} />
      <Stat label="Mean RSRP" value={num(o.meanRsrp, 1, " dBm")} sub={`median ${num(o.medianRsrp, 1)}`} />
      <Stat label="Downloads" value={String(o.downloads)} sub="HTTP sessions" />
      <Stat label="Route" value={`${num(o.durationS, 0, " s")}`} sub={`${o.routePoints} GPS points`} />
    </div>
  );
}
