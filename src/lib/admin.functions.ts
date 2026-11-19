import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { aircraftSchema, fuelRuleSchema, validateEconomyValue } from "./admin-rules";

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_admin");
    if (error) throw new Error(error.message);
    return Boolean(data);
  });
export const resetAirports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ confirmation: z.literal("RESET AIRPORTS") }))
  .handler(async ({ context }) => {
    const result = await context.supabase.rpc("reset_airports_state");
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const getAdminData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const access = await db.rpc("is_admin");
    if (access.error || !access.data) throw new Error("Administrator access required");
    const [economy, aircraft, users, fuel] = await Promise.all([
      db.from("economy_config").select("*").order("key"),
      db.from("aircraft_types").select("*").order("tier").order("id"),
      db.rpc("admin_players"),
      db.from("airport_fuel_rules").select("*").order("size").order("fuel_type"),
    ]);
    for (const result of [economy, aircraft, users, fuel])
      if (result.error) throw new Error(result.error.message);
    return {
      economy: economy.data ?? [],
      aircraft: aircraft.data ?? [],
      users: users.data ?? [],
      fuel: fuel.data ?? [],
    };
  });
export const saveAdminData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("economy"), key: z.string(), value: z.unknown() }),
      z.object({ kind: z.literal("aircraft"), create: z.boolean(), aircraft: aircraftSchema }),
      z.object({ kind: z.literal("fuel"), rule: fuelRuleSchema }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const access = await db.rpc("is_admin");
    if (access.error || !access.data) throw new Error("Administrator access required");
    if (data.kind === "economy") {
      const value = validateEconomyValue(data.key, data.value);
      if (data.key === "dissolve_min" || data.key === "dissolve_max") {
        const other = await db
          .from("economy_config")
          .select("value")
          .eq("key", data.key === "dissolve_min" ? "dissolve_max" : "dissolve_min")
          .single();
        if (other.error) throw new Error(other.error.message);
        if (
          data.key === "dissolve_min"
            ? Number(value) > Number(other.data.value)
            : Number(value) < Number(other.data.value)
        )
          throw new Error("Minimum dissolution cannot exceed maximum");
      }
      const result = await db
        .from("economy_config")
        .update({ value })
        .eq("key", data.key)
        .select("key")
        .single();
      if (result.error) throw new Error(result.error.message);
    } else if (data.kind === "aircraft") {
      const result = data.create
        ? await db.from("aircraft_types").insert(data.aircraft).select("id").single()
        : await db
            .from("aircraft_types")
            .update(data.aircraft)
            .eq("id", data.aircraft.id)
            .select("id")
            .single();
      if (result.error) throw new Error(result.error.message);
    } else {
      const result = await db
        .from("airport_fuel_rules")
        .update(data.rule)
        .eq("size", data.rule.size)
        .eq("fuel_type", data.rule.fuel_type)
        .select("size")
        .single();
      if (result.error) throw new Error(result.error.message);
    }
    return { saved: true };
  });
