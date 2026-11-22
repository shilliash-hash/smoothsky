import { z } from "zod";

/** Visual-only SimBrief navlog point. Never used by quotes or settlement. */
export type RouteWaypoint = { ident: string; lat: number; lon: number; airway?: string | undefined; alt?: number | undefined; type?: string | undefined };

export const routeWaypointSchema = z.object({
  ident: z.string().max(16),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  airway: z.string().max(16).optional(),
  alt: z.number().min(-2000).max(70000).optional(),
  type: z.string().max(12).optional(),
});
export const routeWaypointsSchema = z.array(routeWaypointSchema).min(2).max(400);

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function point(raw: Record<string, unknown>, fallbackIdent: string): RouteWaypoint | null {
  const lat = Number(raw["pos_lat"]), lon = Number(raw["pos_long"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const wp: RouteWaypoint = { ident: String(raw["ident"] ?? raw["icao_code"] ?? fallbackIdent).toUpperCase().slice(0, 16), lat: round4(lat), lon: round4(lon) };
  const airway = String(raw["via_airway"] ?? "").toUpperCase().slice(0, 16);
  if (airway) wp.airway = airway;
  const alt = Number(raw["altitude_feet"]);
  if (raw["altitude_feet"] != null && Number.isFinite(alt) && alt >= -2000 && alt <= 70000) wp.alt = Math.round(alt);
  const type = String(raw["type"] ?? "").toLowerCase().slice(0, 12);
  if (type) wp.type = type;
  return wp;
}

/** Normalizes SimBrief OFP JSON into origin → navlog fixes → destination. */
export function parseSimbriefRoute(ofp: Record<string, any>): RouteWaypoint[] | null {
  const fixRaw = ofp?.["navlog"]?.["fix"];
  const fixes: Record<string, unknown>[] = Array.isArray(fixRaw) ? fixRaw : fixRaw && typeof fixRaw === "object" ? [fixRaw] : [];
  const origin = point({ ...(ofp?.["origin"] ?? {}), type: "apt", ident: ofp?.["origin"]?.icao_code }, "DEP");
  const dest = point({ ...(ofp?.["destination"] ?? {}), type: "apt", ident: ofp?.["destination"]?.icao_code }, "ARR");
  const mid = fixes.map((f, i) => point(f, `WP${i + 1}`)).filter((p): p is RouteWaypoint => p !== null)
    .filter(p => !(origin && p.ident === origin.ident) && !(dest && p.ident === dest.ident));
  const all = [origin, ...mid, dest].filter((p): p is RouteWaypoint => p !== null).slice(0, 400);
  return all.length >= 2 ? all : null;
}

/** Splits a route at the aircraft: flown part ends and planned part starts at the aircraft position. */
export function splitRouteAtPosition(points: RouteWaypoint[], pos: { lat: number; lon: number }) {
  if (points.length < 2) return { flown: [] as [number, number][], planned: points.map(p => [p.lat, p.lon] as [number, number]) };
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.lon - a.lon, dy = b.lat - a.lat;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((pos.lon - a.lon) * dx + (pos.lat - a.lat) * dy) / len)) : 0;
    const d = (a.lon + t * dx - pos.lon) ** 2 + (a.lat + t * dy - pos.lat) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  const here: [number, number] = [pos.lat, pos.lon];
  return {
    flown: [...points.slice(0, best + 1).map(p => [p.lat, p.lon] as [number, number]), here],
    planned: [here, ...points.slice(best + 1).map(p => [p.lat, p.lon] as [number, number])],
  };
}

export function waypointLabel(w: RouteWaypoint) {
  const alt = w.alt != null && w.alt > 0 ? (w.alt >= 18000 ? `FL${String(Math.round(w.alt / 100)).padStart(3, "0")}` : `${w.alt.toLocaleString("en-US")} ft`) : null;
  return [w.ident, w.airway && w.airway !== "DCT" ? `Airway ${w.airway}` : w.airway === "DCT" ? "Direct" : null, alt, w.type ? w.type.toUpperCase() : null].filter(Boolean).join(" · ");
}
