import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AirportRow } from "./airport-search";
import { sanitizeSearch, MIN_SEARCH_CHARS } from "./airport-search";
import { DISPATCH_SEARCH_DEBOUNCE_MS } from "./dispatch-airports";

export type DestinationDeal = AirportRow & {
  distance_nm: number;
  estimated_revenue: number | null;
  estimated_margin: number | null;
  estimate_error: string | null;
  is_fbo: boolean;
};
export type DestinationAlternative = DestinationDeal & {
  distance_from_target_nm: number;
  margin_diff_vs_target: number | null;
};

export function useDispatchDeals(aircraftId: string | undefined, originIcao: string | undefined, tiers: readonly number[], search: string, cargoKg: number, allCargo: boolean, rulesKey: string, passengers: number | null = null, targetFuel: number | null = null) {
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), DISPATCH_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  const query = sanitizeSearch(debounced);
  const searchPending = sanitizeSearch(search) !== query;
  const result = useQuery({
    queryKey: ["dispatch-deals", aircraftId, originIcao, tiers.join(","), query.length >= MIN_SEARCH_CHARS ? query : "", cargoKg, allCargo, rulesKey, passengers, targetFuel],
    enabled: !!aircraftId && tiers.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DestinationDeal[]> => {
      if (!aircraftId) return [];
      const { data, error } = await supabase.rpc("get_dispatch_destination_deals_loaded", {
        p_aircraft_id: aircraftId, p_tiers: [...tiers], p_cargo_kg: cargoKg, p_all_cargo: allCargo,
        ...(passengers !== null ? { p_passengers: passengers } : {}), ...(targetFuel !== null ? { p_target_fuel_gal: targetFuel } : {}),
        ...(query.length >= MIN_SEARCH_CHARS ? { p_query: query } : {}),
      });
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...(row.airport as unknown as AirportRow),
        distance_nm: Number(row.distance_nm), is_fbo: row.is_fbo,
        estimated_revenue: row.estimated_revenue == null ? null : Number(row.estimated_revenue),
        estimated_margin: row.estimated_margin == null ? null : Number(row.estimated_margin),
        estimate_error: row.estimate_error ?? null,
      }));
    },
  });
  return { ...result, searchPending };
}

export function useDestinationAlternatives(aircraftId: string | undefined, originIcao: string | undefined, target: string, tiers: readonly number[], cargoKg: number, allCargo: boolean, rulesKey: string, passengers: number | null = null, targetFuel: number | null = null) {
  return useQuery({
    queryKey: ["dispatch-alternatives", aircraftId, originIcao, target, tiers.join(","), cargoKg, allCargo, rulesKey, passengers, targetFuel],
    enabled: !!aircraftId && !!target && tiers.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DestinationAlternative[]> => {
      if (!aircraftId || !target) return [];
      const { data, error } = await supabase.rpc("get_destination_alternatives_loaded", {
        p_aircraft_id: aircraftId, p_target_icao: target, p_radius_nm: 150,
        p_tiers: [...tiers], p_cargo_kg: cargoKg, p_all_cargo: allCargo,
        ...(passengers !== null ? { p_passengers: passengers } : {}), ...(targetFuel !== null ? { p_target_fuel_gal: targetFuel } : {}),
      });
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...(row.airport as unknown as AirportRow), is_fbo: false,
        distance_nm: Number(row.distance_nm), distance_from_target_nm: Number(row.distance_from_target_nm),
        estimated_revenue: row.estimated_revenue == null ? null : Number(row.estimated_revenue),
        estimated_margin: row.estimated_margin == null ? null : Number(row.estimated_margin),
        margin_diff_vs_target: row.margin_diff_vs_target == null ? null : Number(row.margin_diff_vs_target),
        estimate_error: row.estimate_error ?? null,
      }));
    },
  });
}