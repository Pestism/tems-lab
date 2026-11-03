import type { DV } from "./protobuf";

export type Seg = [number, DV | null];

export class Series {
  t: number[] = [];
  v: (DV | null)[] = [];

  add(t: number, v: DV | null) {
    this.t.push(t);
    this.v.push(v);
  }

  window(t0: number, t1: number): Seg[] {
    let k = upperBound(this.t, t0);
    let held: DV | null = k ? this.v[k - 1] : null;
    let t = t0;
    const segs: Seg[] = [];
    while (k < this.t.length && this.t[k] < t1) {
      segs.push([this.t[k] - t, held]);
      t = this.t[k];
      held = this.v[k];
      k += 1;
    }
    segs.push([t1 - t, held]);
    return segs;
  }
}

function upperBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type Agg = "mean" | "mode" | "min" | "max" | "last";

export function aggregate(
  segments: Seg[],
  agg: Agg | null,
  isDb: boolean,
  linearDb: boolean
): DV | null {
  const segs = segments.filter(([, v]) => v !== null) as [number, DV][];
  if (!segs.length) return null;
  const numeric = segs.every(([, v]) => v.k !== "s");
  const a: Agg =
    agg || (numeric && segs.some(([, v]) => v.k === "f") ? "mean" : "mode");

  if (a === "last") return segs[segs.length - 1][1];
  if ((a === "min" || a === "max") && numeric) {
    let best = segs[0][1] as DV;
    for (const [, v] of segs) {
      const n = (v as { n: number }).n;
      const bn = (best as { n: number }).n;
      if (a === "min" ? n < bn : n > bn) best = v;
    }
    return best;
  }
  if (a !== "mean" || !numeric) {
    const acc = new Map<string, number>();
    const keep = new Map<string, DV>();
    for (const [d, v] of segs) {
      const key = v.k === "s" ? "s:" + v.s : "n:" + v.n;
      acc.set(key, (acc.get(key) || 0) + d);
      if (!keep.has(key)) keep.set(key, v);
    }
    let bestKey = "";
    let bestD = -Infinity;
    for (const [key, d] of acc) {
      if (d > bestD) {
        bestD = d;
        bestKey = key;
      }
    }
    return keep.get(bestKey)!;
  }
  let total = 0;
  for (const [d] of segs) total += d;
  let use = segs;
  if (total === 0) {
    use = segs.map(([, v]) => [1, v] as [number, DV]);
    total = use.length;
  }
  if (isDb && linearDb) {
    let s = 0;
    for (const [d, v] of use) s += d * 10 ** ((v as { n: number }).n / 10);
    return { k: "f", n: 10 * Math.log10(s / total) };
  }
  let s = 0;
  for (const [d, v] of use) s += d * (v as { n: number }).n;
  return { k: "f", n: s / total };
}

export function summarizeEvents(evs: string[]): string {
  const counts = new Map<string, number>();
  for (const n of evs) counts.set(n, (counts.get(n) || 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n}x${c}` : n)).join(";");
}
