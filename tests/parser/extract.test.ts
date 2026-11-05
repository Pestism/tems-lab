import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { Trp } from "../../src/parser/trp";
import { extract } from "../../src/parser/extract";

const here = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(here, "..", "fixtures", "sample.trp"));

describe("extract() dashboard", () => {
  const d = extract(new Trp(new Uint8Array(buf), "20250411T152413Z.trp"));

  it("has the expected panels and overview", () => {
    expect(d.panels).toContain("map");
    expect(d.panels).toContain("signal");
    expect(d.panels).toContain("throughput");
    expect(d.panels).toContain("radio");
    expect(d.panels).toContain("sessions");
    expect(d.overview.mcc).toBe(240);
    expect(d.overview.operator).toBe("Telia");
    expect(d.overview.downloads).toBe(10);
    expect(d.overview.routePoints).toBe(227);
    expect(d.overview.lteBands.map((b) => b.band).sort((a, b) => a - b)).toEqual([3, 7, 20]);
    const b7 = d.overview.lteBands.find((b) => b.band === 7)!;
    const b20 = d.overview.lteBands.find((b) => b.band === 20)!;
    expect(b7.earfcn).toBe(3150);
    expect(b20.earfcn).toBe(6300);
    expect(d.overview.downloadBytes).toBeGreaterThan(0);
  });

  it("produces aligned time series and route points", () => {
    expect(d.series.t.length).toBeGreaterThan(300);
    expect(d.series.rsrp.length).toBe(d.series.t.length);
    expect(d.route.every((p) => p.lat > 59 && p.lat < 60 && p.lon > 17 && p.lon < 19)).toBe(true);
    console.log("overview:", JSON.stringify(d.overview, null, 1).slice(0, 900));
    console.log("radio:", JSON.stringify(d.radio));
  });
});
