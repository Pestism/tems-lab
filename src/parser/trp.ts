import { unzipSync, unzlibSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import {
  EVENT,
  decodeValue,
  fields,
  records,
  type DV,
  type Decoded,
} from "./protobuf";
import { Series, aggregate, summarizeEvents, type Agg } from "./series";
import { csvRow, pyFloatStr } from "./csv";

const CDF = "trp/providers/sp1/cdf/";
const SERVICES = "trp/providers/sp1/services/services.xml";

type AliasDef = [string[], Agg | null, boolean];

const RADIO: Record<string, AliasDef> = {
  technology: [["Radio.Common.MultiRatConnectivityMode"], "mode", false],
  operator: [["Radio.ServingSystem.NetworkOperator"], "mode", false],
  mcc: [["Radio.ServingSystem.Mcc"], "mode", false],
  mnc: [["Radio.ServingSystem.Mnc"], "mode", false],
  tac: [["Radio.Lte.ServingSystem.Tac"], "mode", false],
  cell_id: [["Radio.Lte.ServingCell[8].CellIdentity.Complete"], "mode", false],
  enb_id: [["Radio.Lte.ServingCell[8].CellIdentity.eNodeB"], "mode", false],
  local_cell_id: [["Radio.Lte.ServingCell[8].CellIdentity.Cell"], "mode", false],
  cell_name: [["Radio.Lte.ServingCell[8].CellName"], "mode", false],
  rsrp: [["Radio.Lte.ServingCell[8].Rsrp"], "mean", true],
  rsrq: [["Radio.Lte.ServingCell[8].Rsrq"], "mean", true],
  sinr: [["Radio.Lte.ServingCell[8].RsSinr"], "mean", true],
  earfcn: [["Radio.Lte.ServingCell[8].Downlink.Earfcn"], "mode", false],
  pci: [["Radio.Lte.ServingCell[8].Pci"], "mode", false],
  band: [["Radio.Lte.ServingCell[8].Band"], "mode", false],
  nr_rsrp: [["Radio.Nr.ServingCell[16].SsRsrp"], "mean", true],
  nr_rsrq: [["Radio.Nr.ServingCell[16].SsRsrq"], "mean", true],
  nr_sinr: [["Radio.Nr.ServingCell[16].SsSinr"], "mean", true],
  nr_arfcn: [["Radio.Nr.ServingCell[16].Downlink.NrArfcn"], "mode", false],
  nr_pci: [["Radio.Nr.ServingCell[16].Pci"], "mode", false],
  nr_band: [["Radio.Nr.ServingCell[16].Band"], "mode", false],
  lat: [["Location.Latitude"], "mean", false],
  lon: [["Location.Longitude"], "mean", false],
  speed: [["Location.Speed"], "mean", false],
};
const DATA: Record<string, AliasDef> = {
  dl_kbps: [
    [
      "Data.ApplicationLayer.Downlink.Throughput",
      "Data.Http.Download.Throughput",
      "Data.Ftp.Download.Throughput",
    ],
    "mean",
    false,
  ],
  ul_kbps: [
    [
      "Data.ApplicationLayer.Uplink.Throughput",
      "Data.Http.Upload.Throughput",
      "Data.Ftp.Upload.Throughput",
    ],
    "mean",
    false,
  ],
};
const VOICE: Record<string, AliasDef> = {
  call_state: [["table:CallState"], "mode", false],
  call_direction: [["table:CallDirection"], "mode", false],
  call_domain: [["table:CallDomain"], "mode", false],
  call_end_type: [["table:CallEndType"], "last", false],
  call_end_cause: [["table:CallEndCause"], "last", false],
  call_dropped: [["table:CallDroppedType"], "last", false],
  call_blocked: [["table:CallBlockedType"], "last", false],
  codec: [["table:SpeechCodec", "table:AudioCodecType"], "mode", false],
  codec_rate: [
    ["table:EvsCodecBitrate", "table:AmrCodecBitrate", "table:SpeechCodecMainRateValue"],
    "mode",
    false,
  ],
  mos: [["re:(?i)polqa.*(mos|score)", "re:(?i)(^|\\.)mos$"], "mean", false],
};
const EXTRA: Record<string, AliasDef> = {
  rssi: [["Radio.Lte.ServingCell[8].Rssi"], "mean", true],
  bw: [["Radio.Lte.ServingCell[8].Downlink.Bandwidth"], "mode", false],
  alt: [["Location.Altitude"], "mean", false],
  mode: RADIO.technology,
};
export const ALIASES: Record<string, AliasDef> = { ...RADIO, ...DATA, ...VOICE, ...EXTRA };
export const AUTO = [...Object.keys(RADIO), ...Object.keys(DATA), ...Object.keys(VOICE)];

const SKIP_IE = /^(Statistics|ControlFunction|SysInfo)\.|Properties|Support/;
const NOISY_EVENTS =
  /^(Message\.|Radio\.Common\.Layer3MessageEvent)|Rach\.(Preamble|Response|UeIdentification|ContentionResolution)|^Data\.(First|Tcp|CheckNetwork)|Method[AB]Event$|SessionInformation/;

function parseSelector(sel: string): RegExp | null {
  const m = /^\(\?i\)/.test(sel);
  return m ? new RegExp(sel.slice(4), "i") : new RegExp(sel);
}

export class Column {
  header: string;
  selectors: string[];
  agg: Agg | null;
  isDb: boolean;
  index: number;
  auto: boolean;

  constructor(spec: string, auto = false) {
    const [left, aggPart] = spec.split(":", 2).length > 1 ? splitOnce(spec, ":") : [spec, ""];
    const [name, idx] = left.includes("@") ? splitOnce(left, "@") : [left, ""];
    this.header = spec.replace("@", "_c");
    const def = ALIASES[name] ?? [[name], null, false];
    this.selectors = def[0];
    this.agg = def[1];
    this.isDb = def[2];
    this.index = idx ? parseInt(idx, 10) : 0;
    this.auto = auto;
    if (aggPart) this.agg = aggPart as Agg;
  }
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

const TD = new TextDecoder("utf-8");

type SessionT = {
  session: string;
  service?: string;
  service_type?: string;
  start?: number;
  stop?: number;
  label?: string;
  summary: Record<string, string | { dur: number }>;
};

function isoDuration(s: string): number | string {
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m || !m.slice(1).some((x) => x !== undefined)) return s;
  const [d, h, mi, sec] = m.slice(1).map((x) => (x ? parseFloat(x) : 0));
  return Math.round((d * 86400 + h * 3600 + mi * 60 + sec) * 1000) / 1000;
}

function parseTime(s: string): number {
  return Date.parse(s) / 1000;
}

const xml = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false, // the XML comes from an untrusted .trp: no entity expansion
});

function asArray<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of ["Value", "Content", "Time", "Guid"]) {
      if (k in o && typeof o[k] === "string") return (o[k] as string).trim();
    }
    if (typeof o["#text"] === "string") return (o["#text"] as string).trim();
  }
  return "";
}

function propsOf(container: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!container || typeof container !== "object") return out;
  const props = asArray((container as Record<string, unknown>).Property);
  for (const p of props) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = typeof o.Name === "string" ? o.Name : undefined;
    if (name !== undefined && "Value" in o) out[name] = textOf(o.Value);
  }
  return out;
}

export class Trp {
  name: string;
  private files: Record<string, Uint8Array>;
  decl = new Map<string, [number, string | null]>();
  byId = new Map<number, string>();
  starts: number[] = [];
  tables = new Map<string, Map<number, string>>();

  constructor(buf: Uint8Array, name = "log.trp") {
    this.name = name.replace(/\\/g, "/").split("/").pop()!;
    this.files = unzipSync(buf, {
      filter: (f) =>
        f.name === CDF + "declarations.cdf" ||
        f.name === CDF + "lookuptables.cdf" ||
        f.name === CDF + "data.cdf" ||
        f.name === SERVICES,
    });

    for (const r of records(this.part("declarations.cdf"))) {
      const d = new Map<number, number | Uint8Array>();
      for (const [f, , v] of fields(r)) d.set(f, v);
      const info = new Map<number, number | Uint8Array>();
      if (d.has(5)) for (const [f, , v] of fields(d.get(5) as Uint8Array)) info.set(f, v);
      const table = info.get(6) as Uint8Array | undefined;
      const nm = TD.decode(d.get(1) as Uint8Array);
      this.decl.set(nm, [(d.get(2) as number) ?? 0, table ? TD.decode(table) : null]);
    }
    for (const [nm, [id]] of this.decl) this.byId.set(id, nm);
    this.starts = [...this.byId.keys()].sort((a, b) => a - b);

    for (const r of records(this.part("lookuptables.cdf"))) {
      const f = fields(r);
      const entries = new Map<number, string>();
      for (let i = 1; i < f.length; i++) {
        const e = new Map<number, number | Uint8Array>();
        for (const [a, , x] of fields(f[i][2] as Uint8Array)) e.set(a, x);
        entries.set((e.get(2) as number) ?? 0, TD.decode(e.get(1) as Uint8Array));
      }
      this.tables.set(TD.decode(f[0][2] as Uint8Array), entries);
    }
  }

  private part(name: string): Uint8Array {
    const raw = this.files[CDF + name];
    if (!raw) throw new Error(`missing ${name}`);
    for (let i = 0; i < 8; i++) if (raw[i] !== 0) throw new Error(`bad header in ${name}`);
    return unzlibSync(raw.subarray(8));
  }

  ieOf(i: number): [string | null, number] {
    let lo = 0;
    let hi = this.starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= i) lo = mid + 1;
      else hi = mid;
    }
    const k = lo - 1;
    return k >= 0 ? [this.byId.get(this.starts[k])!, i - this.starts[k]] : [null, 0];
  }

  resolve(selectors: string[]): string | null {
    for (const sel of selectors) {
      let hits: string[];
      if (sel.startsWith("table:")) {
        const t = sel.slice(6);
        hits = [...this.decl].filter(([, [, tn]]) => tn === t).map(([n]) => n);
      } else if (sel.startsWith("re:")) {
        const rx = parseSelector(sel.slice(3));
        hits = rx ? [...this.decl.keys()].filter((n) => rx.test(n)) : [];
      } else {
        hits = this.decl.has(sel) ? [sel] : [];
      }
      hits = hits.filter((n) => sel === n || !SKIP_IE.test(n));
      if (hits.length) {
        hits.sort((a, b) => {
          const ka = [+a.includes("Ott"), +a.includes("["), a.length, a] as const;
          const kb = [+b.includes("Ott"), +b.includes("["), b.length, b] as const;
          for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
          return a < b ? -1 : a > b ? 1 : 0;
        });
        return hits[0];
      }
    }
    return null;
  }

  *updates(): Generator<[number, number, Decoded]> {
    for (const r of records(this.part("data.cdf"))) {
      let ts = 0;
      const vals: [number, Decoded][] = [];
      for (const [f, , v] of fields(r)) {
        if (f === 1) {
          const t = new Map<number, number | Uint8Array>();
          for (const [a, , x] of fields(v as Uint8Array)) t.set(a, x);
          ts = ((t.get(1) as number) ?? 0) + ((t.get(2) as number) ?? 0) / 1e9;
        } else if (f === 3) {
          const vf = fields(v as Uint8Array);
          let id = 0;
          for (const [a, , x] of vf) if (a === 1) { id = x as number; break; }
          vals.push([id, decodeValue(vf)]);
        }
      }
      for (const [i, val] of vals) yield [ts, i, val];
    }
  }

  sessions(): SessionT[] {
    const raw = this.files[SERVICES];
    if (!raw) return [];
    const doc = xml.parse(TD.decode(raw));
    const coll = doc?.ServiceInformationCollection?.ServiceInformations;
    const infos = asArray(coll?.ServiceInformation);
    const byId = new Map<string, SessionT>();
    for (const info of infos) {
      const props = propsOf(info.Properties);
      const sid = props.ServiceSessionIdentity;
      if (sid === undefined) continue;
      let s = byId.get(sid);
      if (!s) {
        s = { session: sid, summary: {} };
        byId.set(sid, s);
      }
      s.service = props.Name || props.Identity;
      s.service_type = props.Identity;
      const when = props.UtcTime ? parseTime(props.UtcTime) : undefined;
      if (props.ServiceAction === "Start") {
        s.start = when;
        s.label = info.Settings ? propsOf(info.Settings).ExecuterLabel ?? "" : "";
      } else if (props.ServiceAction === "Stop") {
        s.stop = when;
      }
      const summ = info.ServiceExecutionSummary?.Properties;
      if (summ) {
        for (const [k, v] of Object.entries(propsOf(summ))) {
          if (k === "ServiceIdentity") continue;
          s.summary[k] = v.startsWith("P") ? wrapDur(isoDuration(v)) : v;
        }
      }
    }
    return [...byId.values()]
      .filter((s) => s.start !== undefined)
      .sort((a, b) => a.start! - b.start!);
  }
}

function wrapDur(v: number | string): string | { dur: number } {
  return typeof v === "number" ? { dur: v } : v;
}

function mapValue(v: Decoded, table: Map<number, string> | undefined): DV | null {
  if (v === EVENT || v === null) return null;
  if (table && v.k === "i" && table.has(v.n)) return { k: "s", s: table.get(v.n)! };
  return v;
}

function stamp(t: number): string {
  const ms = Math.round((t - Math.floor(t)) * 1e6);
  const d = new Date(Math.floor(t) * 1000 + Math.floor(ms / 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(
    Math.floor(ms / 1000),
    3
  )}`;
}

function fmt(v: DV | null): string {
  if (v === null) return "";
  if (v.k === "s") return v.s;
  if (v.k === "f") {
    const a = Math.abs(v.n);
    if (a < 1000) return v.n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return v.n.toFixed(1);
  }
  return String(v.n);
}

export type ProcessResult = {
  series: Map<Column, Series>;
  events: [number, string][];
  tFirst: number | null;
  tLast: number | null;
};

export function process(
  trp: Trp,
  cols: Column[],
  eventFilter: "default" | "all" | null
): ProcessResult {
  const targets = new Map<number, [Column, Map<number, string> | undefined][]>();
  for (const c of cols) {
    const ie = trp.resolve(c.selectors);
    if (ie === null) continue;
    const [base, table] = trp.decl.get(ie)!;
    const key = base + c.index;
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key)!.push([c, table ? trp.tables.get(table) : undefined]);
  }

  const series = new Map<Column, Series>();
  for (const c of cols) series.set(c, new Series());
  const events: [number, string][] = [];
  const names = new Map<number, string | null>();
  const lastSeen = new Map<string, number>();
  let tFirst: number | null = null;
  let tLast: number | null = null;

  for (const [ts, i, v] of trp.updates()) {
    if (tFirst === null) tFirst = ts;
    tLast = ts;
    if (v === EVENT) {
      if (eventFilter !== null) {
        if (!names.has(i)) {
          const [ie] = trp.ieOf(i);
          const keep = ie && (eventFilter === "all" || !NOISY_EVENTS.test(ie));
          names.set(i, keep ? ie!.replace(/^Radio\.|Event$/g, "") : null);
        }
        const nm = names.get(i);
        if (nm) {
          if (ts - (lastSeen.get(nm) ?? -1) > 0.05) events.push([ts, nm]);
          lastSeen.set(nm, ts);
        }
      }
      continue;
    }
    const tg = targets.get(i);
    if (tg) for (const [c, table] of tg) series.get(c)!.add(ts, mapValue(v, table));
  }
  return { series, events, tFirst, tLast };
}

export type ToCsvOpts = {
  fields?: string;
  interval?: number;
  events?: "default" | "all" | "none";
  linearDb?: boolean;
  keepEmpty?: boolean;
};

export function toCsv(trps: Trp[], opts: ToCsvOpts = {}): { main: string; sessions: string } {
  const fieldSpec = opts.fields ?? "auto";
  const iv = opts.interval ?? 1;
  const eventFilter = opts.events === "none" ? null : opts.events ?? "default";
  const linearDb = !!opts.linearDb;
  const keepEmpty = !!opts.keepEmpty;

  const specs = fieldSpec.split(",").map((s) => s.trim()).filter(Boolean);
  const cols: Column[] = [];
  for (const s of specs) {
    if (s === "auto") for (const x of AUTO) cols.push(new Column(x, true));
    else cols.push(new Column(s));
  }

  type Row = {
    time_utc: string;
    file: string;
    service: string;
    session: string;
    vals: Map<Column, DV | null>;
    cell_changes: number;
    events: string;
  };
  type SRow = {
    file: string;
    session: string;
    service: string;
    label: string;
    start_utc: string;
    stop_utc: string;
    duration_s: number;
    summary: Record<string, string | { dur: number }>;
    vals: Map<Column, DV | null>;
    cell_changes: number;
    events: string;
  };
  const rows: Row[] = [];
  const srows: SRow[] = [];

  const sorted = [...trps];
  for (const trp of sorted) {
    const { series, events, tFirst, tLast } = process(trp, cols, eventFilter);
    if (tFirst === null || tLast === null) continue;
    const evT = events.map(([t]) => t);
    const sessions = trp.sessions();

    const inWindow = (t0: number, t1: number) =>
      events.slice(lowerBound(evT, t0), lowerBound(evT, t1)).map(([, n]) => n);
    const values = (t0: number, t1: number) => {
      const m = new Map<Column, DV | null>();
      for (const c of cols) m.set(c, aggregate(series.get(c)!.window(t0, t1), c.agg, c.isDb, linearDb));
      return m;
    };

    let b = Math.floor(tFirst / iv) * iv;
    while (b <= tLast) {
      const e = Math.min(b + iv, tLast);
      const vals = e > b ? values(b, e) : values(b, b + 1e-9);
      const evs = inWindow(b, b + iv);
      let active: SessionT | null = null;
      let bestOv = -Infinity;
      for (const s of sessions) {
        const ov = Math.min(b + iv, s.stop ?? tLast) - Math.max(b, s.start!);
        if (ov > bestOv) {
          bestOv = ov;
          active = s;
        }
      }
      if (active && Math.min(b + iv, active.stop ?? tLast) <= Math.max(b, active.start!)) active = null;
      const anyVal = [...vals.values()].some((v) => v !== null);
      if (keepEmpty || anyVal || evs.length) {
        rows.push({
          time_utc: stamp(b),
          file: trp.name,
          service: active ? active.service ?? "" : "",
          session: active ? active.session : "",
          vals,
          cell_changes: evs.filter((n) => n === "Common.ServingCellChanged").length,
          events: summarizeEvents(evs),
        });
      }
      b += iv;
    }

    for (const s of sessions) {
      const t0 = s.start!;
      const t1 = s.stop ?? tLast;
      const evs = inWindow(t0, t1);
      srows.push({
        file: trp.name,
        session: s.session,
        service: s.service ?? "",
        label: s.label ?? "",
        start_utc: stamp(t0),
        stop_utc: s.stop !== undefined ? stamp(s.stop) : "",
        duration_s: Math.round((t1 - t0) * 1000) / 1000,
        summary: s.summary,
        vals: values(t0, t1),
        cell_changes: evs.filter((n) => n === "Common.ServingCellChanged").length,
        events: summarizeEvents(evs),
      });
    }
  }

  const keep = cols.filter((c) => !c.auto || rows.some((r) => r.vals.get(c) !== null));
  const meta = ["time_utc", "file", "service", "session"];
  const tail = eventFilter ? ["cell_changes", "events"] : ["cell_changes"];

  let main = csvRow([...meta, ...keep.map((c) => c.header), ...tail]);
  for (const r of rows) {
    const cells = [
      r.time_utc,
      r.file,
      r.service,
      r.session,
      ...keep.map((c) => fmt(r.vals.get(c) ?? null)),
      r.cell_changes ? String(r.cell_changes) : "",
    ];
    if (eventFilter) cells.push(r.events);
    main += csvRow(cells);
  }

  let sessions = "";
  if (srows.length) {
    const results: string[] = [];
    for (const r of srows)
      for (const k of Object.keys(r.summary)) {
        const col = "result_" + k;
        if (!results.includes(col)) results.push(col);
      }
    const head = ["file", "session", "service", "label", "start_utc", "stop_utc", "duration_s"];
    sessions = csvRow([...head, ...results, ...keep.map((c) => c.header), ...tail]);
    for (const r of srows) {
      const cells = [
        r.file,
        r.session,
        r.service,
        r.label,
        r.start_utc,
        r.stop_utc,
        pyFloatStr(r.duration_s),
        ...results.map((rc) => {
          const v = r.summary[rc.slice(7)];
          if (v === undefined) return "";
          return typeof v === "object" ? pyFloatStr(v.dur) : v;
        }),
        ...keep.map((c) => fmt(r.vals.get(c) ?? null)),
        String(r.cell_changes),
      ];
      if (eventFilter) cells.push(r.events);
      sessions += csvRow(cells);
    }
  }

  return { main, sessions };
}

function lowerBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
