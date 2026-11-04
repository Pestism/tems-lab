"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Dropzone from "@/components/Dropzone";
import ProgressBar from "@/components/ProgressBar";
import Dashboard from "@/components/Dashboard";
import History from "@/components/History";
import type { Dashboard as DashboardData } from "@/parser/extract";
import type { WorkerFile, WorkerOut } from "@/parser/worker";
import { track, sizeBucket } from "@/lib/analytics";
import { bytes } from "@/lib/format";
import { sameSessionGroups, type FilePart } from "@/lib/group";
import {
  clearAll,
  deleteFile,
  getData,
  listMeta,
  purgeExpired,
  requestPersist,
  saveFile,
  touch,
  type HistoryMeta,
  type HistorySummary,
} from "@/lib/history";

type Parsed = { name: string; size: number; buffer: ArrayBuffer; dashboard: DashboardData; id: string | null };
type View = { name: string; data: DashboardData };
type Src = { files: { id: string; name: string }[]; combined: boolean };

type State =
  | { s: "idle" }
  | { s: "parsing"; phase: string }
  | { s: "choose"; parts: Parsed[]; group: number[] }
  | { s: "done"; views: View[]; active: number; src?: Src }
  | { s: "error"; message: string };

const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_SIZE = 200 * 1024 * 1024;
const LAST_VIEW_KEY = "tems:lastView";
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type LastView = Src & { active: number };
function saveLastView(lv: LastView) {
  try {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(lv));
  } catch {}
}
function clearLastView() {
  try {
    localStorage.removeItem(LAST_VIEW_KEY);
  } catch {}
}
function srcOf(parts: Parsed[]): Src | undefined {
  return parts.every((p) => p.id)
    ? { files: parts.map((p) => ({ id: p.id!, name: p.name })), combined: false }
    : undefined;
}

function summaryOf(o: DashboardData["overview"]): HistorySummary {
  return {
    operator: o.operator,
    technology: o.technology,
    downloadBytes: o.downloadBytes,
    durationS: o.durationS,
    routePoints: o.routePoints,
    startUtc: o.startUtc,
  };
}

const asViews = (parts: Parsed[]): View[] => parts.map((p) => ({ name: p.name, data: p.dashboard }));

export default function Page() {
  const [state, setState] = useState<State>({ s: "idle" });
  const [staged, setStaged] = useState<File[]>([]);
  const [history, setHistory] = useState<HistoryMeta[]>([]);
  const [mounted, setMounted] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const refreshHistory = useCallback(() => {
    listMeta().then(setHistory).catch(() => { });
  }, []);

  const parse = useCallback(
    (files: WorkerFile[], fixedPhase?: string): Promise<{ dashboard: DashboardData; parseMs: number }> =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL("../parser/worker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onmessage = (e: MessageEvent<WorkerOut>) => {
          const m = e.data;
          if (m.type === "progress") setState({ s: "parsing", phase: fixedPhase ?? m.phase });
          else if (m.type === "done") {
            worker.terminate();
            workerRef.current = null;
            resolve({ dashboard: m.dashboard, parseMs: m.parseMs });
          } else {
            worker.terminate();
            workerRef.current = null;
            const err = new Error(m.message || "Could not read this file.");
            err.name = m.errorClass || "Error";
            reject(err);
          }
        };
        worker.onerror = () => {
          worker.terminate();
          workerRef.current = null;
          reject(new Error("The parser crashed while reading this file."));
        };
        const transfer = files.map((f) => f.buffer);
        if (files.length === 1) worker.postMessage({ buffer: files[0].buffer, name: files[0].name }, transfer);
        else worker.postMessage({ files }, transfer);
      }),
    []
  );

  const fail = useCallback((err: unknown) => {
    setState({ s: "error", message: err instanceof Error ? err.message : "Could not read this file." });
    track({ event: "parse_failed", errorClass: err instanceof Error ? err.name : "Error" });
  }, []);

  const restoreLast = useCallback(async () => {
    let lv: LastView | null = null;
    try {
      const raw = localStorage.getItem(LAST_VIEW_KEY);
      if (raw) lv = JSON.parse(raw) as LastView;
    } catch {}
    if (!lv?.files?.length) return;
    setState({ s: "parsing", phase: "Restoring your last file" });
    const files = lv.files;
    const datas = await Promise.all(files.map((f) => getData(f.id)));
    if (datas.some((d) => !d)) {
      clearLastView();
      setState({ s: "idle" });
      return;
    }
    try {
      if (lv.combined && files.length > 1) {
        const { dashboard } = await parse(files.map((f, i) => ({ buffer: datas[i]!, name: f.name })), "Restoring your last file");
        setState({ s: "done", views: [{ name: `${files.length} files · combined`, data: dashboard }], active: 0, src: { files, combined: true } });
      } else {
        const views: View[] = [];
        for (let i = 0; i < files.length; i++) {
          const { dashboard } = await parse([{ buffer: datas[i]!, name: files[i].name }], "Restoring your last file");
          views.push({ name: files[i].name, data: dashboard });
        }
        setState({ s: "done", views, active: Math.min(lv.active || 0, views.length - 1), src: { files, combined: false } });
      }
      files.forEach((f) => touch(f.id));
    } catch {
      clearLastView();
      setState({ s: "idle" });
    }
  }, [parse]);

  useIsoLayoutEffect(() => {
    setMounted(true);
    void restoreLast();
  }, [restoreLast]);

  useEffect(() => {
    requestPersist();
    purgeExpired(MAX_AGE_MS).finally(refreshHistory);
  }, [refreshHistory]);

  useEffect(() => {
    if (state.s === "done" && state.src) saveLastView({ ...state.src, active: state.active });
  }, [state]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    clearLastView();
    setStaged([]);
    setState({ s: "idle" });
    refreshHistory();
  }, [refreshHistory]);

  const runFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setStaged([]);
      setState({ s: "parsing", phase: "Reading file" });
      track({ event: "parse_started" });
      try {
        const parts: Parsed[] = [];
        for (const f of files) {
          const buf = await f.arrayBuffer();
          const keep = buf.slice(0);
          const { dashboard, parseMs } = await parse([{ buffer: buf, name: f.name }]);
          track({ event: "parse_succeeded", parseMs, sizeBucket: sizeBucket(f.size), panels: dashboard.panels });
          const meta = await saveFile(keep, f.name, summaryOf(dashboard.overview));
          parts.push({ name: f.name, size: f.size, buffer: keep, dashboard, id: meta?.id ?? null });
        }
        refreshHistory();

        if (parts.length === 1) {
          setState({ s: "done", views: asViews(parts), active: 0, src: srcOf(parts) });
          return;
        }
        const fparts: FilePart[] = parts.map((p, i) => ({
          index: i,
          startEpoch: p.dashboard.overview.startEpoch,
          endEpoch: p.dashboard.overview.endEpoch,
          technology: p.dashboard.overview.technology,
          operator: p.dashboard.overview.operator,
        }));
        const group = sameSessionGroups(fparts).find((g) => g.length > 1);
        if (group) setState({ s: "choose", parts, group });
        else setState({ s: "done", views: asViews(parts), active: 0, src: srcOf(parts) });
      } catch (err) {
        fail(err);
      }
    },
    [parse, refreshHistory, fail]
  );

  const onFiles = useCallback((fileList: File[]) => {
    const incoming = fileList.filter((f) => f.size <= MAX_SIZE);
    if (!incoming.length) {
      setState({ s: "error", message: "That file is over 200 MB. Please use a TEMS Pocket .trp logfile." });
      return;
    }
    setState({ s: "idle" });
    setStaged((prev) => {
      const key = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))];
    });
  }, []);

  const removeStaged = useCallback((i: number) => {
    setStaged((prev) => prev.filter((_, k) => k !== i));
  }, []);

  const combine = useCallback(
    async (parts: Parsed[], group: number[]) => {
      setState({ s: "parsing", phase: "Combining session" });
      track({ event: "parse_started" });
      try {
        const files = group.map((i) => ({ buffer: parts[i].buffer, name: parts[i].name }));
        const totalSize = group.reduce((n, i) => n + parts[i].size, 0);
        const { dashboard, parseMs } = await parse(files);
        track({ event: "parse_succeeded", parseMs, sizeBucket: sizeBucket(totalSize), panels: dashboard.panels });
        const grp = group.map((i) => parts[i]);
        const src: Src | undefined = grp.every((p) => p.id)
          ? { files: grp.map((p) => ({ id: p.id!, name: p.name })), combined: true }
          : undefined;
        setState({ s: "done", views: [{ name: `${group.length} files · combined`, data: dashboard }], active: 0, src });
      } catch (err) {
        fail(err);
      }
    },
    [parse, fail]
  );

  const onOpen = useCallback(
    (m: HistoryMeta) => {
      getData(m.id).then(async (data) => {
        if (!data) {
          setState({ s: "error", message: "That file is no longer stored on this device. Please open it again." });
          deleteFile(m.id).then(refreshHistory);
          return;
        }
        touch(m.id);
        setState({ s: "parsing", phase: "Reading file" });
        try {
          const { dashboard } = await parse([{ buffer: data, name: m.name }]);
          setState({ s: "done", views: [{ name: m.name, data: dashboard }], active: 0, src: { files: [{ id: m.id, name: m.name }], combined: false } });
        } catch (err) {
          fail(err);
        }
      });
    },
    [parse, refreshHistory, fail]
  );

  const onDelete = useCallback((id: string) => deleteFile(id).then(refreshHistory), [refreshHistory]);
  const onClear = useCallback(() => clearAll().then(refreshHistory), [refreshHistory]);

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">TEMS Lab Analyzer</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Open a TEMS <code>.trp</code> logfile to view coverage, signal, throughput and radio
          parameters.
        </p>
      </header>

      {!mounted ? (
        <ProgressBar phase="Loading" />
      ) : state.s === "done" ? (
        <div className="space-y-3">
          {state.views.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {state.views.map((v, i) => (
                <button
                  key={`${v.name}-${i}`}
                  onClick={() => setState({ ...state, active: i })}
                  className={`max-w-[16rem] truncate rounded-lg border px-3 py-1.5 text-xs ${i === state.active ? "border-brand font-medium text-brand" : "border-line text-muted hover:text-ink"
                    }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
          <Dashboard d={state.views[state.active].data} onReset={reset} />
        </div>
      ) : state.s === "parsing" ? (
        <ProgressBar phase={state.phase} />
      ) : state.s === "choose" ? (
        <SessionChoice
          state={state}
          onCombine={combine}
          onSeparate={(p) => setState({ s: "done", views: asViews(p), active: 0, src: srcOf(p) })}
        />
      ) : (
        <div className="space-y-4">
          <Dropzone onFiles={onFiles} />
          {staged.length > 0 && (
            <Preview files={staged} onAnalyze={() => runFiles(staged)} onRemove={removeStaged} onClear={() => setStaged([])} />
          )}
          {state.s === "error" && (
            <div className="card border-red-500/40 px-4 py-3 text-sm">
              <span className="font-medium text-red-500">Couldn’t read that file.</span>{" "}
              <span className="text-muted">{state.message}</span>
            </div>
          )}
          <History items={history} onOpen={onOpen} onDelete={onDelete} onClear={onClear} />
        </div>
      )}

      <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
        IK1330 local TRP parsing tool ·{" "}
        <a
          href="https://github.com/Pestism/tems-lab"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          GitHub
        </a>
      </footer>
    </main>
  );
}

function Preview({
  files,
  onAnalyze,
  onRemove,
  onClear,
}: {
  files: File[];
  onAnalyze: () => void;
  onRemove: (i: number) => void;
  onClear: () => void;
}) {
  const total = files.reduce((n, f) => n + f.size, 0);
  return (
    <div className="card space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {files.length === 1 ? "1 file selected" : `${files.length} files selected`}
        </h2>
        <button onClick={onClear} className="text-xs text-muted underline hover:text-ink">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {files.map((f, i) => (
          <div key={`${f.name}-${f.size}-${f.lastModified}`} className="relative flex items-center gap-2 rounded-lg border border-line p-2 pr-7">
            <div className="text-2xl" aria-hidden>
              📡
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{f.name}</div>
              <div className="text-[11px] text-muted">{bytes(f.size)}</div>
            </div>
            <button
              onClick={() => onRemove(i)}
              aria-label={`Remove ${f.name}`}
              className="absolute right-1 top-1 h-5 w-5 rounded text-muted hover:bg-line hover:text-red-500"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onAnalyze} className="btn-primary text-sm">
          Analyze {files.length === 1 ? "file" : `${files.length} files`}
        </button>
        <span className="text-xs text-muted">Drop or click above to add more · {bytes(total)} total</span>
      </div>
    </div>
  );
}

function SessionChoice({
  state,
  onCombine,
  onSeparate,
}: {
  state: { parts: Parsed[]; group: number[] };
  onCombine: (parts: Parsed[], group: number[]) => void;
  onSeparate: (parts: Parsed[]) => void;
}) {
  const { parts, group } = state;
  const first = parts[group[0]].dashboard.overview.startUtc.slice(0, 5);
  const last = parts[group[group.length - 1]].dashboard.overview.endUtc.slice(0, 5);
  const tech = parts[group[0]].dashboard.overview.technology;
  const operator = parts[group[0]].dashboard.overview.operator;
  return (
    <div className="card space-y-3 p-4 sm:p-6">
      <h2 className="text-base font-semibold">These files look like one session</h2>
      <p className="text-sm text-muted">
        {group.length} logs {[operator, tech].filter(Boolean).join(" · ")} span {first}–{last}. A dropped
        connection during the walk can split one drive test into several files. Combine them into a single
        analysis?
      </p>
      <ul className="space-y-1 text-xs text-muted">
        {group.map((i) => (
          <li key={i} className="truncate">
            {parts[i].name} · {parts[i].dashboard.overview.startUtc.slice(0, 8)}–{parts[i].dashboard.overview.endUtc.slice(0, 8)}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => onCombine(parts, group)} className="btn-primary text-sm">
          Combine into one session
        </button>
        <button onClick={() => onSeparate(parts)} className="btn-secondary text-sm">
          Keep separate
        </button>
      </div>
      <p className="text-xs text-muted">All files are saved under Recent files either way.</p>
    </div>
  );
}
