import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { Trp } from "../../src/parser/trp";
import { extract } from "../../src/parser/extract";
import { sameSessionGroups, type FilePart } from "../../src/lib/group";

const here = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(here, "..", "fixtures", "sample.trp"));
const NAME = "20250411T152413Z.trp";

describe("extract() array path", () => {
  it("extract([trp]) is identical to extract(trp)", () => {
    const single = extract(new Trp(new Uint8Array(buf), NAME));
    const asArray = extract([new Trp(new Uint8Array(buf), NAME)]);
    expect(asArray).toEqual(single);
  });

  it("exposes absolute epoch bounds", () => {
    const d = extract(new Trp(new Uint8Array(buf), NAME));
    expect(d.overview.endEpoch).toBeGreaterThan(d.overview.startEpoch);
    expect(Math.round(d.overview.endEpoch - d.overview.startEpoch)).toBe(Math.round(d.overview.durationS));
  });

  it("merges two files without throwing and unions their sessions", () => {
    const one = extract(new Trp(new Uint8Array(buf), NAME));
    const both = extract([new Trp(new Uint8Array(buf), "a.trp"), new Trp(new Uint8Array(buf), "b.trp")]);
    expect(both.file).toBe("2 files · combined");
    expect(both.overview.downloads).toBe(one.overview.downloads * 2);
    expect(both.series.t.length).toBeGreaterThan(0);
    expect(typeof both.csv.perSecond).toBe("string");
  });
});

describe("sameSessionGroups", () => {
  const p = (index: number, startEpoch: number, endEpoch: number, technology = "LTE", operator = "Telia"): FilePart => ({
    index,
    startEpoch,
    endEpoch,
    technology,
    operator,
  });

  it("groups files bridged by a short reconnect gap", () => {
    const parts = [p(0, 1000, 1100), p(1, 1180, 1300)]; // 80 s gap
    expect(sameSessionGroups(parts)).toEqual([[0, 1]]);
  });

  it("splits files separated by more than the threshold", () => {
    const parts = [p(0, 1000, 1100), p(1, 2000, 2100)]; // 900 s gap
    expect(sameSessionGroups(parts)).toEqual([[0], [1]]);
  });

  it("does not merge across different technology or operator", () => {
    const parts = [p(0, 1000, 1100, "LTE"), p(1, 1150, 1200, "NR")];
    expect(sameSessionGroups(parts)).toEqual([[0], [1]]);
  });

  it("orders by start time and tolerates overlap", () => {
    const parts = [p(1, 1150, 1400), p(0, 1000, 1200)]; 
    expect(sameSessionGroups(parts)).toEqual([[0, 1]]);
  });
});
