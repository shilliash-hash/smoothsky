import distance from "@turf/distance";
import greatCircle from "@turf/great-circle";
import along from "@turf/along";
import bearing from "@turf/bearing";
import circle from "@turf/circle";
import { point, lineString } from "@turf/helpers";
export type Coordinates = { lat: number; lon: number };
export type Economy = Record<string, number | boolean | number[]>;
export type CharterSnapshot = { base_rate: number; rate: number; multiplier: number; threshold_nm: number; reduced: boolean };
// Display the frozen SQL quote, rather than recalculating its rounded distance.
export function ticketRevenueBreakdown(revenue: number, passengers: number, tier: number, rates: readonly number[], charter?: CharterSnapshot) {
  const surchargePerPassenger = charter?.rate ?? rates[tier - 1] ?? 0;
  const charterRevenue = Math.round(passengers * surchargePerPassenger * 100) / 100;
  return { surchargePerPassenger, charterRevenue, isShortHop: charter?.reduced ?? false, thresholdNm: charter?.threshold_nm, reductionPercent: Math.round((1 - (charter?.multiplier ?? 1)) * 100), distanceRevenue: Math.round((revenue - charterRevenue) * 100) / 100 };
}
export const coordinates = (p: Coordinates): [number, number] => [p.lon, p.lat];
export const distanceNm = (a: Coordinates, b: Coordinates) =>
  distance(point(coordinates(a)), point(coordinates(b)), { units: "nauticalmiles" });
export const inRange = (a: Coordinates, b: Coordinates, range: number) => distanceNm(a, b) <= range;
export function flightPosition(a: Coordinates, b: Coordinates, progress: number) {
  const route = greatCircle(coordinates(a), coordinates(b));
  const p = Math.min(1, Math.max(0, progress));
  if (route.geometry.type !== "LineString")
    return {
      lat: a.lat + (b.lat - a.lat) * p,
      lon: a.lon + (b.lon - a.lon) * p,
      heading: bearing(point(coordinates(a)), point(coordinates(b))),
    };
  const nm = distanceNm(a, b);
  const at = along(lineString(route.geometry.coordinates), nm * p, { units: "nauticalmiles" })
    .geometry.coordinates;
  const next = along(lineString(route.geometry.coordinates), nm * Math.min(1, p + 0.001), {
    units: "nauticalmiles",
  }).geometry.coordinates;
  return { lat: at[1] ?? a.lat, lon: at[0] ?? a.lon, heading: bearing(point(at), point(next)) };
}
export const rangeRing = (a: Coordinates, nm: number) =>
  circle(coordinates(a), nm, { units: "nauticalmiles", steps: 120 });
export const routeArc = (a: Coordinates, b: Coordinates) =>
  greatCircle(coordinates(a), coordinates(b));
export function projectedPassengers(
  stock: number,
  capacity: number,
  hours: number,
  idleHours: number,
  rules: Economy,
) {
  const cap = capacity * Number(rules["natural_cap"]);
  return stock < cap
    ? Math.min(cap, stock + capacity * Number(rules["hourly_rate"]) * Math.max(0, hours))
    : Math.min(
        capacity * Number(rules["transit_cap"]),
        Math.max(cap, stock - capacity * Number(rules["hourly_rate"]) * Math.max(0, idleHours)),
      );
}
export function estimatedCosts(nm: number, speed: number, burn: number, price: number) {
  const hours = nm / speed;
  return {
    minutes: hours * 60,
    fuel: hours * burn,
    cost: Math.round(hours * burn * price * 100) / 100,
  };
}
export function flightProgress(
  f: { departed_at: string | null; estimated_minutes: number; rules_snapshot: unknown },
  now: number,
) {
  if (!f.departed_at) return 0;
  const r = f.rules_snapshot as Economy;
  return Math.min(
    1,
    Math.max(
      0,
      (now - Date.parse(f.departed_at)) /
        ((Number(f.estimated_minutes) * 60000) / Math.max(1, Number(r["simulation_time_scale"]))),
    ),
  );
}
