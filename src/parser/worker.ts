/// <reference lib="webworker" />
import { Trp } from "./trp";
import { extract, type Dashboard } from "./extract";

export type WorkerFile = { buffer: ArrayBuffer; name: string };
export type WorkerIn = WorkerFile | { files: WorkerFile[] };
export type WorkerOut =
  | { type: "progress"; phase: string }
  | { type: "done"; dashboard: Dashboard; parseMs: number }
  | { type: "error"; message: string; errorClass: string };

const MAX_BYTES = 200 * 1024 * 1024;

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const files: WorkerFile[] = "files" in e.data ? e.data.files : [e.data];
  const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);
  const started = performance.now();
  try {
    post({ type: "progress", phase: "Unpacking log package" });
    const trps = files.map((f) => {
      if (f.buffer.byteLength > MAX_BYTES) throw new RangeError("File too large (over 200 MB).");
      return new Trp(new Uint8Array(f.buffer), f.name);
    });
    post({ type: "progress", phase: "Decoding measurements" });
    const dashboard = extract(trps);
    post({ type: "done", dashboard, parseMs: Math.round(performance.now() - started) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Could not read this file.";
    const errorClass = err instanceof Error ? err.name : "Error";
    post({ type: "error", message, errorClass });
  }
};
