// Anonymous, fixed-schema telemetry. Never includes file contents, file names,
// or measured values — only coarse operational signals.
export type AnalyticsEvent =
  | { event: "parse_started" }
  | { event: "parse_succeeded"; parseMs: number; sizeBucket: string; panels: string[] }
  | { event: "parse_failed"; errorClass: string };

export function sizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 2) return "<2MB";
  if (mb < 8) return "2-8MB";
  if (mb < 20) return "8-20MB";
  if (mb < 50) return "20-50MB";
  return ">50MB";
}

export function track(ev: AnalyticsEvent): void {
  try {
    const body = JSON.stringify(ev);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/event", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch {
    // telemetry is best-effort; never break the app
  }
}
