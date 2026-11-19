import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { searchAirports } from "./airport-tiers";

export type AirportRow = Database["public"]["Tables"]["airports"]["Row"];
export const SEARCH_LIMIT = 50;
export const MIN_SEARCH_CHARS = 2;

/** Strip characters that would break a PostgREST or() filter. */
export const sanitizeSearch = (q: string) => q.trim().replace(/[%,()*\\]/g, "").slice(0, 60);

/** Server-side airport search: ilike on code/name/city + tier filter, exact code first, then size DESC. */
export async function searchAirportsDb(query: string, tiers: readonly number[]): Promise<AirportRow[]> {
  const q = sanitizeSearch(query);
  if (q.length < MIN_SEARCH_CHARS || tiers.length === 0) return [];
  const p = `%${q}%`;
  const { data, error } = await supabase
    .from("airports")
    .select("*")
    .in("size", [...tiers])
    .or(`icao.ilike.${p},iata.ilike.${p},name.ilike.${p},city.ilike.${p}`)
    .order("size", { ascending: false })
    .order("icao")
    .limit(SEARCH_LIMIT);
  if (error) throw error;
  return searchAirports(data ?? [], q, tiers).slice(0, SEARCH_LIMIT);
}

/** Airports inside the bounding box of an aircraft's range, largest first. */
export async function airportsNear(origin: { lat: number; lon: number }, rangeNm: number, tiers: readonly number[]): Promise<AirportRow[]> {
  if (tiers.length === 0) return [];
  const dLat = rangeNm / 60;
  const dLon = Math.min(180, rangeNm / (60 * Math.max(0.1, Math.cos((origin.lat * Math.PI) / 180))));
  const { data, error } = await supabase
    .from("airports")
    .select("*")
    .in("size", [...tiers])
    .gte("lat", origin.lat - dLat).lte("lat", origin.lat + dLat)
    .gte("lon", origin.lon - dLon).lte("lon", origin.lon + dLon)
    .order("size", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export function useAirportSearch(query: string, tiers: readonly number[]) {
  const q = sanitizeSearch(query);
  return useQuery({
    queryKey: ["airport-search", q.toLowerCase(), [...tiers].sort().join("")],
    queryFn: () => searchAirportsDb(q, tiers),
    enabled: q.length >= MIN_SEARCH_CHARS,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
