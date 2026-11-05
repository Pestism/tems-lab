"use client";
import { useMemo, useState } from "react";
import type { Dashboard, NeighborInfo } from "@/parser/extract";
import { num, rsrpColor } from "@/lib/format";

type Col = {
  key: string;
  label: string;
  numeric?: boolean;
  sort: (c: NeighborInfo) => number | string;
  cell: (c: NeighborInfo) => React.ReactNode;
};

const COLS: Col[] = [
  { key: "rat", label: "RAT", sort: (c) => c.rat, cell: (c) => c.rat },
  { key: "pci", label: "PCI", numeric: true, sort: (c) => c.pci, cell: (c) => c.pci },
  {
    key: "band",
    label: "Band",
    numeric: true,
    sort: (c) => c.band ?? -1,
    cell: (c) => (c.band != null ? (c.rat === "NR" ? `n${c.band}` : `B${c.band}`) : "–"),
  },
  { key: "earfcn", label: "Channel", numeric: true, sort: (c) => c.earfcn ?? -1, cell: (c) => c.earfcn ?? "–" },
  {
    key: "freq",
    label: "Freq",
    numeric: true,
    sort: (c) => c.freqMHz ?? -1,
    cell: (c) => (c.freqMHz != null ? `${num(c.freqMHz, 1)} MHz` : "–"),
  },
  { key: "firstSeen", label: "First seen", numeric: true, sort: (c) => c.firstSeen, cell: (c) => c.firstUtc },
  { key: "lastSeen", label: "Last seen", numeric: true, sort: (c) => c.lastSeen, cell: (c) => c.lastUtc },
  { key: "samples", label: "Samples", numeric: true, sort: (c) => c.samples, cell: (c) => c.samples },
  {
    key: "rsrpMean",
    label: "RSRP (mean)",
    numeric: true,
    sort: (c) => c.rsrpMean ?? -999,
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: rsrpColor(c.rsrpMean) }} />
        <span className="tabular-nums">{num(c.rsrpMean, 1, " dBm")}</span>
      </span>
    ),
  },
  {
    key: "rsrpRange",
    label: "RSRP range",
    numeric: true,
    sort: (c) => c.rsrpMin ?? -999,
    cell: (c) =>
      c.rsrpMin == null
        ? "–"
        : c.rsrpMin === c.rsrpMax
          ? num(c.rsrpMin, 1)
          : `${num(c.rsrpMin, 1)}-${num(c.rsrpMax, 1)}`,
  },
  { key: "rsrqMean", label: "RSRQ", numeric: true, sort: (c) => c.rsrqMean ?? -999, cell: (c) => num(c.rsrqMean, 1, " dB") },
];

export default function NeighborsTable({ d }: { d: Dashboard }) {
  const n = d.neighbors;
  const [sortKey, setSortKey] = useState("firstSeen");
  const [asc, setAsc] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [grouped, setGrouped] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const multiSession = useMemo(() => new Set(n.map((c) => c.sessionIndex)).size > 1, [n]);

  const visibleCols = useMemo(() => COLS.filter((c) => !hidden.has(c.key)), [hidden]);

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey) ?? COLS[5];
    const dir = asc ? 1 : -1;
    return [...n].sort((a, b) => {
      const av = col.sort(a);
      const bv = col.sort(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return cmp * dir || a.firstSeen - b.firstSeen;
    });
  }, [n, sortKey, asc]);

  if (!n.length) return <p className="text-sm text-muted">No neighbour cells were reported in this log.</p>;

  const toggleSort = (key: string) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "firstSeen" || key === "lastSeen" || key === "rat");
    }
  };
  const toggleCol = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const groups =
    grouped && multiSession
      ? [...new Map(sorted.map((c) => [c.sessionIndex, c.sessionLabel])).entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([idx, label]) => ({ idx, label, rows: sorted.filter((c) => c.sessionIndex === idx) }))
      : [{ idx: -1, label: "", rows: sorted }];

  const Table = ({ rows }: { rows: NeighborInfo[] }) => (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left text-muted">
          {!grouped && multiSession && (
            <th className="border-b border-line py-2 pr-4 font-medium">Session</th>
          )}
          {visibleCols.map((c) => (
            <th
              key={c.key}
              onClick={() => toggleSort(c.key)}
              className="cursor-pointer select-none border-b border-line py-2 pr-4 font-medium hover:text-ink"
            >
              {c.label}
              {sortKey === c.key && <span className="ml-1 text-brand">{asc ? "▲" : "▼"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={i}>
            {!grouped && multiSession && (
              <td className="border-b border-line py-2 pr-4 text-muted">{c.sessionLabel}</td>
            )}
            {visibleCols.map((col) => (
              <td
                key={col.key}
                className={`border-b border-line py-2 pr-4 ${col.numeric ? "tabular-nums" : ""} ${
                  col.key === "rsrpRange" ? "text-muted" : ""
                } ${col.key === "pci" ? "font-medium" : ""}`}
              >
                {col.cell(c)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {multiSession && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            Group by session
          </label>
        )}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-lg border border-line px-2 py-1 text-muted hover:border-brand/60 hover:text-ink"
          >
            Columns ▾
          </button>
          {pickerOpen && (
            <div className="absolute z-10 mt-1 w-44 rounded-lg border border-line bg-panel p-2 shadow-lg">
              {COLS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-muted hover:text-ink">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="text-muted">Click a column header to sort.</span>
      </div>

      {groups.map((g) => (
        <div key={g.idx} className="space-y-1">
          {grouped && multiSession && (
            <div className="text-sm font-medium">
              {g.label} <span className="text-muted">· {g.rows.length} cells</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table rows={g.rows} />
          </div>
        </div>
      ))}
    </div>
  );
}
