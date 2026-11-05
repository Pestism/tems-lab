"use client";
import type { Dashboard } from "@/parser/extract";
import { num, rsrpColor } from "@/lib/format";

export default function NeighborsTable({ d }: { d: Dashboard }) {
  const n = d.neighbors;
  if (!n.length) return <p className="text-sm text-muted">No neighbour cells were reported in this log.</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted">
              {["RAT", "PCI", "Band", "Channel", "Freq", "Seen", "RSRP (mean)", "RSRP range", "RSRQ"].map((h) => (
                <th key={h} className="border-b border-line py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {n.map((c, i) => (
              <tr key={i}>
                <td className="border-b border-line py-2 pr-4">{c.rat}</td>
                <td className="border-b border-line py-2 pr-4 font-medium tabular-nums">{c.pci}</td>
                <td className="border-b border-line py-2 pr-4">
                  {c.band != null ? (c.rat === "NR" ? `n${c.band}` : `B${c.band}`) : "–"}
                </td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{c.earfcn ?? "–"}</td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">
                  {c.freqMHz != null ? `${num(c.freqMHz, 1)} MHz` : "–"}
                </td>
                <td className="border-b border-line py-2 pr-4 tabular-nums">{c.samples}</td>
                <td className="border-b border-line py-2 pr-4">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: rsrpColor(c.rsrpMean) }} />
                    <span className="tabular-nums">{num(c.rsrpMean, 1, " dBm")}</span>
                  </span>
                </td>
                <td className="border-b border-line py-2 pr-4 tabular-nums text-muted">
                  {c.rsrpMin != null ? `${num(c.rsrpMin, 1)}…${num(c.rsrpMax, 1)}` : "–"}
                </td>
                <td className="border-b border-line py-2 tabular-nums">{num(c.rsrqMean, 1, " dB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Every distinct neighbour cell (by PCI + frequency) seen during the walk, strongest first. Neighbours are
        identified by PCI; a full global Cell ID is only broadcast for the serving cell.
      </p>
    </div>
  );
}
