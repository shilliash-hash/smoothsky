import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.supabase.rpc("get_public_leaderboard").range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return rows;
  });
export const getPublicCompanyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { icao: string }) => ({ icao: String(d.icao).slice(0, 8) }))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("get_public_company_profile", { p_icao_code: data.icao });
    if (error) throw new Error(error.message);
    return row as unknown as PublicCompanyProfile | null;
  });

type Pt = { icao: string; name: string; lat: number; lon: number };
export type PublicCompanyProfile = {
  name: string; icao_code: string; is_supporter: boolean; owner: string; is_me: boolean; hub: Pt;
  bases: (Pt & { base_type: string; fuel: boolean; handling: boolean; maintenance: boolean })[];
  fleet: { registration: string; model: string; ownership: string; status: string; location: string; flight: { origin: string; destination: string; status: string } | null }[];
  flights: { flight_number: string | null; origin: string; destination: string; olat: number; olon: number; dlat: number; dlon: number; distance_nm: number; registration: string; model: string; pax: number; cargo_kg: number; seats: number; minutes: number; status: string; date: string }[];
};
