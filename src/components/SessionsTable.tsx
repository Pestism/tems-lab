"use client";
import type { Dashboard } from "@/parser/extract";
import { num, bytes } from "@/lib/format";

export default function SessionsTable({ d }: { d: Dashboard }) {
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
            <tr key={i}>
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
    </div>
  );
}
