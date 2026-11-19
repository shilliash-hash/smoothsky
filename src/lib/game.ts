import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const companyQuery = queryOptions({
  queryKey: ["company"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("*, home_base:airports!companies_home_base_icao_fkey(*)")
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const ledgerQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["ledger", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_ledger")
        .select("*")
        .eq("company_id", companyId)
        .order("id", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

export const fleetQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["fleet", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fleet_aircraft")
        .select("*, type:aircraft_types(*)")
        .eq("company_id", companyId)
        .order("leased_at");
      if (error) throw error;
      return data;
    },
  });

export const aircraftTypesQuery = queryOptions({
  queryKey: ["aircraft_types"],
  queryFn: async () => {
    const { data, error } = await supabase.from("aircraft_types").select("*").order("tier");
    if (error) throw error;
    return data;
  },
});

export const airportsQuery = queryOptions({
  queryKey: ["airports"],
  staleTime: Infinity,
  queryFn: async () => {
    const { data, error } = await supabase.from("airports").select("*").order("icao");
    if (error) throw error;
    return data;
  },
});
