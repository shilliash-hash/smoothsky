import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeArc } from "@/lib/dispatch-engine";
import { formatCr } from "@/lib/rules";

export type MiniMapPin = { icao: string; name: string | null; lat: number; lon: number; distance_nm: number; estimated_margin: number | null; is_fbo: boolean };

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Lightweight dispatch map: origin, clickable destination pins and a great-circle arc to the selected one. */
export default function DispatchMiniMap({ origin, pins, top, selected, onSelect }: {
  origin: { icao: string; lat: number; lon: number };
  pins: MiniMapPin[];
  top: Set<string>;
  selected: string;
  onSelect: (icao: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { attributionControl: true, zoomControl: true, worldCopyJump: true });
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 18 }).addTo(m);
    tiles.getContainer()?.style.setProperty("filter", "invert(1) hue-rotate(160deg) brightness(0.75)");
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(div.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const primary = cssVar("--primary"), accent = cssVar("--accent"), amber = cssVar("--amber") || accent, muted = cssVar("--muted-foreground"), fg = cssVar("--foreground");
    const dest = pins.find(p => p.icao === selected);
    if (dest) L.geoJSON(routeArc({ lat: origin.lat, lon: origin.lon }, { lat: dest.lat, lon: dest.lon }), { style: { color: primary, weight: 3, opacity: 0.9 } }).addTo(g);
    for (const p of pins) {
      if (p.icao === origin.icao) continue;
      const isSel = p.icao === selected, isTop = top.has(p.icao);
      const color = isSel ? fg : isTop ? amber : p.is_fbo ? primary : muted;
      const est = p.estimated_margin === null ? "" : ` · Est. ${p.estimated_margin >= 0 ? "+" : ""}${formatCr(p.estimated_margin)}`;
      L.circleMarker([p.lat, p.lon], { radius: isSel ? 7 : isTop ? 6 : 4, color, fillColor: color, fillOpacity: 0.8, weight: isSel ? 3 : 1 })
        .bindTooltip(`<b>${esc(p.icao)}</b> ${esc(p.name ?? "")}<br/>${Math.round(p.distance_nm)} NM${esc(est)}${isTop ? " · TOP DEAL" : ""}${p.is_fbo ? " · FBO" : ""}`)
        .on("click", () => pick.current(p.icao))
        .addTo(g);
    }
    L.circleMarker([origin.lat, origin.lon], { radius: 7, color: fg, fillColor: primary, fillOpacity: 1, weight: 2 }).bindTooltip(`<b>${esc(origin.icao)}</b> · Origin`).addTo(g);
    const pts: [number, number][] = dest ? [[origin.lat, origin.lon], [dest.lat, dest.lon]] : [[origin.lat, origin.lon], ...pins.map(p => [p.lat, p.lon] as [number, number])];
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 9 });
    else m.setView([origin.lat, origin.lon], 7);
  }, [origin, pins, top, selected]);
  return <div ref={div} aria-label="Destination map" className="h-[300px] w-full border border-border" />;
}
