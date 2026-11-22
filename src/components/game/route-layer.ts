import L from "leaflet";
import { splitRouteAtPosition, waypointLabel, type RouteWaypoint } from "@/lib/route-waypoints";

function color(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/** Draws a SimBrief route with ICAO diamond fixes; with a position, flown part is solid and planned part dashed. */
export function drawRoute(layer: L.LayerGroup, points: RouteWaypoint[], pos?: { lat: number; lon: number } | null) {
  const primary = color("--primary"), amber = color("--amber");
  if (pos) {
    const { flown, planned } = splitRouteAtPosition(points, pos);
    L.polyline(flown, { color: primary, weight: 3, opacity: 0.9 }).addTo(layer);
    L.polyline(planned, { color: primary, weight: 2.5, opacity: 0.85, dashArray: "6 6" }).addTo(layer);
  } else {
    L.polyline(points.map(p => [p.lat, p.lon] as [number, number]), { color: primary, weight: 3, opacity: 0.9 }).addTo(layer);
  }
  points.forEach((w, i) => {
    const edge = i === 0 || i === points.length - 1;
    const special = w.type === "toc" || w.type === "tod" || w.ident === "TOC" || w.ident === "TOD";
    const size = edge ? 12 : 9;
    L.marker([w.lat, w.lon], {
      icon: L.divIcon({
        className: "",
        html: `<span style="display:block;width:${size}px;height:${size}px;transform:rotate(45deg);border:2px solid ${special ? amber : primary};background:${edge ? primary : "transparent"}"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).bindTooltip(() => { const s = document.createElement("span"); s.className = "readout"; s.textContent = waypointLabel(w); return s; }).addTo(layer);
  });
}
