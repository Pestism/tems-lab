import { NextResponse } from "next/server";

export const runtime = "edge";

const BUCKETS = new Set(["<2MB", "2-8MB", "8-20MB", "20-50MB", ">50MB"]);
const EVENTS = new Set(["parse_started", "parse_succeeded", "parse_failed"]);
const hits = new Map<string, { n: number; t: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const w = hits.get(ip);
  if (!w || now - w.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  w.n += 1;
  return w.n > 120;
}

function valid(b: unknown): boolean {
  if (!b || typeof b !== "object") return false;
  const e = b as Record<string, unknown>;
  if (typeof e.event !== "string" || !EVENTS.has(e.event)) return false;
  if (e.event === "parse_succeeded") {
    return (
      typeof e.parseMs === "number" &&
      e.parseMs >= 0 &&
      e.parseMs < 600_000 &&
      typeof e.sizeBucket === "string" &&
      BUCKETS.has(e.sizeBucket) &&
      Array.isArray(e.panels) &&
      e.panels.length <= 10 &&
      e.panels.every((p) => typeof p === "string" && p.length <= 20)
    );
  }
  if (e.event === "parse_failed") return typeof e.errorClass === "string" && e.errorClass.length <= 40;
  return true;
}

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (limited(ip)) return new NextResponse(null, { status: 429 });

  const raw = await req.text();
  if (raw.length > 2048) return new NextResponse(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!valid(parsed)) return new NextResponse(null, { status: 400 });

  // Structured line for log-based observability. Carries no user data.
  console.log("telemetry", JSON.stringify(parsed));
  return new NextResponse(null, { status: 204 });
}
