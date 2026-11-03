"use client";
import type { HistoryMeta } from "@/lib/history";
import { num, bytes } from "@/lib/format";

function when(ms: number): string {
  const d = new Date(ms);
  try {
    const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${day}, ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export default function History({
  items,
  onOpen,
  onDelete,
  onClear,
}: {
  items: HistoryMeta[];
  onOpen: (m: HistoryMeta) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Recent files</h2>
        <button onClick={onClear} className="text-xs text-muted underline hover:text-ink">
          Clear all
        </button>
      </div>
      <ul className="divide-y divide-line">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <button
              onClick={() => onOpen(m)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate text-sm font-medium hover:text-brand">{m.name}</div>
              <div className="truncate text-xs text-muted">
                {when(m.createdAt)} · {[m.summary.operator, m.summary.technology].filter(Boolean).join(" · ") || "—"}
                {m.summary.maxDlMbps != null && ` · max ${num(m.summary.maxDlMbps)} Mbps`}
                {m.summary.durationS ? ` · ${num(m.summary.durationS, 0)} s` : ""} · {bytes(m.size)}
              </div>
            </button>
            <button
              onClick={() => onDelete(m.id)}
              aria-label={`Delete ${m.name}`}
              className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-red-500/50 hover:text-red-500"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Stored only in this browser and removed automatically after 6 months — nothing is uploaded. On a
        shared computer, use <span className="font-medium">Clear all</span> when you are done.
      </p>
    </section>
  );
}
