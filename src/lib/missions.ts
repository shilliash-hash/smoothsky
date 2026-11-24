import { queryOptions } from "@tanstack/react-query";
import { getMissions } from "./missions.functions";
export const missionsQuery = queryOptions({ queryKey: ["missions"], queryFn: () => getMissions(), refetchInterval: 30000 });
export type Mission = Awaited<ReturnType<typeof getMissions>>["missions"][number];

/** Late delivery halves the fixed payout. */
export function missionPayout(payout: number, deadlineAt: string | null, at: number): { amount: number; late: boolean } {
  const late = !!deadlineAt && at > new Date(deadlineAt).getTime();
  return { amount: late ? Math.round(payout * 50) / 100 : payout, late };
}

type FitAircraft = { returned_at: string | null; location_icao: string; status?: string | null; registration?: string | null; type?: { cargo_kg: number | null } | null };

/**
 * Can the player's active airline fleet carry a mission's cargo (All-Cargo bonus counted),
 * and is a capable aircraft parked and available at the origin? Accepting requires `atOrigin`.
 */
export function missionFleetFit(fleet: FitAircraft[], cargoKg: number, origin: string, allCargoBonus: number) {
  const capacity = (f: FitAircraft) => Math.floor((f.type?.cargo_kg ?? 0) * (1 + allCargoBonus));
  const active = fleet.filter((f) => !f.returned_at);
  const capable = active.filter((f) => capacity(f) >= cargoKg);
  const ready = capable.find((f) => f.location_icao === origin && (f.status ?? "AVAILABLE") === "AVAILABLE");
  return {
    capable: capable.length > 0,
    fleetMaxKg: active.reduce((max, f) => Math.max(max, capacity(f)), 0),
    atOrigin: !!ready,
    readyRegistration: ready?.registration ?? null,
    readyKg: ready ? capacity(ready) : 0,
    elsewhereIcao: capable.find((f) => f.location_icao !== origin)?.location_icao ?? null,
  };
}
