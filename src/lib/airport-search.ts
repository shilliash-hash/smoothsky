import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { DISPATCH_SEARCH_LIMIT, DISPATCH_SEARCH_DEBOUNCE_MS } from "./dispatch-airports";

export type AirportRow = Database["public"]["Tables"]["airports"]["Row"];
export const SEARCH_LIMIT = DISPATCH_SEARCH_LIMIT;
export const MIN_SEARCH_CHARS = 2;

/** Strip characters that would break a PostgREST or() filter. */
export const sanitizeSearch = (q: string) => q.trim().replace(/[%,()*\\]/g, "").slice(0, 60);

/** Server-side airport search: ilike on code/name/city + tier filter, exact code first, then size DESC. */
export async function searchAirportsDb(query: string, tiers: readonly number[], originIcao?: string, minRunwayFt = 0): Promise<AirportRow[]> {
  const q = sanitizeSearch(query);
  if (q.length < MIN_SEARCH_CHARS || tiers.length === 0) return [];
  const { data, error } = await supabase
    .rpc("search_airports", { p_query: q, p_tiers: [...tiers], p_min_runway_ft: minRunwayFt, p_limit: SEARCH_LIMIT, ...(originIcao ? { p_origin_icao: originIcao } : {}) });
  if (error) throw error;
  return (data ?? []).map(row => row.airport as unknown as AirportRow);
}

export async function airportsNear(aircraftId: string, tiers: readonly number[]): Promise<(AirportRow & { is_fbo: boolean })[]> {
  if (tiers.length === 0) return [];
  const { data, error } = await supabase.rpc("get_dispatch_nearby_airports", { p_aircraft_id: aircraftId, p_tiers: [...tiers] });
  if (error) throw error;
  return (data ?? []).map(row => ({ ...(row.airport as unknown as AirportRow), is_fbo: row.is_fbo }));
}

export function useAirportSearch(query: string, tiers: readonly number[], originIcao?: string, minRunwayFt = 0) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DISPATCH_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const q = sanitizeSearch(debounced);
  return useQuery({
    queryKey: ["airport-search", q.toLowerCase(), [...tiers].sort().join(""), originIcao, minRunwayFt],
    queryFn: () => searchAirportsDb(q, tiers, originIcao, minRunwayFt),
    enabled: q.length >= MIN_SEARCH_CHARS,
    staleTime: 60_000,
  });
}
