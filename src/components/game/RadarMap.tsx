import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Operations, Airport } from "@/lib/operations";
import { liveRadarPosition, type LiveRadarFlight } from '@/lib/live-radar';
import type { WorldActivity } from '@/lib/radar-world';
import { fuelLabel } from "@/lib/fleet-rules";
import {
  distanceNm,
  rangeRing,
  routeArc,
} from "@/lib/dispatch-engine";
export default function RadarMap({
  data,
  flights,
  worldActivity,
  focusedFlight,
  airportFilter,
  selected,
  rangeOnly,
  layers,
  densities,
  onAirport,
  onFlight,
}: {
  data: Operations;
  flights: LiveRadarFlight[];
  worldActivity: WorldActivity[];
  focusedFlight: string | null;
  airportFilter: string[];
  selected: string;
  rangeOnly: boolean;
  layers: { pax: boolean; activity: boolean; flights: boolean };
  densities: { avgas: number; jeta: number };
  onAirport: (a: Airport) => void;
  onFlight: (f: LiveRadarFlight) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const airportLayer = useRef<L.LayerGroup | null>(null);
  const flightLayer = useRef<L.LayerGroup | null>(null);
  const airportPopup = useRef<L.Popup | null>(null);
  const popupAirport = useRef<string | null>(null);
  const center = useRef("");
  const [zoom, setZoom] = useState(5);
  const [view, setView] = useState(0);
  useEffect(() => {
    const f = flights.find(f => f.id === focusedFlight);
    if (!f || !map.current) return;
    const p = liveRadarPosition(f, Date.now());
    if (p) map.current.panTo([p.lat, p.lon]);
  }, [focusedFlight]);
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { preferCanvas: false }).setView([50, 15], 5);
    map.current = m;
    airportPopup.current = L.popup();
    m.on("zoomend", () => setZoom(m.getZoom()));
    m.on("moveend", () => setView(v => v + 1));
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(m);
    airportLayer.current = L.layerGroup().addTo(m);
    flightLayer.current = L.layerGroup().addTo(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(div.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      airportPopup.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    const layer = airportLayer.current;
    if (!m || !layer) return;
    layer.clearLayers();
    const root = getComputedStyle(document.documentElement);
    const primary = root.getPropertyValue("--primary").trim(),
      amber = root.getPropertyValue("--amber").trim(),
      range = root.getPropertyValue("--radar-range").trim(),
      activity = root.getPropertyValue("--radar-activity").trim();
    const metrics = new Map(data.metrics.map((x) => [x.icao, x]));
    const world = new Map(worldActivity.map(x => [x.icao, x]));
    const groundPorts = new Set(data.fleet.filter(f => f.status !== 'EN_ROUTE').map(f => f.location_icao));
    for (const row of worldActivity) if (row.grounded_aircraft_count > 0) groundPorts.add(row.icao);
    const allowedPorts = new Set(airportFilter);
    const f = data.fleet.find((f) => f.id === selected);
    const origin = data.airports.find((a) => a.icao === f?.location_icao);
    const radius = f?.type?.range_nm ?? 0;
    if (origin && center.current !== selected) {
      m.setView([origin.lat, origin.lon], 6);
      center.current = selected;
    }
    if (origin && radius > 0)
      L.geoJSON(rangeRing(origin, radius), {
        style: { color: range, weight: 2, fillOpacity: 0.04, dashArray: "5 6" },
      }).addTo(layer);
    const gaugePositions: L.Point[] = [];
    const airports = [...data.airports].sort((a, b) => {
      const aGrounded = groundPorts.has(a.icao);
      const bGrounded = groundPorts.has(b.icao);
      return Number(bGrounded) - Number(aGrounded) || b.size - a.size || a.icao.localeCompare(b.icao);
    });
    for (const a of airports) {
      if (!allowedPorts.has(a.icao)) continue;
      if (!m.getBounds().pad(0.1).contains([a.lat, a.lon])) continue;
      const reachable = !origin || distanceNm(origin, a) <= radius;
      if (rangeOnly && !reachable) continue;
      const grounded = groundPorts.has(a.icao);
      const metric = metrics.get(a.icao);
      const ratio = Math.min(
        1,
        Number(metric?.pax_stock ?? 0) / Math.max(1, Number(metric?.pax_capacity ?? 1)),
      );
      const ops = Number(world.get(a.icao)?.flights_7d ?? metric?.operations_7d ?? 0);
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${a.icao} · ${a.name}`;
      popup.append(title);
      for (const text of [
        `Size ${a.size} · Dev ${a.development_level} · Runway ${a.longest_runway_ft ?? "Unknown"} ft`,
        `Passengers: ${Math.floor(Number(metric?.pax_stock ?? 0))} / ${Math.round(Number(metric?.pax_capacity ?? 0))}`,
        `100LL stock: ${fuelLabel(Number(metric?.avgas_stock ?? 0), densities.avgas)}`,
        `Jet-A1 stock: ${fuelLabel(Number(metric?.jeta_stock ?? 0), densities.jeta)}`,
        `${ops} operations · last 7 days`,
        `${world.get(a.icao)?.grounded_aircraft_count ?? 0} aircraft on ground worldwide`,
      ]) {
        const line = document.createElement("div");
        line.textContent = text;
        popup.append(line);
      }
      if (popupAirport.current === a.icao && airportPopup.current?.isOpen()) {
        airportPopup.current.setContent(popup);
      }
      const openAirport = () => {
        popupAirport.current = a.icao;
        airportPopup.current?.setLatLng([a.lat, a.lon]).setContent(popup).openOn(m);
        onAirport(a);
      };
      const marker = L.circleMarker([a.lat, a.lon], {
        radius: grounded
          ? 7
          : zoom < 7
            ? Math.max(1.5, a.size / 2)
            : layers.pax
              ? 3 + ratio * 5
              : Math.max(2, a.size / 1.5),
        color: grounded ? amber : primary,
        weight: 1,
        fillOpacity: reachable ? 0.45 : 0.08,
        opacity: reachable ? 0.9 : 0.2,
        className: "",
      })
        .bindTooltip(`${a.icao} · ${a.name}`, { direction: "top" })
        .on("click", openAirport)
        .addTo(layer);
      if (layers.activity && ops > 0) {
        L.circleMarker([a.lat, a.lon], {
          radius: zoom >= 7 && layers.pax ? 28 : 11,
          color: activity,
          weight: 2,
          fill: false,
          opacity: reachable ? 0.8 : 0.15,
          interactive: false,
          className: "radar-hotspot",
        }).addTo(layer);
      }
      const point = m.latLngToContainerPoint([a.lat, a.lon]);
      const hasGaugeSpace = gaugePositions.every(previous => previous.distanceTo(point) >= 56);
      if (layers.pax && (zoom >= 7 || grounded) && hasGaugeSpace) {
        gaugePositions.push(point);
        const circumference = 2 * Math.PI * 19;
        L.marker([a.lat, a.lon], {
          icon: L.divIcon({ className: "radar-pax-gauge", iconSize: [48, 48], iconAnchor: [24, 24],
            html: `<svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="Passenger pool ${Math.round(ratio * 100)} percent"><circle class="gauge-track" cx="24" cy="24" r="19" stroke-width="4"/><circle class="gauge-value" cx="24" cy="24" r="19" stroke-width="4" stroke-dasharray="${ratio * circumference} ${circumference}" transform="rotate(-90 24 24)"/><text x="24" y="28">${Math.round(ratio * 100)}%</text></svg>` }),
          opacity: reachable ? 1 : 0.25,
        }).bindTooltip(`${a.icao} · ${Math.floor(Number(metric?.pax_stock ?? 0))} / ${Math.round(Number(metric?.pax_capacity ?? 0))} passengers`).on("click", openAirport).addTo(layer);
      }
      marker.getElement()?.setAttribute("aria-label", `${a.icao} airport`);
      const base = data.bases.find(b => b.airport_icao === a.icao);
      if (base) {
        L.marker([a.lat, a.lon], { icon: L.divIcon({ className: "radar-fob-marker", iconSize: [26, 26], iconAnchor: [13, 40], html: '<span class="flex h-6 w-6 items-center justify-center border border-amber bg-panel text-amber">⚑</span>' }) }).bindTooltip(`${base.base_type} FBO · ${a.icao}`).on("click", openAirport).addTo(layer);
      }
    }
  }, [
    data.airports,
    worldActivity,
    airportFilter,
    data.fleet,
    data.metrics,
    data.bases,
    selected,
    rangeOnly,
    layers.pax,
    layers.activity,
    onAirport,
    zoom,
    view,
    densities.avgas,
    densities.jeta,
  ]);
  useEffect(() => {
    const layer = flightLayer.current;
    if (!layer) return;
    const draw = () => {
      layer.clearLayers();
      if (!layers.flights) return;
      const root = getComputedStyle(document.documentElement);
      for (const f of flights) {
        const a = { lat: f.origin_lat, lon: f.origin_lon },
          b = { lat: f.destination_lat, lon: f.destination_lon };
        L.geoJSON(routeArc(a, b), {
          style: {
             color: root.getPropertyValue(f.is_own ? "--primary" : "--amber").trim(),
            weight: 2,
            opacity: 0.7,
            dashArray: "4 5",
          },
        }).addTo(layer);
        const p = liveRadarPosition(f, Date.now());
        if (!p) continue;
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: `radar-plane${f.is_own ? ' radar-plane-own' : ''}${f.status === 'DISPATCHED' ? ' radar-plane-dispatched' : ''}`,
            html: `<span style="display:block;transform:rotate(${p.heading - 90}deg)">✈</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
          .bindTooltip(() => {
            const label = document.createElement("span");
            label.textContent = `${f.is_own ? 'YOUR FLIGHT · ' : ''}${f.airline_name} · ${f.flight_number} · ${f.registration} · ${f.origin_icao} → ${f.destination_icao} · ${f.status}`;
            return label;
          })
          .on("click", () => onFlight(f))
          .addTo(layer);
      }
    };
    draw();
    const timer = setInterval(draw, 1000);
    return () => clearInterval(timer);
  }, [flights, onFlight, layers.flights]);
  return (
    <div
      ref={div}
      aria-label="SmoothSky operational radar map"
      className="h-[600px] w-full min-w-0 md:h-[680px]"
    />
  );
}
