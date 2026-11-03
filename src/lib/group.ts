export type FilePart = {
  index: number;
  startEpoch: number;
  endEpoch: number;
  technology: string | null;
  operator: string | null;
};

export const DEFAULT_GAP_S = 5 * 60;

// Group files that look like one interrupted drive test: adjacent in absolute
// time (gap <= gapS), same technology and operator. Returns groups of indices.
export function sameSessionGroups(parts: FilePart[], gapS = DEFAULT_GAP_S): number[][] {
  const sorted = [...parts].sort((a, b) => a.startEpoch - b.startEpoch);
  const groups: { tech: string | null; operator: string | null; end: number; items: number[] }[] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && p.technology === g.tech && p.operator === g.operator && p.startEpoch - g.end <= gapS) {
      g.items.push(p.index);
      g.end = Math.max(g.end, p.endEpoch);
    } else {
      groups.push({ tech: p.technology, operator: p.operator, end: p.endEpoch, items: [p.index] });
    }
  }
  return groups.map((g) => g.items);
}
