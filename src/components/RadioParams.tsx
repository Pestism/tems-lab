"use client";
import type { Dashboard } from "@/parser/extract";

export default function RadioParams({ d }: { d: Dashboard }) {
  const hasNr = d.radio.some((r) => r.nr);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="border-b border-line py-2 pr-4 font-medium">Parameter</th>
            <th className="border-b border-line py-2 pr-4 font-medium">LTE (4G)</th>
            {hasNr && <th className="border-b border-line py-2 font-medium">NR (5G)</th>}
          </tr>
        </thead>
        <tbody>
          {d.radio.map((r) => (
            <tr key={r.label}>
              <td className="border-b border-line py-2 pr-4 text-muted">{r.label}</td>
              <td className="border-b border-line py-2 pr-4 font-medium">{r.lte ?? "–"}</td>
              {hasNr && <td className="border-b border-line py-2 font-medium">{r.nr ?? "–"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
