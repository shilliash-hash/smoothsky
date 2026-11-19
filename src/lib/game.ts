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

export const transactionHistoryQuery = (companyId: string, aircraftId: string | null) =>
  queryOptions({
    queryKey: ["transaction-history", companyId, aircraftId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("transaction_history_numbered", {
        p_company: companyId,
        ...(aircraftId ? { p_aircraft: aircraftId } : {}),
      });
      if (error) throw error;
      return data;
    },
  });

export const ledgerAircraftQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["ledger-aircraft", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_aircraft")
        .select("id, registration, returned_at").eq("company_id", companyId).order("registration");
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
        .is("returned_at", null)
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
  staleTime: 30000,
  queryFn: async () => {
    const rows = [];
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await supabase.from("airports").select("*").order("icao").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  },
});

export const economyQuery = queryOptions({queryKey:["economy"],staleTime:10000,refetchInterval:10000,queryFn:async()=>{const {data,error}=await supabase.from("economy_config").select("*");if(error)throw error;return Object.fromEntries(data.map(r=>[r.key,r.value]));}});
