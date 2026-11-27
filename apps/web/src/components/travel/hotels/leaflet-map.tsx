"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = { id: string; lat: number; lon: number; label: string; title: string; demo?: boolean };

const pinHtml = (p: MapPin, active: boolean) =>
  `<span class="hm-pin${active ? " hm-pin--active" : ""}" data-pin="${p.id}">${p.label.replace(/[<>&]/g, "")}${p.demo ? '<span class="hm-pin-demo" aria-hidden>demo</span>' : ""}</span>`;

/**
 * Leaflet + OpenStreetMap tiles (with attribution). Price pins are DivIcons (no image assets).
 * Hovering a pin highlights the matching card and vice versa via `activeId` / `onHover`.
 */
export default function LeafletMap({
  pins,
  center,
  activeId,
  onHover,
  onSelect,
  onBoundsChange,
  zoom = 13,
  className,
  extra,
}: {
  pins: MapPin[];
  center: { lat: number; lng: number } | null;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  /** Called after the user pans/zooms (not on programmatic fits). bbox = minLng,minLat,maxLng,maxLat */
  onBoundsChange?: (bbox: string) => void;
  zoom?: number;
  className?: string;
  /** Secondary markers (e.g. airports nearby) rendered as small dots. */
  extra?: Array<{ lat: number; lon: number; title: string }>;
}) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<L.Map | null>(null);
  const markers = React.useRef(new Map<string, L.Marker>());
  const programmatic = React.useRef(false);
  const cb = React.useRef({ onHover, onSelect, onBoundsChange });
  cb.current = { onHover, onSelect, onBoundsChange };

  React.useEffect(() => {
    if (!el.current || map.current) return;
    const markerSet = markers.current;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on("moveend", () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const b = m.getBounds();
      cb.current.onBoundsChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(","));
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      markerSet.clear();
    };
  }, []);

  // Sync markers with pins and fit the view when the pin set changes.
  const pinKey = pins.map((p) => p.id + p.label).join("|");
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current.values()) mk.remove();
    markers.current.clear();
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "hm-pin-wrap", html: pinHtml(p, false), iconSize: undefined }), title: p.title, riseOnHover: true, keyboard: true })
        .on("mouseover", () => cb.current.onHover?.(p.id))
        .on("mouseout", () => cb.current.onHover?.(null))
        .on("click", () => cb.current.onSelect?.(p.id))
        .addTo(m);
      markers.current.set(p.id, mk);
    }
    for (const x of extra ?? []) L.circleMarker([x.lat, x.lon], { radius: 6, color: "#1f2937", weight: 2, fillColor: "#fff", fillOpacity: 1 }).bindTooltip(x.title).addTo(m);
    programmatic.current = true;
    if (pins.length > 1) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])).pad(0.15), { maxZoom: 15 });
    else if (pins[0]) m.setView([pins[0].lat, pins[0].lon], zoom);
    else if (center) m.setView([center.lat, center.lng], 12);
    else m.setView([20, 0], 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  // Highlight the active pin.
  React.useEffect(() => {
    for (const [id, mk] of markers.current) {
      const p = pins.find((x) => x.id === id);
      if (!p) continue;
      mk.setIcon(L.divIcon({ className: "hm-pin-wrap", html: pinHtml(p, id === activeId), iconSize: undefined }));
      mk.setZIndexOffset(id === activeId ? 1000 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, pinKey]);

  return (
    <>
      <div ref={el} className={className} role="region" aria-label="Map of properties" data-testid="hotel-map" />
      <style>{`
        .hm-pin-wrap{background:none;border:0}
        .hm-pin{position:relative;display:inline-flex;align-items:center;gap:3px;transform:translate(-50%,-100%);white-space:nowrap;padding:3px 8px;border-radius:9999px;background:var(--color-hotels,#B4122B);color:#fff;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff;cursor:pointer}
        .hm-pin::after{content:"";position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);border:5px solid transparent;border-top-color:#fff}
        .hm-pin--active{background:#1f2937;transform:translate(-50%,-100%) scale(1.15)}
        .hm-pin-demo{font-weight:600;font-size:9px;opacity:.85;text-transform:uppercase}
      `}</style>
    </>
  );
}
