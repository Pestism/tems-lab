import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { Trp, toCsv } from "../../src/parser/trp";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "..", "fixtures");

function rows(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map((l) => splitCsv(l));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function cellEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) <= 1e-6 * Math.max(1, Math.abs(na), Math.abs(nb));
  }
  return false;
}

function compare(name: string, got: string, goldenFile: string) {
  const want = rows(readFileSync(join(fx, goldenFile), "utf8"));
  const have = rows(got);
  expect(have[0], `${name} header`).toEqual(want[0]);
  expect(have.length, `${name} row count`).toBe(want.length);
  const diffs: string[] = [];
  for (let r = 1; r < want.length; r++) {
    for (let c = 0; c < want[r].length; c++) {
      if (!cellEqual(have[r]?.[c] ?? "", want[r][c])) {
        diffs.push(`row ${r} col ${c} (${want[0][c]}): got "${have[r]?.[c]}" want "${want[r][c]}"`);
      }
    }
  }
  expect(diffs.slice(0, 20).join("\n")).toBe("");
}

describe("TS parser matches Python golden output", () => {
  const buf = readFileSync(join(fx, "sample.trp"));
  const trp = new Trp(new Uint8Array(buf), "20250411T152413Z.trp");
  const { main, sessions } = toCsv([trp], { fields: "auto", interval: 1, events: "default" });

  it("per-second CSV matches golden_1s.csv", () => {
    compare("per-second", main, "golden_1s.csv");
  });

  it("per-session CSV matches golden_1s_sessions.csv", () => {
    compare("sessions", sessions, "golden_1s_sessions.csv");
  });

  it("emits CRLF line endings", () => {
    expect(main.includes("\r\n")).toBe(true);
    expect(main.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});
