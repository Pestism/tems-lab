"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Dashboard } from "@/parser/extract";
import { rsrpColor, RSRP_LEGEND, num } from "@/lib/format";

function Fit({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export default function CoverageMap({ d }: { d: Dashboard }) {
  const pts = d.route;
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
              >
                <Tooltip>{`Handover · ${h.label} · ${h.utc}`}</Tooltip>
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
        Each dot is a GPS sample 
      </p>
    </div>
  );
}
