import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeArc } from "@/lib/dispatch-engine";
import type { MissionAirport } from "@/lib/mission-preview";

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export default function MissionPreviewMap({ origin, destination, ferry }: {
  origin: MissionAirport; destination: MissionAirport; ferry: MissionAirport | null;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { worldCopyJump: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 18 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(div.current);
    return () => { resize.disconnect(); m.remove(); map.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const primary = token("--primary"), amber = token("--amber"), fg = token("--foreground");
    const bounds = L.latLngBounds([]);
    const longitude = (lon: number) => origin.lon + ((lon - origin.lon + 540) % 360) - 180;
    const arc = (a: MissionAirport, b: MissionAirport, color: string, dashed: boolean) => {
      if (a.icao === b.icao) return;
      const geometry = routeArc(a, b).geometry;
      const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
      for (const line of lines) {
        const points: L.LatLngTuple[] = line.flatMap(p => {
          const lon = p[0], lat = p[1];
          if (lon === undefined || lat === undefined) return [];
          const point: L.LatLngTuple = [lat, longitude(lon)];
          bounds.extend(point);
          return [point];
        });
        L.polyline(points, { color, weight: dashed ? 2 : 3, ...(dashed ? { dashArray: "6 6" } : {}) }).addTo(g);
      }
    };
    arc(origin, destination, primary, false);
    if (ferry) arc(ferry, origin, amber, true);
    for (const { airport, label, color } of [
      { airport: origin, label: "Origin", color: primary },
      { airport: destination, label: "Destination", color: fg },
      ...(ferry && ferry.icao !== origin.icao ? [{ airport: ferry, label: "Aircraft · Ferry", color: amber }] : []),
    ]) {
      const position: L.LatLngTuple = [airport.lat, longitude(airport.lon)];
      bounds.extend(position);
      L.circleMarker(position, { radius: 6, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
        .bindTooltip(`${escape(label)} · <b>${escape(airport.icao)}</b>`)
        .bindPopup(`<b>${escape(airport.icao)}</b> · ${escape(airport.name)}<br/>${escape(label)}<br/>Runway: ${airport.longest_runway_ft === null ? "unavailable" : `${Math.round(airport.longest_runway_ft).toLocaleString()} ft`}`)
        .addTo(g);
    }
    m.fitBounds(bounds, { padding: [28, 28], maxZoom: 9 });
  }, [origin, destination, ferry]);
  return <div ref={div} aria-label="Mission route map" className="h-[240px] w-full border border-border" />;
}