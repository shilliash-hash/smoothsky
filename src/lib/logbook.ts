import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

function settlementNumber(settlement: Json | null, key: string): number | null {
  if (!settlement || typeof settlement !== "object" || Array.isArray(settlement)) return null;
  const value = settlement[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function logbookResult(flight: { settlement: Json | null; estimated_minutes: number }) {
  return {
    hours: (settlementNumber(flight.settlement, "minutes") ?? flight.estimated_minutes) / 60,
    net: settlementNumber(flight.settlement, "net"),
  };
}

export const logbookQuery = (companyId: string) => queryOptions({
  queryKey: ["flight-logbook", companyId],
  staleTime: 15000,
  queryFn: async () => {
    const fetchPage = (offset: number) => supabase.from("flights")
      .select("id, aircraft_id, completed_at, flight_number, origin_icao, destination_icao, distance_nm, estimated_minutes, passengers, settlement, estimate, telemetry, divert_state, aircraft:fleet_aircraft!flights_aircraft_id_fkey(registration, type:aircraft_types(manufacturer, model))")
      .eq("company_id", companyId)
      .eq("status", "COMPLETED")
      .order("completed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    const rows: NonNullable<Awaited<ReturnType<typeof fetchPage>>["data"]> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await fetchPage(offset);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  },
});