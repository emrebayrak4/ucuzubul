"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type StorePin = { id: string; lat: number; lng: number; label: string; title: string; kind: "chain" | "local" | "sponsored" };

const esc = (s: string) => s.replace(/[<>&"]/g, "");

/**
 * Simple store map: Leaflet + OpenStreetMap tiles (attribution shown). Shopper ZIP centroid = blue dot,
 * stores = small labeled pins. Coordinates are approximate (ZIP centroids) unless the source gave a precise location.
 */
export default function StoreMap({ pins, origin, className }: { pins: StorePin[]; origin: { lat: number; lng: number; zip: string } | null; className?: string }) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<L.Map | null>(null);
  const layer = React.useRef<L.LayerGroup | null>(null);

  React.useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  const key = pins.map((p) => p.id).join("|") + (origin?.zip ?? "");
  React.useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: [number, number][] = [];
    if (origin) {
      L.circleMarker([origin.lat, origin.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#0029F8", fillOpacity: 1 }).bindTooltip(`Your ZIP ${origin.zip} (approx.)`).addTo(g);
      pts.push([origin.lat, origin.lng]);
    }
    // Pins sharing a ZIP centroid are fanned out slightly so each stays clickable.
    const seen = new Map<string, number>();
    for (const p of pins) {
      const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      const angle = n * 2.1;
      const lat = p.lat + (n ? Math.sin(angle) * 0.0018 * Math.ceil(n / 3) : 0);
      const lng = p.lng + (n ? Math.cos(angle) * 0.0024 * Math.ceil(n / 3) : 0);
      const html = `<span class="sm-pin sm-pin--${p.kind}">${esc(p.label)}</span>`;
      L.marker([lat, lng], { icon: L.divIcon({ className: "sm-pin-wrap", html, iconSize: undefined }), title: p.title, keyboard: true }).addTo(g);
      pts.push([lat, lng]);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
    else if (pts[0]) m.setView(pts[0], 13);
    else m.setView([39.5, -98.35], 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      <div ref={el} className={className} role="region" aria-label="Map of nearby stores" data-testid="nearby-map" />
      <style>{`
        .sm-pin-wrap{background:none;border:0}
        .sm-pin{display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;padding:2px 7px;border-radius:9999px;color:#fff;font:700 11px/1.3 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff}
        .sm-pin--chain{background:#1f2937}
        .sm-pin--local{background:#2F855A}
        .sm-pin--sponsored{background:#92400E}
      `}</style>
    </>
  );
}
