// QUOTE_MINIMAL with \r\n, matching Python's csv.writer defaults.
export function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

export function pyFloatStr(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? `${n}.0` : String(n);
}
