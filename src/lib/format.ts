export function num(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${v.toFixed(digits).replace(/\.0+$/, "")}${suffix}`;
}

export function bytes(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "–";
  const u = ["B", "KB", "MB", "GB"];
  let n = v;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

// RSRP colour scale (green good -> red poor), used by map + legend.
export function rsrpColor(rsrp: number | null): string {
  if (rsrp === null || !Number.isFinite(rsrp)) return "#8b949e";
  const stops: [number, string][] = [
    [-80, "#15803d"],
    [-90, "#65a30d"],
    [-100, "#ca8a04"],
    [-110, "#ea580c"],
    [-120, "#dc2626"],
  ];
  if (rsrp >= stops[0][0]) return stops[0][1];
  for (const [th, c] of stops) if (rsrp >= th) return c;
  return stops[stops.length - 1][1];
}

export const RSRP_LEGEND: { label: string; color: string }[] = [
  { label: "≥ −80 ", color: "#15803d" },
  { label: "−80−90", color: "#65a30d" },
  { label: "−90−100", color: "#ca8a04" },
  { label: "−100−110", color: "#ea580c" },
  { label: "< −110", color: "#dc2626" },
  { label: "no reading", color: "#8b949e" },
];
