import { parseSimbriefRoute, type RouteWaypoint } from "@/lib/route-waypoints";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { hiringSchema, recruitmentSettings, validateHiring } from "./recruitment-rules";
import type { Json } from "@/integrations/supabase/types";

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

export type SimbriefPlan = { origin: string; destination: string; flightNumber: string | null; passengers: number | null; aircraft: string | null; generatedAt: string | null; route: RouteWaypoint[] | null; rampFuel: { value: number; unit: "kgs" | "lbs" } | null };

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
    const ramp = Number(ofp["fuel"]?.plan_ramp);
    const unit: "kgs" | "lbs" = String(ofp["params"]?.units ?? "kgs").toLowerCase().startsWith("lb") ? "lbs" : "kgs";
    return {
      origin: String(ofp["origin"]?.icao_code ?? "").toUpperCase(),
      destination: String(ofp["destination"]?.icao_code ?? "").toUpperCase(),
      flightNumber: num || null,
      passengers: Number.isFinite(pax) ? pax : null,
      aircraft: ofp["aircraft"]?.icaocode ?? null,
      route: parseSimbriefRoute(ofp),
      rampFuel: Number.isFinite(ramp) && ramp > 0 ? { value: ramp, unit } : null,
      generatedAt: ofp["params"]?.time_generated ? new Date(Number(ofp["params"].time_generated) * 1000).toISOString() : null,
    };
  });

export type CareerProfile = {
  career_role: "ENTREPRENEUR" | "PILOT_ONLY" | null;
  callsign: string | null;
  pilot_home_icao: string | null;
  type_ratings: number[];
  balance: number;
  training_company: { id: string; name: string; balance: number } | null;
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
  .inputValidator(hiringSchema)
  .handler(async ({ data, context }) => {
    const settings = await context.supabase.rpc("recruitment_commission_settings");
    if (settings.error) throw new Error(settings.error.message);
    validateHiring(data, recruitmentSettings(settings.data));
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

export type PilotAircraft = {
  id: string; registration: string; location_icao: string; status: string; mode: "ROSTER" | "FREELANCE" | "PERSONAL";
  company_name: string; company_icao: string; commission_pct: number; type_id: string; model: string; tier: number; pax: number;
  range_nm: number; cruise_kts: number; minimum_runway_ft: number; rated: boolean; reserved_by_me: boolean; reserved_by_other: boolean; reserved_until: string | null;
};
export type PilotFlight = {
  id: string; flight_number: string; status: string; mode: PilotAircraft["mode"]; commission_pct: number | null; origin_icao: string; destination_icao: string;
  distance_nm: number; passengers: number; estimated_minutes: number; departed_at: string | null; completed_at: string | null; time_scale: number | null;
  net: number | null; registration: string; company_name: string;
  divert_state?: Json;
};
export type PilotStake = { id: string; company_name: string; icao_code: string; pct: number; price_paid: number; acquired_at: string; locked_until: string; current_value: number; next_dividend_at: string };
export type PilotOps = {
  career_role: string | null; type_ratings: number[]; balance: number; server_time: string; aircraft: PilotAircraft[]; flights: PilotFlight[];
  stakes: PilotStake[]; dividends_total: number; has_personal: boolean;
  personal_types: { id: string; model: string; tier: number; pax: number; range_nm: number; purchase_price: number }[];
};

export const getPilotOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("ensure_my_profile");
    const { data, error } = await context.supabase.rpc("pilot_operations");
    if (error) throw new Error(error.message);
    return data as unknown as PilotOps;
  });

export const pilotFlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    action: z.enum(["reserve", "release", "quote", "dispatch", "start", "settle", "cancel"]),
    aircraft: z.string().uuid().optional(), destination: z.string().trim().max(8).optional(),
    flightNumber: z.string().trim().max(12).optional(), flight: z.string().uuid().optional(),
  }))
  .handler(async ({ data, context }) => {
    const args: { p_action: string; p_aircraft?: string; p_destination?: string; p_flight_number?: string; p_flight?: string } = { p_action: data.action };
    if (data.aircraft) args.p_aircraft = data.aircraft;
    if (data.destination) args.p_destination = data.destination;
    if (data.flightNumber) args.p_flight_number = data.flightNumber;
    if (data.flight) args.p_flight = data.flight;
    const { data: result, error } = await context.supabase.rpc("pilot_flight_action", args);
    if (error) throw new Error(error.message);
    return result as unknown as Record<string, string | number | boolean | null>;
  });

export const getStakeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("stake_market");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const stakeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ action: z.enum(["buy", "sell", "offer"]), companyId: z.string().uuid().optional(), stakeId: z.string().uuid().optional(), pct: z.number().min(0).max(30).optional() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { error } = data.action === "buy"
      ? await db.rpc("buy_stake", { p_company: data.companyId!, p_pct: data.pct! })
      : data.action === "sell"
        ? await db.rpc("sell_stake", { p_stake: data.stakeId! })
        : await db.rpc("set_stake_offer", { p_pct: data.pct ?? 0 });
    if (error) throw new Error(error.message);
    return true;
  });

export const buyPersonalAircraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ type: z.string().min(1), registration: z.string().trim().max(10).optional() }))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("buy_personal_aircraft", data.registration ? { p_type: data.type, p_registration: data.registration } : { p_type: data.type });
    if (error) throw new Error(error.message);
    return id as string;
  });
