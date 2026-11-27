import { distanceNm, type Coordinates } from "./dispatch-engine";

export type MissionAirport = Coordinates & { icao: string; name: string; longest_runway_ft: number | null };
export type PreviewAircraft = {
  id: string; registration: string; location_icao: string; returned_at: string | null; status: string;
  reserved_by?: string | null; reserved_until?: string | null; maintenance_status?: string | null;
  type: { cargo_kg: number | null; pax: number | null; model?: string; cruise_kts?: number | null } | null;
};
type PreviewMission = { category: string; cargo_kg: number; passengers?: number | null; origin_icao: string };

/** Advisory capacity/location ranking; acceptance and dispatch remain authoritative SQL actions. */
export function findNearestFittingAircraft(fleet: PreviewAircraft[], mission: PreviewMission, airports: MissionAirport[], bonus: number, now: number) {
  const fitting = fleet.filter(f => !f.returned_at && f.type && (mission.category === "CHARTER"
    ? (f.type.pax ?? 0) >= (mission.passengers ?? 0) && (f.type.cargo_kg ?? 0) >= mission.cargo_kg
    : Math.floor((f.type.cargo_kg ?? 0) * (1 + bonus)) >= mission.cargo_kg));
  const origin = airports.find(a => a.icao === mission.origin_icao);
  const candidates = fitting.map(aircraft => {
    const airport = airports.find(a => a.icao === aircraft.location_icao);
    const ferryNm = aircraft.location_icao === mission.origin_icao ? 0 : origin && airport ? distanceNm(airport, origin) : null;
    const reserved = !!aircraft.reserved_by && (!aircraft.reserved_until || Date.parse(aircraft.reserved_until) > now);
    const available = aircraft.status === "AVAILABLE" && !reserved && aircraft.maintenance_status !== "AOG" && aircraft.maintenance_status !== "MAJOR_DEFECT";
    return { aircraft, airport: airport ?? null, ferryNm, available };
  });
  candidates.sort((a, b) => Number(b.available) - Number(a.available) || (a.ferryNm ?? Infinity) - (b.ferryNm ?? Infinity) || a.aircraft.registration.localeCompare(b.aircraft.registration));
  return { capable: fitting.length > 0, nearest: candidates[0] ?? null, incompleteLocations: candidates.some(c => c.available && c.ferryNm === null) };
}