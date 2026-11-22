import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeArc } from "@/lib/dispatch-engine";
import type { RouteWaypoint } from "@/lib/route-waypoints";
import { drawRoute } from "./route-layer";

export default function RoutePreviewMap({ points, mode }: { points: RouteWaypoint[]; mode: "route" | "direct" }) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { attributionControl: true, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 18 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(div.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g || points.length < 2) return;
    g.clearLayers();
    const a = points[0]!, b = points[points.length - 1]!;
    const muted = getComputedStyle(document.documentElement).getPropertyValue(mode === "direct" ? "--primary" : "--muted-foreground").trim();
    L.geoJSON(routeArc(a, b), { style: { color: muted, weight: mode === "direct" ? 3 : 1.5, opacity: mode === "direct" ? 0.9 : 0.6, dashArray: mode === "direct" ? undefined : "4 6" } }).addTo(g);
    if (mode === "route") drawRoute(g, points);
    else for (const p of [a, b]) L.circleMarker([p.lat, p.lon], { radius: 5, color: muted }).bindTooltip(p.ident).addTo(g);
    m.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number])), { padding: [40, 40] });
  }, [points, mode]);
  return <div ref={div} aria-label="Planned route map" className="h-[320px] w-full border border-border" />;
}
