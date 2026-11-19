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
