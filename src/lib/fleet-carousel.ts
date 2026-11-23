export type FleetFilter = "all" | "available" | "flight" | "sale";
const AIRBORNE = ["EN_ROUTE", "DISPATCHED"];
export const isAirborne = (s: string) => AIRBORNE.includes(s);
function rank(s: string) { return s === "DIVERTED" ? -1 : s === "EN_ROUTE" ? 0 : s === "DISPATCHED" ? 1 : s === "AVAILABLE" ? 2 : 3; }
export function arrangeFleet<T extends { id: string; status: string; registration: string }>(fleet: T[], filter: FleetFilter, forSale: Set<string>): T[] {
  return fleet.filter(f => filter === "all" || (filter === "available" ? f.status === "AVAILABLE" && !forSale.has(f.id) : filter === "flight" ? isAirborne(f.status) || f.status === "DIVERTED" : forSale.has(f.id)))
    .sort((a, b) => rank(a.status) - rank(b.status) || a.registration.localeCompare(b.registration));
}
