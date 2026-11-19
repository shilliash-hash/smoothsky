import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const simbriefUsernameSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,40}$/, "Use 1–40 letters, digits, dot, dash or underscore");

export const getPilotProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("ensure_my_profile");
    if (error) throw new Error(error.message);
    const p = data as { acars_api_key: string; acars_last_seen: string | null; simbrief_username: string | null };
    return { acarsKey: p.acars_api_key, lastSeen: p.acars_last_seen, simbriefUsername: p.simbrief_username, serverTime: Date.now() };
  });

export const regenerateAcarsKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("regenerate_acars_key");
    if (error) throw new Error(error.message);
    return data as string;
  });

export type SimbriefPlan = { origin: string; destination: string; flightNumber: string | null; passengers: number | null; aircraft: string | null; generatedAt: string | null };

export const importSimbrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ username: simbriefUsernameSchema }))
  .handler(async ({ data, context }): Promise<SimbriefPlan> => {
    const u = data.username;
    const save = await context.supabase.from("profiles").update({ simbrief_username: u }).eq("id", context.userId);
    if (save.error) throw new Error(save.error.message);
    const param = /^\d+$/.test(u) ? `userid=${u}` : `username=${encodeURIComponent(u)}`;
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${param}&json=1`, { redirect: "manual" });
    const ofp = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!res.ok || !ofp || ofp["fetch"]?.status !== "Success") throw new Error(ofp?.["fetch"]?.status ?? "SimBrief OFP not found for this user");
    const g = ofp["general"] ?? {};
    const num = `${g.icao_airline ?? ""}${g.flight_number ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pax = Number(ofp["weights"]?.pax_count ?? ofp["general"]?.passengers);
    return {
      origin: String(ofp["origin"]?.icao_code ?? "").toUpperCase(),
      destination: String(ofp["destination"]?.icao_code ?? "").toUpperCase(),
      flightNumber: num || null,
      passengers: Number.isFinite(pax) ? pax : null,
      aircraft: ofp["aircraft"]?.icaocode ?? null,
      generatedAt: ofp["params"]?.time_generated ? new Date(Number(ofp["params"].time_generated) * 1000).toISOString() : null,
    };
  });

export type CareerProfile = {
  career_role: "ENTREPRENEUR" | "PILOT_ONLY" | null;
  callsign: string | null;
  pilot_home_icao: string | null;
  type_ratings: number[];
  balance: number;
  roster: { company_id: string; name: string; icao_code: string; commission_pct: number; joined_at: string } | null;
  prices: { T3_4: number; T5: number; T6_7: number };
};

export const getCareer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("ensure_my_profile");
    const { data, error } = await context.supabase.rpc("my_pilot_profile");
    if (error) throw new Error(error.message);
    return data as unknown as CareerProfile;
  });

export const choosePilotCareer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ callsign: z.string().trim().regex(/^[A-Za-z0-9 _.-]{3,24}$/), home: z.string().trim().length(4) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("choose_pilot_career", { p_callsign: data.callsign, p_home: data.home.toUpperCase() });
    if (error) throw new Error(error.message);
    return true;
  });

export const buyTypeRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ group: z.enum(["T3_4", "T5", "T6_7"]) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("buy_type_rating", { p_group: data.group });
    if (error) throw new Error(error.message);
    return true;
  });

export const rosterAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ action: z.enum(["join", "leave"]), companyId: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => {
    const { error } = data.action === "join"
      ? await context.supabase.rpc("join_roster", { p_company: data.companyId! })
      : await context.supabase.rpc("leave_roster");
    if (error) throw new Error(error.message);
    return true;
  });

export const getHiringCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("hiring_companies");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setCompanyHiring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ hiring: z.boolean(), roster: z.number().min(35).max(50), freelance: z.number().min(20).max(30) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_company_hiring", { p_hiring: data.hiring, p_roster: data.roster, p_freelance: data.freelance });
    if (error) throw new Error(error.message);
    return true;
  });

export const getPilotLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_pilot_leaderboard");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
