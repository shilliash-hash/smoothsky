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

export const cargoPoolQuery = (icao: string) => queryOptions({
  queryKey: ["cargo-pool", icao],
  queryFn: () => fetchCargoPool(icao),
  enabled: icao.length > 0,
  staleTime: 30_000,
});

export const KG_TO_LBS = 2.2046226218;
export const cargoPoolLabel = (p: CargoPool) => `${p.stock.toLocaleString()} / ${p.capacity.toLocaleString()} kg`;
export const cargoPoolLbs = (p: CargoPool) => `${Math.round(p.stock * KG_TO_LBS).toLocaleString()} / ${Math.round(p.capacity * KG_TO_LBS).toLocaleString()} lbs`;
