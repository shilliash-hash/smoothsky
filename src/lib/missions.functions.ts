import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMissionPreviewAirports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ codes: z.array(z.string().min(1).max(16)).max(200) }))
  .handler(async ({ data, context }) => {
    if (data.codes.length === 0) return [];
    const result = await context.supabase.from("airports")
      .select("icao, name, lat, lon, longest_runway_ft")
      .in("icao", [...new Set(data.codes)]).limit(200);
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });

export const getMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const refresh = await db.rpc("refresh_special_missions");
    if (refresh.error) throw new Error(refresh.error.message);
    const { data, error } = await db
      .from("special_missions")
      .select("*")
      .in("status", ["OPEN", "ACCEPTED", "COMPLETED"])
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return { missions: data ?? [], userId: context.userId, serverTime: Date.now() };
  });

export const acceptMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ mission: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("accept_special_mission", { p_mission: data.mission });
    if (error) throw new Error(error.message);
    return true;
  });

export const cancelMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ mission: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_special_mission", { p_mission: data.mission });
    if (error) throw new Error(error.message);
    return true;
  });
