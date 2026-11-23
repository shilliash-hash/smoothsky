import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeArc } from "@/lib/dispatch-engine";
import { dossierBases } from "@/lib/leaderboard-rules";
import type { PublicCompanyProfile } from "@/lib/leaderboard.functions";

export default function NetworkMiniMap({ profile }: { profile: PublicCompanyProfile }) {
  const div = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!div.current) return;
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const m = L.map(div.current, { attributionControl: false, zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12 }).addTo(m);
    const tp = m.getPane("tilePane"); if (tp) tp.style.filter = "invert(1) hue-rotate(160deg) brightness(0.75) saturate(0.6)";
    L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(m);
    m.setView([profile.hub.lat, profile.hub.lon], 6);
    try {
    const pts: [number, number][] = [[profile.hub.lat, profile.hub.lon]];
    const { satellites } = dossierBases(profile.hub.icao, profile.bases);
    const baseAirports = new Set([profile.hub.icao, ...satellites.map(b => b.icao)].map(icao => icao.trim().toUpperCase()));
    const drawnAirports = new Set<string>();
    const counts = new Map<string, number>();
    for (const f of profile.flights) { const k = [f.origin, f.destination].sort().join("-"); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const drawn = new Set<string>();
    for (const f of profile.flights) {
      const k = [f.origin, f.destination].sort().join("-");
      if (drawn.has(k) || f.origin === f.destination) continue; drawn.add(k);
      const n = counts.get(k) ?? 1;
      L.geoJSON(routeArc({ lat: f.olat, lon: f.olon }, { lat: f.dlat, lon: f.dlon }), { style: { color: css("--primary"), weight: 1 + Math.min(n, 4) * 0.5, opacity: Math.min(0.35 + n * 0.15, 0.95), dashArray: "4 5" } }).addTo(m);
      pts.push([f.olat, f.olon], [f.dlat, f.dlon]);
      for (const [lat, lon, id] of [[f.olat, f.olon, f.origin], [f.dlat, f.dlon, f.destination]] as const) {
        const key = id.trim().toUpperCase();
        if (baseAirports.has(key) || drawnAirports.has(key)) continue;
        drawnAirports.add(key);
        L.circleMarker([lat, lon], { radius: 2.5, color: css("--muted-foreground"), weight: 1, fillOpacity: 0.8 }).bindTooltip(id).addTo(m);
      }
    }
    for (const b of satellites) { L.circleMarker([b.lat, b.lon], { radius: 5, color: css("--primary"), fillColor: css("--primary"), fillOpacity: 0.9 }).bindTooltip(`${b.icao} · FBO`).addTo(m); pts.push([b.lat, b.lon]); }
    const amber = css("--amber") || "orange";
    L.marker([profile.hub.lat, profile.hub.lon], { icon: L.divIcon({ className: "", iconSize: [28, 28], html: `<div style="position:relative;width:28px;height:28px"><span class="animate-ping" style="position:absolute;inset:4px;border-radius:9999px;border:2px solid ${amber}"></span><span style="position:absolute;left:8px;top:8px;width:12px;height:12px;transform:rotate(45deg);background:${amber}"></span></div>` }) }).bindTooltip(`${profile.hub.icao} · Main hub`, { permanent: true, direction: "right", className: "readout" }).addTo(m);
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 8 });
    } catch (e) { console.warn("network map", e); }
    return () => { m.remove(); };
  }, [profile]);
  return <div ref={div} aria-label="Airline network map" className="aspect-square w-full border border-border bg-panel" />;
}
