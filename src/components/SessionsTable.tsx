"use client";
import { useEffect, useMemo, useState } from "react";
import type { Dashboard, SessionInfo } from "@/parser/extract";
import { num, bytes } from "@/lib/format";

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function sessionCsv(fullCsv: string, startUtc: string, stopUtc: string): string {
  const lines = fullCsv.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return "";
  const stop = stopUtc || startUtc;
  const rows = lines.slice(1).filter((l) => {
    const ci = l.indexOf(",");
    const t = ci === -1 ? l : l.slice(0, ci);
    return t >= startUtc && t <= stop;
  });
  return [lines[0], ...rows].join("\r\n") + "\r\n";
}

function save(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SessionsTable({ d }: { d: Dashboard }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-muted">
            {["#", "Service", "Start", "Duration", "Throughput", "Payload", "Status"].map((h) => (
              <th key={h} className="border-b border-line py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.sessions.map((s, i) => (
            <tr
              key={i}
              onClick={() => setOpen(i)}
              className="cursor-pointer hover:bg-line/40"
              title="View this session's per-second readings"
            >
              <td className="border-b border-line py-2 pr-4 text-muted">{i + 1}</td>
              <td className="border-b border-line py-2 pr-4">{s.service}{s.label ? ` · ${s.label}` : ""}</td>
              <td className="border-b border-line py-2 pr-4 tabular-nums">{s.startUtc}</td>
              <td className="border-b border-line py-2 pr-4 tabular-nums">{num(s.durationS, 1, " s")}</td>
              <td className="border-b border-line py-2 pr-4 tabular-nums">
                {s.throughputKbps !== null ? num(s.throughputKbps / 1000, 1, " Mbps") : "–"}
              </td>
              <td className="border-b border-line py-2 pr-4 tabular-nums">{bytes(s.payloadBytes)}</td>
              <td className="border-b border-line py-2">{s.status || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Click a session to see its per-second readings.</p>

      {open !== null && d.sessions[open] && (
        <SessionModal
          index={open}
          session={d.sessions[open]}
          csv={sessionCsv(d.csv.perSecond, d.sessions[open].startUtc, d.sessions[open].stopUtc)}
          fileBase={d.file.replace(/\.trp$/i, "").replace(/[^\w.-]+/g, "_")}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function SessionModal({
  index,
  session,
  csv,
  fileBase,
  onClose,
}: {
  index: number;
  session: SessionInfo;
  csv: string;
  fileBase: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { header, rows } = useMemo(() => {
    const lines = csv.split(/\r?\n/).filter((l) => l.length);
    return { header: lines.length ? splitCsv(lines[0]) : [], rows: lines.slice(1).map(splitCsv) };
  }, [csv]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-4 sm:p-5">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted">Session {index + 1}</div>
            <div className="truncate font-semibold">
              {session.service}
              {session.label ? ` · ${session.label}` : ""}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {session.startUtc}–{session.stopUtc || "?"} · {num(session.durationS, 1, " s")} ·{" "}
              {rows.length} per-second rows
              {session.status ? ` · ${session.status}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-line px-2 py-1 text-sm text-muted hover:border-brand/60 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {rows.length ? (
            <table className="w-full border-collapse text-xs tabular-nums">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-left text-muted">
                  {header.map((h, i) => (
                    <th key={i} className="whitespace-nowrap border-b border-line px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="whitespace-nowrap border-b border-line px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No per-second readings fell within this session&apos;s window.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line p-4 sm:p-5">
          <button
            onClick={() => save(`${fileBase}_session${index + 1}.csv`, csv)}
            className="btn-primary text-sm"
            disabled={!rows.length}
          >
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
