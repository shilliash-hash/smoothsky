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

const boxQuery = (o: { lat: number; lon: number }, nm: number, tiers: readonly number[]) => {
  const dLat = nm / 60;
  const dLon = Math.min(180, nm / (60 * Math.max(0.1, Math.cos((o.lat * Math.PI) / 180))));
  return supabase
    .from("airports")
    .select("*")
    .in("size", [...tiers])
    .gte("lat", o.lat - dLat).lte("lat", o.lat + dLat)
    .gte("lon", o.lon - dLon).lte("lon", o.lon + dLon)
    .order("size", { ascending: false })
    .limit(100);
};
const nm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(h));
};
/** Browser query: airports in the aircraft-range box (plus a tight local box so small nearby strips are never cut), nearest first, max 100. */
export async function airportsNear(origin: { lat: number; lon: number }, rangeNm: number, tiers: readonly number[]): Promise<AirportRow[]> {
  if (tiers.length === 0 || rangeNm <= 0) return [];
  const [local, wide] = await Promise.all([boxQuery(origin, Math.min(rangeNm, 60), tiers), boxQuery(origin, rangeNm, tiers)]);
  if (local.error) throw local.error;
  if (wide.error) throw wide.error;
  const byIcao = new Map<string, AirportRow>();
  for (const a of [...(local.data ?? []), ...(wide.data ?? [])]) byIcao.set(a.icao, a);
  return [...byIcao.values()].sort((a, b) => nm(origin, a) - nm(origin, b)).slice(0, 100);
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
