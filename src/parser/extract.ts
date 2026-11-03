import { Trp, Column, process, toCsv } from "./trp";
import { aggregate, Series } from "./series";
import type { DV } from "./protobuf";
import { lteDuplex, lteDownlinkMHzForBand, nrDuplex, nrDownlinkMHz } from "./bands";

export type BandInfo = {
  band: number;
  earfcn: number | null;
  freqMHz: number | null;
  bandwidthMHz: number | null;
  duplex: string | null;
  sharePct: number;
};

export type SessionInfo = {
  service: string;
  label: string;
  startUtc: string;
  stopUtc: string;
  durationS: number;
  throughputKbps: number | null;
  payloadBytes: number | null;
  transferTimeS: number | null;
  status: string;
  url: string;
};

export type RadioParam = { label: string; lte: string | null; nr: string | null };

export type Dashboard = {
  file: string;
  overview: {
    operator: string | null;
    mcc: number | null;
    mnc: number | null;
    technology: string | null;
    startUtc: string;
    endUtc: string;
    startEpoch: number;
    endEpoch: number;
    durationS: number;
    lteBands: BandInfo[];
    nrBands: BandInfo[];
    maxDlMbps: number | null;
    meanRsrp: number | null;
    medianRsrp: number | null;
    downloads: number;
    routePoints: number;
  };
  series: { t: number[]; [metric: string]: (number | null)[] };
  seriesMeta: { key: string; label: string; unit: string; group: string }[];
  route: { lat: number; lon: number; rsrp: number | null }[];
  radio: RadioParam[];
  sessions: SessionInfo[];
  panels: string[];
  csv: { perSecond: string; sessions: string };
};

const CHART_METRICS: { key: string; label: string; unit: string; group: string; db?: boolean }[] = [
  { key: "rsrp", label: "LTE RSRP", unit: "dBm", group: "LTE", db: true },
  { key: "rsrq", label: "LTE RSRQ", unit: "dB", group: "LTE", db: true },
  { key: "sinr", label: "LTE SINR", unit: "dB", group: "LTE", db: true },
  { key: "rssi", label: "LTE RSSI", unit: "dBm", group: "LTE", db: true },
  { key: "nr_rsrp", label: "NR SS-RSRP", unit: "dBm", group: "NR", db: true },
  { key: "nr_rsrq", label: "NR SS-RSRQ", unit: "dB", group: "NR", db: true },
  { key: "nr_sinr", label: "NR SS-SINR", unit: "dB", group: "NR", db: true },
  { key: "dl_mbps", label: "Downlink throughput", unit: "Mbps", group: "Throughput" },
];

const RADIO_IES: Record<string, string[]> = {
  bw: ["Radio.Lte.ServingCell[8].Downlink.Bandwidth"],
  modulation: ["Radio.Lte.ServingCell[8].Pdsch.Stream[2].Modulation"],
  mimo: ["Radio.Lte.ServingCell[8].MimoAntennaConfiguration"],
  rank: ["Pocket.Radio.Lte.ServingCell[8].RankIndicatorMax", "Radio.Lte.ServingCell[8].RankIndicator"],
  tm: ["Radio.Lte.ServingCell[8].TransmissionMode"],
  pmi: ["Radio.Lte.ServingCell[8].Pmi"],
  nr_mod: ["Radio.Nr.ServingCell[16].Pdsch.Modulation", "Radio.Nr.ServingCell[16].Pdsch.Codeword[2].Modulation"],
  nr_mimo: ["Radio.Nr.ServingCell[16].Pdsch.Layers", "Radio.Nr.ServingCell[16].Pdsch.NumberOfLayers"],
  nr_rank: ["Pocket.Radio.Nr.ServingCell.Pdsch.RankIndicator.SessionMax", "Radio.Nr.ServingCell[16].Pdsch.RankIndicator"],
  nr_bw: ["Radio.Nr.ServingCell[16].Downlink.Bandwidth"],
};

function num(v: DV | null): number | null {
  return v && v.k !== "s" ? v.n : null;
}
function str(v: DV | null): string | null {
  if (v === null) return null;
  return v.k === "s" ? v.s : String(v.n);
}

function at(s: Series, t: number): DV | null {
  let lo = 0;
  let hi = s.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo ? s.v[lo - 1] : null;
}

const OPERATORS: Record<string, string> = {
  "240-1": "Telia",
  "240-2": "Tre (Hi3G)",
  "240-4": "Tele2",
  "240-5": "Tele2",
  "240-6": "Telenor",
  "240-7": "Tele2",
  "240-8": "Telenor",
  "240-24": "Net4Mobility",
};

export function extract(input: Trp | Trp[], interval = 1): Dashboard {
  const trps = Array.isArray(input) ? input : [input];
  const specs = [
    "technology", "operator", "mcc", "mnc", "band", "earfcn", "pci",
    "nr_band", "nr_arfcn", "nr_pci",
    "rsrp", "rsrq", "sinr", "rssi", "nr_rsrp", "nr_rsrq", "nr_sinr",
    "dl_kbps", "lat", "lon", "speed",
  ];
  const cols = specs.map((s) => new Column(s));
  const radioCols: Record<string, Column> = {};
  for (const [k, sel] of Object.entries(RADIO_IES)) {
    const c = new Column(k === "bw" ? "bw" : k);
    c.selectors = k === "bw" ? c.selectors : sel;
    c.agg = "mode";
    radioCols[k] = c;
  }
  const all = [...cols, ...Object.values(radioCols)];
  let tFirst: number | null = null;
  let tLast: number | null = null;
  const parts = trps.map((tp) => {
    const r = process(tp, all, null);
    if (r.tFirst !== null) tFirst = tFirst === null ? r.tFirst : Math.min(tFirst, r.tFirst);
    if (r.tLast !== null) tLast = tLast === null ? r.tLast : Math.max(tLast, r.tLast);
    return r.series;
  });
  const series = parts.length === 1 ? parts[0] : mergeSeries(parts, all);
  const col = (name: string) => cols.find((c) => c.header === name)!;
  const S = (name: string) => series.get(col(name))!;

  const t0 = tFirst ?? 0;
  const t1 = tLast ?? t0;
  const span = (s: Series, a: number, b: number, c: Column) =>
    aggregate(s.window(a, b), c.agg, c.isDb, false);
  const whole = (name: string) => span(S(name), t0, t1 + 1e-9, col(name));

  // time-series buckets
  const t: number[] = [];
  const out: Record<string, (number | null)[]> = {};
  for (const m of CHART_METRICS) out[m.key] = [];
  for (let b = Math.floor(t0 / interval) * interval; b <= t1; b += interval) {
    t.push(Math.round((b - t0) * 1000) / 1000);
    for (const m of CHART_METRICS) {
      const src = m.key === "dl_mbps" ? "dl_kbps" : m.key;
      const c = col(src);
      const v = num(span(series.get(c)!, b, Math.min(b + interval, t1 + 1e-9), c));
      out[m.key].push(v === null ? null : m.key === "dl_mbps" ? v / 1000 : v);
    }
  }
  const seriesOut: Dashboard["series"] = { t };
  for (const m of CHART_METRICS) seriesOut[m.key] = out[m.key];

  // bands: walk the band series, attributing duration and the co-held earfcn
  const bandShare = (bandCol: string, earfcnCol: string, nr: boolean): BandInfo[] => {
    const bs = S(bandCol);
    const earS = S(earfcnCol);
    if (!bs.t.length) return [];
    const end = t1 + 1e-9;
    const dur = new Map<number, number>();
    const perEarfcn = new Map<number, Map<number, number>>();
    for (let i = 0; i < bs.t.length; i++) {
      const band = bandNum(bs.v[i]);
      if (band === null) continue;
      const a = Math.max(bs.t[i], t0);
      const b = Math.min(i + 1 < bs.t.length ? bs.t[i + 1] : end, end);
      const d = b - a;
      if (d <= 0) continue;
      dur.set(band, (dur.get(band) || 0) + d);
      const ef = at(earS, bs.t[i]);
      if (ef && ef.k !== "s") {
        if (!perEarfcn.has(band)) perEarfcn.set(band, new Map());
        const m = perEarfcn.get(band)!;
        m.set(ef.n, (m.get(ef.n) || 0) + d);
      }
    }
    const total = [...dur.values()].reduce((a, b) => a + b, 0) || 1;
    return [...dur.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([band, d]) => {
        const em = perEarfcn.get(band);
        const earfcn = em ? [...em.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
        const freqMHz = earfcn == null ? null : nr ? nrDownlinkMHz(earfcn) : lteDownlinkMHzForBand(band, earfcn);
        return {
          band,
          earfcn,
          freqMHz,
          bandwidthMHz: null,
          duplex: nr ? nrDuplex(band) : lteDuplex(band),
          sharePct: Math.round((d / total) * 1000) / 10,
        };
      });
  };

  const rsrpVals = S("rsrp").v.filter((v): v is DV => v !== null && v.k !== "s").map((v) => (v as { n: number }).n);
  rsrpVals.sort((a, b) => a - b);
  const median = rsrpVals.length ? rsrpVals[rsrpVals.length >> 1] : null;
  const dlVals = S("dl_kbps").v.filter((v): v is DV => v !== null && v.k !== "s").map((v) => (v as { n: number }).n);
  const maxDl = dlVals.length ? Math.max(...dlVals) / 1000 : null;

  const mcc = num(whole("mcc"));
  const mnc = num(whole("mnc"));
  let operator = str(whole("operator"));
  if (!operator && mcc != null && mnc != null) operator = OPERATORS[`${mcc}-${mnc}`] ?? null;

  // route
  const latS = S("lat");
  const lonS = S("lon");
  const rsrpS = S("rsrp");
  const route: Dashboard["route"] = [];
  for (let i = 0; i < latS.t.length; i++) {
    const lat = latS.v[i];
    if (!lat || lat.k === "s") continue;
    const lon = at(lonS, latS.t[i]);
    if (!lon || lon.k === "s") continue;
    route.push({ lat: lat.n, lon: lon.n, rsrp: num(at(rsrpS, latS.t[i])) });
  }

  // radio params table
  const rp = (k: string) => str(aggregate(series.get(radioCols[k])!.window(t0, t1 + 1e-9), "mode", false, false));
  const lteB = bandShare("band", "earfcn", false);
  const nrB = bandShare("nr_band", "nr_arfcn", true);
  const radio: RadioParam[] = [
    { label: "Bands", lte: bandList(lteB, false), nr: bandList(nrB, true) },
    { label: "Bandwidth", lte: fmtBw(rp("bw")), nr: fmtBw(rp("nr_bw")) },
    { label: "Duplex mode", lte: duplexList(lteB), nr: duplexList(nrB) },
    { label: "Modulation", lte: fmtMod(rp("modulation")), nr: fmtMod(rp("nr_mod")) },
    { label: "MIMO", lte: rp("mimo"), nr: rp("nr_mimo") },
    { label: "Rank indicator", lte: fmtRank(rp("rank")), nr: fmtRank(rp("nr_rank")) },
    { label: "Transmission mode", lte: fmtTm(rp("tm")), nr: null },
    { label: "PMI", lte: rp("pmi"), nr: null },
  ].filter((r) => r.lte || r.nr);

  // sessions
  const rawSessions =
    trps.length === 1
      ? trps[0].sessions()
      : trps.flatMap((tp) => tp.sessions()).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const sessions: SessionInfo[] = rawSessions.map((s) => {
    const g = (k: string): string | null => {
      const v = s.summary[k];
      return v === undefined ? null : typeof v === "object" ? String(v.dur) : v;
    };
    const n = (k: string) => {
      const v = g(k);
      return v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
    };
    return {
      service: s.service ?? "",
      label: s.label ?? "",
      startUtc: new Date((s.start ?? 0) * 1000).toISOString().slice(11, 23),
      stopUtc: s.stop ? new Date(s.stop * 1000).toISOString().slice(11, 23) : "",
      durationS: s.stop ? Math.round((s.stop - (s.start ?? 0)) * 1000) / 1000 : 0,
      throughputKbps: n("Throughput"),
      payloadBytes: n("Payload"),
      transferTimeS: n("TransferTime"),
      status: g("Status") ?? "",
      url: g("DownloadedUrl") ?? "",
    };
  });

  const lteBands = bandShare("band", "earfcn", false);
  const nrBands = bandShare("nr_band", "nr_arfcn", true);

  const seriesMeta = CHART_METRICS.filter((m) => seriesOut[m.key].some((v) => v !== null)).map(
    ({ key, label, unit, group }) => ({ key, label, unit, group })
  );

  const panels: string[] = [];
  if (route.length) panels.push("map");
  if (seriesMeta.some((m) => m.group === "LTE" || m.group === "NR")) panels.push("signal");
  if (seriesMeta.some((m) => m.group === "Throughput") || sessions.length) panels.push("throughput");
  if (radio.length) panels.push("radio");
  if (sessions.length) panels.push("sessions");

  const { main, sessions: sessCsv } = toCsv(trps, { fields: "auto", interval, events: "default" });

  return {
    file: trps.length === 1 ? trps[0].name : `${trps.length} files · combined`,
    overview: {
      operator,
      mcc,
      mnc,
      technology: str(whole("technology")),
      startUtc: new Date(t0 * 1000).toISOString().slice(11, 23),
      endUtc: new Date(t1 * 1000).toISOString().slice(11, 23),
      startEpoch: t0,
      endEpoch: t1,
      durationS: Math.round((t1 - t0) * 10) / 10,
      lteBands,
      nrBands,
      maxDlMbps: maxDl === null ? null : Math.round(maxDl * 10) / 10,
      meanRsrp: round1(num(whole("rsrp"))),
      medianRsrp: round1(median),
      downloads: sessions.length,
      routePoints: route.length,
    },
    series: seriesOut,
    seriesMeta,
    route,
    radio,
    sessions,
    panels,
    csv: { perSecond: main, sessions: sessCsv },
  };
}

function mergeSeries(parts: Map<Column, Series>[], cols: Column[]): Map<Column, Series> {
  const out = new Map<Column, Series>();
  for (const c of cols) {
    const items: [number, DV | null][] = [];
    for (const p of parts) {
      const ps = p.get(c);
      if (!ps) continue;
      for (let i = 0; i < ps.t.length; i++) items.push([ps.t[i], ps.v[i]]);
    }
    items.sort((a, b) => a[0] - b[0]);
    const s = new Series();
    for (const [t, v] of items) s.add(t, v);
    out.set(c, s);
  }
  return out;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

const MOD_ORDER: Record<string, string> = { "2": "QPSK", "4": "16QAM", "6": "64QAM", "8": "256QAM", "10": "1024QAM" };
const BW_MHZ: Record<string, string> = { "0": "1.4 MHz", "1": "3 MHz", "2": "5 MHz", "3": "10 MHz", "4": "15 MHz", "5": "20 MHz" };

function fmtMod(s: string | null): string | null {
  if (s == null) return null;
  if (/^\d+$/.test(s)) return MOD_ORDER[s] ?? `order ${s}`;
  const m = s.match(/(\d+)\s*qam/i) || s.match(/qam\s*(\d+)/i);
  if (m) return `${m[1]}QAM`;
  if (/qpsk/i.test(s)) return "QPSK";
  return s;
}
function bandNum(v: DV | null): number | null {
  if (!v) return null;
  if (v.k !== "s") return v.n;
  const m = v.s.match(/\d+/);
  return m ? Number(m[0]) : null;
}
function fmtBw(s: string | null): string | null {
  if (s == null) return null;
  if (/^\d+$/.test(s)) return BW_MHZ[s] ?? `code ${s}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*MHz/i) || s.match(/MHz\s*(\d+(?:\.\d+)?)/i);
  return m ? `${m[1]} MHz` : s;
}
function fmtTm(s: string | null): string | null {
  if (s == null) return null;
  if (/^\d+$/.test(s)) return `TM${s}`;
  const m = s.match(/(\d+)/);
  return m && /transmission/i.test(s) ? `TM${m[1]}` : s;
}
function fmtRank(s: string | null): string | null {
  if (s == null) return null;
  const m = s.match(/\d+/);
  return m ? `Rank ${m[0]}` : s;
}
function bandList(bands: BandInfo[], nr: boolean): string | null {
  if (!bands.length) return null;
  const pre = nr ? "n" : "B";
  return bands.map((b) => `${pre}${b.band}${b.freqMHz ? ` (${b.freqMHz} MHz)` : ""}`).join(", ");
}
function duplexList(bands: BandInfo[]): string | null {
  const ds = [...new Set(bands.map((b) => b.duplex).filter(Boolean))];
  return ds.length ? ds.join(", ") : null;
}
