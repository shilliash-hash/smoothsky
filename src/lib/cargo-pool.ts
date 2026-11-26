import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CargoPool = { stock: number; capacity: number };

export async function fetchCargoPool(icao: string): Promise<CargoPool> {
  const [s, c] = await Promise.all([
    supabase.rpc("cargo_stock", { p_airport: icao }),
    supabase.rpc("cargo_capacity", { p_airport: icao }),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (c.error) throw new Error(c.error.message);
  return { stock: Math.max(0, Math.floor(Number(s.data ?? 0))), capacity: Math.round(Number(c.data ?? 0)) };
}

export function cargoPoolPlaceholder(icao: string, previous: CargoPool | undefined, previousIcao: unknown) {
  return previousIcao === icao ? previous : undefined;
}

export const cargoPoolQuery = (icao: string) => queryOptions({
  queryKey: ["cargo-pool", icao] as const,
  queryFn: () => fetchCargoPool(icao),
  enabled: icao.length > 0,
  staleTime: 30_000,
  // Refetches retain the current airport's values; a new ICAO never inherits its neighbour's stock.
  placeholderData: (previous, previousQuery) => cargoPoolPlaceholder(icao, previous, previousQuery?.queryKey[1]),
});

export const KG_TO_LBS = 2.2046226218;
export const cargoPoolLabel = (p: CargoPool) => `${p.stock.toLocaleString()} / ${p.capacity.toLocaleString()} kg`;
export const cargoPoolLbs = (p: CargoPool) => `${Math.round(p.stock * KG_TO_LBS).toLocaleString()} / ${Math.round(p.capacity * KG_TO_LBS).toLocaleString()} lbs`;
