"use client";
import type { Dashboard } from "@/parser/extract";

function save(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Downloads({ d }: { d: Dashboard }) {
  const base = d.file.replace(/\.trp$/i, "");
  return (
    <div className="flex flex-wrap gap-3">
      <button onClick={() => save(`${base}_1s.csv`, d.csv.perSecond)} className="btn-primary text-sm">
        Download per-second CSV
      </button>
      <button onClick={() => save(`${base}_sessions.csv`, d.csv.sessions)} className="btn-secondary text-sm">
        Download per-session CSV
      </button>
    </div>
  );
}
