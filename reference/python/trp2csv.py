#!/usr/bin/env python3
import argparse
import bisect
import csv
import math
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib
from datetime import datetime, timezone

CDF = "trp/providers/sp1/cdf/"
SERVICES = "trp/providers/sp1/services/services.xml"
EVENT = object()        

RADIO = {
    "technology": (["Radio.Common.MultiRatConnectivityMode"], "mode", False),
    "operator": (["Radio.ServingSystem.NetworkOperator"], "mode", False),
    "mcc":      (["Radio.ServingSystem.Mcc"], "mode", False),
    "mnc":      (["Radio.ServingSystem.Mnc"], "mode", False),
    "tac":      (["Radio.Lte.ServingSystem.Tac"], "mode", False),
    "cell_id":  (["Radio.Lte.ServingCell[8].CellIdentity.Complete"], "mode", False),   
    "enb_id":   (["Radio.Lte.ServingCell[8].CellIdentity.eNodeB"], "mode", False),
    "local_cell_id": (["Radio.Lte.ServingCell[8].CellIdentity.Cell"], "mode", False),
    "cell_name": (["Radio.Lte.ServingCell[8].CellName"], "mode", False),          
    "rsrp":    (["Radio.Lte.ServingCell[8].Rsrp"], "mean", True),
    "rsrq":     (["Radio.Lte.ServingCell[8].Rsrq"], "mean", True),
    "sinr":     (["Radio.Lte.ServingCell[8].RsSinr"], "mean", True),
    "earfcn":   (["Radio.Lte.ServingCell[8].Downlink.Earfcn"], "mode", False),
    "pci":      (["Radio.Lte.ServingCell[8].Pci"], "mode", False),
    "band":     (["Radio.Lte.ServingCell[8].Band"], "mode", False),
    "nr_rsrp":  (["Radio.Nr.ServingCell[16].SsRsrp"], "mean", True),
    "nr_rsrq":  (["Radio.Nr.ServingCell[16].SsRsrq"], "mean", True),
    "nr_sinr":  (["Radio.Nr.ServingCell[16].SsSinr"], "mean", True),
    "nr_arfcn": (["Radio.Nr.ServingCell[16].Downlink.NrArfcn"], "mode", False),
    "nr_pci":   (["Radio.Nr.ServingCell[16].Pci"], "mode", False),
    "nr_band":  (["Radio.Nr.ServingCell[16].Band"], "mode", False),
    "lat":      (["Location.Latitude"], "mean", False),
    "lon":      (["Location.Longitude"], "mean", False),
    "speed":    (["Location.Speed"], "mean", False),
}
DATA = {
    "dl_kbps":  (["Data.ApplicationLayer.Downlink.Throughput", "Data.Http.Download.Throughput",
                  "Data.Ftp.Download.Throughput"], "mean", False),
    "ul_kbps":  (["Data.ApplicationLayer.Uplink.Throughput", "Data.Http.Upload.Throughput",
                  "Data.Ftp.Upload.Throughput"], "mean", False),
}
# Voice IE names are resolved through the enum tables they use, which every
# .trp ships in lookuptables.cdf (CallState, CallEndCause, SpeechCodec, ...).
VOICE = {
    "call_state":     (["table:CallState"], "mode", False),
    "call_direction": (["table:CallDirection"], "mode", False),
    "call_domain":    (["table:CallDomain"], "mode", False),
    "call_end_type":  (["table:CallEndType"], "last", False),
    "call_end_cause": (["table:CallEndCause"], "last", False),
    "call_dropped":   (["table:CallDroppedType"], "last", False),
    "call_blocked":   (["table:CallBlockedType"], "last", False),
    "codec":          (["table:SpeechCodec", "table:AudioCodecType"], "mode", False),
    "codec_rate":     (["table:EvsCodecBitrate", "table:AmrCodecBitrate",
                        "table:SpeechCodecMainRateValue"], "mode", False),
    "mos":            ([r"re:(?i)polqa.*(mos|score)", r"re:(?i)(^|\.)mos$"], "mean", False),
}
EXTRA = {
    "rssi":     (["Radio.Lte.ServingCell[8].Rssi"], "mean", True),
    "bw":       (["Radio.Lte.ServingCell[8].Downlink.Bandwidth"], "mode", False),
    "alt":      (["Location.Altitude"], "mean", False),
    "mode":     RADIO["technology"],
}
ALIASES = {**RADIO, **DATA, **VOICE, **EXTRA}
AUTO = list(RADIO) + list(DATA) + list(VOICE)
AGGS = ("mean", "mode", "min", "max", "last")

# Never pick these when resolving table/regex selectors.
SKIP_IE = re.compile(r"^(Statistics|ControlFunction|SysInfo)\.|Properties|Support")
# Events left out of the events column unless --events all.
NOISY_EVENTS = re.compile(
    r"^(Message\.|Radio\.Common\.Layer3MessageEvent)|Rach\.(Preamble|Response|UeIdentification"
    r"|ContentionResolution)|^Data\.(First|Tcp|CheckNetwork)|Method[AB]Event$|SessionInformation")


def varint(b, p):
    r = s = 0
    while True:
        c = b[p]
        p += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, p


def fields(b):
    p, out = 0, []
    while p < len(b):
        key, p = varint(b, p)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, p = varint(b, p)
        elif wt == 1:
            v, p = b[p:p + 8], p + 8
        elif wt == 2:
            n, p = varint(b, p)
            v, p = b[p:p + n], p + n
        elif wt == 5:
            v, p = b[p:p + 4], p + 4
        else:
            raise ValueError(f"unsupported wire type {wt}")
        out.append((f, wt, v))
    return out


def records(b):
    p = 0
    while p < len(b):
        n, p = varint(b, p)
        yield b[p:p + n]
        p += n


def decode_value(vf):
    """Value of one (id, value) entry: EVENT for events, None when cleared."""
    for f, wt, v in vf:
        if f == 1:
            continue
        if f == 6:                              
            return (v >> 1) ^ -(v & 1)
        if f in (5, 7, 8, 9):                   
            return v
        if f == 10:
            return struct.unpack("<f", v)[0]
        if f == 11:
            return struct.unpack("<d", v)[0]
        if f == 12:
            return v.decode("utf-8", "replace")
        if f == 15:
            return EVENT
        return None
    return None



def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _text(el):
    """Readable text of a services.xml <Value>: enum label, content or plain text."""
    for child in el:
        if _local(child.tag) in ("Value", "Content", "Time", "Guid"):
            return (child.text or "").strip()
    return (el.text or "").strip()


def _props(parent):
    out = {}
    for p in parent.iter():
        if _local(p.tag) != "Property":
            continue
        kids = {_local(c.tag): c for c in p}
        if "Name" in kids and "Value" in kids:
            out[kids["Name"].text] = _text(kids["Value"])
    return out


def iso_duration(s):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?", s or "")
    if not m or not any(m.groups()):
        return s
    d, h, mi, sec = (float(x) if x else 0 for x in m.groups())
    return round(d * 86400 + h * 3600 + mi * 60 + sec, 3)


def parse_time(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


class Trp:
    def __init__(self, path):
        self.path = path
        self.name = path.replace("\\", "/").rsplit("/", 1)[-1]
        self.zip = zipfile.ZipFile(path)
        self.decl = {}        # name -> (id, lookup table name or None)
        for r in records(self._part("declarations.cdf")):
            d = {f: v for f, _, v in fields(r)}
            info = {f: v for f, _, v in fields(d[5])} if 5 in d else {}
            table = info.get(6)
            self.decl[d[1].decode()] = (d.get(2, 0), table.decode() if table else None)
        self.by_id = {i: n for n, (i, _) in self.decl.items()}
        self.starts = sorted(self.by_id)
        self.tables = {}      # table name -> {code: label}
        for r in records(self._part("lookuptables.cdf")):
            f = fields(r)
            entries = {}
            for _, _, v in f[1:]:
                e = {a: x for a, _, x in fields(v)}
                entries[e.get(2, 0)] = e[1].decode()
            self.tables[f[0][2].decode()] = entries

    def _part(self, name):
        raw = self.zip.read(CDF + name)
        if raw[:8] != b"\0" * 8:
            raise ValueError(f"{self.path}: unexpected header in {name}")
        return zlib.decompress(raw[8:])

    def ie_of(self, i):
        """(base IE name, element index) for a data id."""
        k = bisect.bisect_right(self.starts, i) - 1
        return (self.by_id[self.starts[k]], i - self.starts[k]) if k >= 0 else (None, 0)

    def resolve(self, selectors):
        """First declared IE matching the selectors, or None."""
        for sel in selectors:
            if sel.startswith("table:"):
                hits = [n for n, (_, t) in self.decl.items() if t == sel[6:]]
            elif sel.startswith("re:"):
                rx = re.compile(sel[3:])
                hits = [n for n in self.decl if rx.search(n)]
            else:
                hits = [sel] if sel in self.decl else []
            hits = [n for n in hits if sel == n or not SKIP_IE.search(n)]
            if hits:   # prefer native calls over OTT apps, then scalars, then short names
                return min(hits, key=lambda n: ("Ott" in n, "[" in n, len(n), n))
        return None

    def updates(self):
        """Yield (unix_time, id, value) for every logged update and event."""
        for r in records(self._part("data.cdf")):
            ts, vals = None, []
            for f, _, v in fields(r):
                if f == 1:
                    t = {a: x for a, _, x in fields(v)}
                    ts = t.get(1, 0) + t.get(2, 0) / 1e9
                elif f == 3:
                    vf = fields(v)
                    vals.append((next((x for a, _, x in vf if a == 1), 0), decode_value(vf)))
            for i, val in vals:
                yield ts, i, val

    def sessions(self):
        """Script activities from services.xml: list of dicts with start/stop."""
        try:
            root = ET.fromstring(self.zip.read(SERVICES))
        except KeyError:
            return []
        by_id = {}
        for info in root.iter():
            if _local(info.tag) != "ServiceInformation":
                continue
            sect = {_local(c.tag): c for c in info}
            props = _props(sect["Properties"]) if "Properties" in sect else {}
            sid = props.get("ServiceSessionIdentity")
            if sid is None:
                continue
            s = by_id.setdefault(sid, {"session": sid, "summary": {}})
            s["service"] = props.get("Name") or props.get("Identity")
            s["service_type"] = props.get("Identity")
            when = parse_time(props["UtcTime"]) if props.get("UtcTime") else None
            if props.get("ServiceAction") == "Start":
                s["start"] = when
                s["label"] = _props(sect["Settings"]).get("ExecuterLabel", "") if "Settings" in sect else ""
            elif props.get("ServiceAction") == "Stop":
                s["stop"] = when
            if "ServiceExecutionSummary" in sect:
                for k, v in _props(sect["ServiceExecutionSummary"]).items():
                    if k == "ServiceIdentity":
                        continue
                    s["summary"][k] = iso_duration(v) if v.startswith("P") else v
        return sorted((s for s in by_id.values() if s.get("start")), key=lambda s: s["start"])


# ------------------------------------------------------------- columns -----

class Column:
    def __init__(self, spec, auto=False):
        spec, _, agg = spec.partition(":")
        name, _, idx = spec.partition("@")
        self.header = spec.replace("@", "_c")
        self.selectors, self.agg, self.is_db = ALIASES.get(name, ([name], None, False))
        self.index = int(idx) if idx else 0
        self.auto = auto
        if agg:
            if agg not in AGGS:
                sys.exit(f"unknown aggregation '{agg}' (use one of {', '.join(AGGS)})")
            self.agg = agg


class Series:
    """A step function: value at time t holds until the next update."""
    def __init__(self):
        self.t, self.v = [], []

    def add(self, t, v):
        self.t.append(t)
        self.v.append(v)

    def window(self, t0, t1):
        k = bisect.bisect_right(self.t, t0)
        held = self.v[k - 1] if k else None
        t, segs = t0, []
        while k < len(self.t) and self.t[k] < t1:
            segs.append((self.t[k] - t, held))
            t, held = self.t[k], self.v[k]
            k += 1
        segs.append((t1 - t, held))
        return segs


def aggregate(segments, agg, is_db, linear_db):
    """segments: [(duration, value)] held within one window."""
    segs = [(d, v) for d, v in segments if v is not None]
    if not segs:
        return None
    numeric = all(isinstance(v, (int, float)) and not isinstance(v, bool) for _, v in segs)
    agg = agg or ("mean" if numeric and any(isinstance(v, float) for _, v in segs) else "mode")
    if agg == "last":
        return segs[-1][1]
    if agg in ("min", "max") and numeric:
        return (min if agg == "min" else max)(v for _, v in segs)
    if agg != "mean" or not numeric:
        acc = {}
        for d, v in segs:
            acc[v] = acc.get(v, 0) + d
        return max(acc, key=acc.get)
    total = sum(d for d, _ in segs)
    if total == 0:                      # only instantaneous updates: plain mean
        segs, total = [(1, v) for _, v in segs], len(segs)
    if is_db and linear_db:
        return 10 * math.log10(sum(d * 10 ** (v / 10) for d, v in segs) / total)
    return sum(d * v for d, v in segs) / total


def summarize_events(evs):
    counts = {}
    for name in evs:
        counts[name] = counts.get(name, 0) + 1
    return ";".join(f"{n}x{c}" if c > 1 else n for n, c in counts.items())


def fmt(v):
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.6f}".rstrip("0").rstrip(".") if abs(v) < 1000 else f"{v:.1f}"
    return str(v)


def stamp(t):
    dt = datetime.fromtimestamp(t, timezone.utc)
    return dt.strftime("%H:%M:%S.") + f"{dt.microsecond // 1000:03d}"


# -------------------------------------------------------------------- main --

def process(trp, cols, event_filter):
    """Decode one file into column series, events and its time span."""
    targets = {}                                   # data id -> [(column, lookup table)]
    for c in cols:
        ie = trp.resolve(c.selectors)
        if ie is None:
            if not c.auto:
                print(f"warning: {c.header}: no matching IE in {trp.name}", file=sys.stderr)
            continue
        base, table = trp.decl[ie]
        targets.setdefault(base + c.index, []).append((c, trp.tables.get(table)))

    series = {c: Series() for c in cols}
    events, names, last_seen = [], {}, {}
    t_first = t_last = None
    for ts, i, v in trp.updates():
        t_first = ts if t_first is None else t_first
        t_last = ts
        if v is EVENT:
            if event_filter is not None:
                if i not in names:
                    ie, idx = trp.ie_of(i)
                    keep = ie and (event_filter == "all" or not NOISY_EVENTS.search(ie))
                    names[i] = re.sub(r"^Radio\.|Event$", "", ie) if keep else None
                # TEMS often logs the same event twice a few ms apart
                if names[i] and ts - last_seen.get(names[i], -1) > 0.05:
                    events.append((ts, names[i]))
                last_seen[names[i]] = ts
            continue
        for c, table in targets.get(i, ()):
            series[c].add(ts, table.get(v, v) if table and v is not None else v)
    return series, events, t_first, t_last


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help=".trp files (processed in time order)")
    ap.add_argument("-f", "--fields", default="auto",
                    help="'auto' (default) or comma-separated aliases / IE names. '@N' selects "
                         "array element N (e.g. 'rsrp@1' = serving cell index 1); ':agg' overrides "
                         "the aggregation (e.g. 'rsrp:max'); 'auto' may be combined with extra "
                         f"fields (e.g. 'auto,rssi'). Aliases: {', '.join(ALIASES)}")
    ap.add_argument("-i", "--interval", type=float, default=1.0, help="bucket size in seconds")
    ap.add_argument("-o", "--output", help="output CSV (default: stdout)")
    ap.add_argument("--sessions", metavar="CSV",
                    help="also write one row per script activity (download, call, ...); "
                         "defaults to <output>_sessions.csv when -o is given")
    ap.add_argument("--events", choices=("default", "all", "none"), default="default",
                    help="events column: notable events (default), every event, or none")
    ap.add_argument("--linear-db", action="store_true",
                    help="average dB fields (rsrp, rsrq, sinr, rssi, nr_*) in linear power")
    ap.add_argument("--keep-empty", action="store_true", help="keep buckets with no radio data")
    ap.add_argument("--list-fields", nargs="?", const="", metavar="REGEX",
                    help="list IEs present in the first file (with update counts) and exit")
    a = ap.parse_args()

    if a.list_fields is not None:
        trp, rx, counts = Trp(a.files[0]), re.compile(a.list_fields or ".", re.I), {}
        for _, i, v in trp.updates():
            ie, idx = trp.ie_of(i)
            key = f"{ie}  @{idx}" if idx else ie
            counts[key] = counts.get(key, 0) + 1
        for k in sorted(counts):
            if rx.search(k):
                print(f"{counts[k]:>8}  {k}")
        return

    specs = [s.strip() for s in a.fields.split(",") if s.strip()]
    cols = []
    for s in specs:
        cols += [Column(x, auto=True) for x in AUTO] if s == "auto" else [Column(s)]
    event_filter = None if a.events == "none" else a.events
    iv = a.interval

    rows, sess_rows = [], []
    for trp in sorted((Trp(p) for p in a.files), key=lambda t: t.path):
        series, events, t_first, t_last = process(trp, cols, event_filter)
        if t_first is None:
            continue
        ev_t = [t for t, _ in events]
        sessions = trp.sessions()

        def in_window(t0, t1):
            return [n for _, n in events[bisect.bisect_left(ev_t, t0):bisect.bisect_left(ev_t, t1)]]

        def values(t0, t1):
            return {c: aggregate(series[c].window(t0, t1), c.agg, c.is_db, a.linear_db) for c in cols}

        b = math.floor(t_first / iv) * iv
        while b <= t_last:
            e = min(b + iv, t_last)
            vals = values(b, e) if e > b else values(b, b + 1e-9)
            evs = in_window(b, b + iv)
            active = max(sessions, key=lambda s: min(b + iv, s.get("stop") or t_last) - max(b, s["start"]),
                         default=None)
            if active and min(b + iv, active.get("stop") or t_last) <= max(b, active["start"]):
                active = None
            if a.keep_empty or any(v is not None for v in vals.values()) or evs:
                rows.append({"time_utc": stamp(b), "file": trp.name,
                             "service": active["service"] if active else "",
                             "session": active["session"] if active else "",
                             **vals,
                             "cell_changes": sum(n == "Common.ServingCellChanged" for n in evs) or "",
                             "events": summarize_events(evs)})
            b += iv

        for s in sessions:
            t0, t1 = s["start"], s.get("stop") or t_last
            evs = in_window(t0, t1)
            sess_rows.append({"file": trp.name, "session": s["session"], "service": s["service"],
                              "label": s.get("label", ""), "start_utc": stamp(t0),
                              "stop_utc": stamp(s["stop"]) if s.get("stop") else "",
                              "duration_s": round(t1 - t0, 3),
                              **{f"result_{k}": v for k, v in s["summary"].items()},
                              **values(t0, t1),
                              "cell_changes": sum(n == "Common.ServingCellChanged" for n in evs),
                              "events": summarize_events(evs)})

    # Auto columns that never received a value are dropped.
    keep = [c for c in cols if not c.auto or any(r[c] is not None for r in rows)]
    out = open(a.output, "w", newline="") if a.output else sys.stdout
    w = csv.writer(out)
    meta = ["time_utc", "file", "service", "session"]
    tail = ["cell_changes"] + (["events"] if event_filter else [])
    w.writerow(meta + [c.header for c in keep] + tail)
    for r in rows:
        w.writerow([r[k] for k in meta] + [fmt(r[c]) for c in keep] + [r[k] for k in tail])
    if a.output:
        out.close()

    sess_path = a.sessions or (re.sub(r"(\.csv)?$", "_sessions.csv", a.output, count=1) if a.output else None)
    if sess_path and sess_rows:
        results = list(dict.fromkeys(k for r in sess_rows for k in r if isinstance(k, str) and k.startswith("result_")))
        head = ["file", "session", "service", "label", "start_utc", "stop_utc", "duration_s"] + results
        with open(sess_path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(head + [c.header for c in keep] + tail)
            for r in sess_rows:
                w.writerow([r.get(k, "") for k in head] + [fmt(r[c]) for c in keep] + [r[k] for k in tail])
        print(f"{len(rows)} rows -> {a.output or 'stdout'}; {len(sess_rows)} sessions -> {sess_path}",
              file=sys.stderr)


if __name__ == "__main__":
    main()
