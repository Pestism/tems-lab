"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Dashboard } from "@/parser/extract";
import { rsrpColor, RSRP_LEGEND, num } from "@/lib/format";

type Handover = Dashboard["handovers"][number];

function Fit({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export default function CoverageMap({ d }: { d: Dashboard }) {
  const pts = d.route;
  const [sel, setSel] = useState<number | null>(null);
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const bounds: LatLngBoundsExpression = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  const line = pts.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <div className="space-y-3">
      <div className="h-[420px] overflow-hidden rounded-xl border border-line">
        <MapContainer bounds={bounds} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={line} pathOptions={{ color: "#8b949e", weight: 2, opacity: 0.5 }} />
          {pts.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lon]}
              radius={5}
              pathOptions={{ color: rsrpColor(p.rsrp), fillColor: rsrpColor(p.rsrp), fillOpacity: 0.9, weight: 1 }}
            >
              <Tooltip>{`RSRP ${num(p.rsrp, 1, " dBm")}`}</Tooltip>
            </CircleMarker>
          ))}
          {d.handovers.map((h, i) =>
            h.lat != null && h.lon != null ? (
              <CircleMarker
                key={`ho-${i}`}
                center={[h.lat, h.lon]}
                radius={8}
                pathOptions={{ color: "#111827", fillColor: "#ffffff", fillOpacity: 0.9, weight: 2 }}
                eventHandlers={{ click: () => setSel(i) }}
              >
                <Tooltip>{`Handover · ${h.labels.join(", ")} · ${h.utc}`}</Tooltip>
              </CircleMarker>
            ) : null
          )}
          <Fit bounds={bounds} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>RSRP:</span>
        {RSRP_LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        {d.handovers.some((h) => h.lat != null) && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-black bg-white" />
            handover
          </span>
        )}
      </div>
      <p className="text-xs text-muted">
        Each dot is a GPS sample.{d.handovers.length > 0 ? " Click on the handovers to see their details." : ""}
      </p>

      {sel != null && d.handovers[sel] && (
        <HandoverModal h={d.handovers[sel]} index={sel} onClose={() => setSel(null)} />
      )}
    </div>
  );
}

function HandoverModal({ h, index, onClose }: { h: Handover; index: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );

  const change = (from: number | null, to: number | null, pre = ""): string | null => {
    if (from == null && to == null) return null;
    if (from == null || to == null || from === to) return `${pre}${to ?? from}`;
    return `${pre}${from} → ${pre}${to}`;
  };
  const ltePci = change(h.pciFrom, h.pciTo);
  const lteBand = change(h.bandFrom, h.bandTo, "B");
  const nrPci = change(h.nrPciFrom, h.nrPciTo);
  const nrBand = change(h.nrBandFrom, h.nrBandTo, "n");

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line p-4 sm:p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Handover {index + 1}</div>
            <div className="font-semibold">{h.utc}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-line px-2 py-1 text-sm text-muted hover:border-brand/60 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="p-4 text-sm sm:p-5">
          <Row k="Time (UTC)" v={h.utc} />
          <Row k="At" v={`${num(h.t, 1)} s into the walk`} />
          <Row k="Event(s)" v={h.labels.join(", ")} />
          {ltePci && <Row k="LTE cell (PCI)" v={ltePci} />}
          {lteBand && <Row k="LTE band" v={lteBand} />}
          {nrPci && <Row k="NR cell (PCI)" v={nrPci} />}
          {nrBand && <Row k="NR band" v={nrBand} />}
          <Row k="Position" v={h.lat != null && h.lon != null ? `${h.lat.toFixed(5)}, ${h.lon.toFixed(5)}` : "–"} />
          <Row k="RSRP here" v={num(h.rsrp, 1, " dBm")} />
        </div>
      </div>
    </div>
  );
}
