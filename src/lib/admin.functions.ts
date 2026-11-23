import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { aircraftSchema, assertAircraftMasses, fuelRuleSchema, validateEconomyValue } from "./admin-rules";
import { defaultRecruitment } from "./recruitment-rules";
import { DEFAULT_SPOT_RENTAL_MULTIPLIER } from "./market-rules";

const fuelVolatilitySetting = { key: "fuel_price_volatility_pct", value: 0.15, description: "Daily airport fuel price volatility (±fraction). 0 = fixed prices; 0.15 = ±15%. Changes at 00:00 UTC." };
const dispatchRangeSetting = { key: "dispatch_usable_range_pct", value: 0.75, description: "Dispatch destination discovery range fraction (0.75 = 75%). Planning buffer, not a simulator fuel guarantee." };

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
    const [economy, aircraft, users, fuel, supporters] = await Promise.all([
      db.from("economy_config").select("*").order("key"),
      db.from("aircraft_types").select("*").order("tier").order("id"),
      db.rpc("admin_players"),
      db.from("airport_fuel_rules").select("*").order("size").order("fuel_type"),
      db.rpc("admin_company_supporters"),
    ]);
    for (const result of [economy, aircraft, users, fuel, supporters])
      if (result.error) throw new Error(result.error.message);
    return {
      viewerUserId: context.userId,
      economy: [...(economy.data ?? []), ...(economy.data?.some(row => row.key === fuelVolatilitySetting.key) ? [] : [fuelVolatilitySetting]), ...(economy.data?.some(row => row.key === dispatchRangeSetting.key) ? [] : [dispatchRangeSetting]), ...(economy.data?.some(row => row.key === "recruitment_commissions") ? [] : [{ key: "recruitment_commissions", value: defaultRecruitment, description: "Pilot commission as a percentage of net flight profit." }]), ...(economy.data?.some(row => row.key === "spot_rental_multiplier") ? [] : [{ key: "spot_rental_multiplier", value: DEFAULT_SPOT_RENTAL_MULTIPLIER, description: "Single-flight rental as a fraction of the weekly rate (0.20 = 20%). No deposit or weekly commitments." }])],
      aircraft: aircraft.data ?? [],
      users: (users.data ?? []).map(user => {
        const company = supporters.data?.find(row => row.user_id === user.user_id);
        return { ...user, company_id: company?.company_id, is_supporter: company?.is_supporter ?? false };
      }),
      fuel: fuel.data ?? [],
    };
  });
export const resetAdminCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ companyId: z.string().uuid(), confirmation: z.literal("RESET") }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("admin_reset_company", { p_company_id: data.companyId });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const deleteAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), confirmation: z.literal("DELETE") }))
  .handler(async ({ data, context }) => {
    const access = await context.supabase.rpc("is_admin");
    if (access.error || !access.data) throw new Error("Administrator access required");
    if (data.userId === context.userId) throw new Error("Cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (target.error || !target.data.user) throw new Error("Player account not found. Refresh the list.");
    const cleanup = await context.supabase.rpc("admin_delete_user_and_company", { p_user_id: data.userId });
    if (cleanup.error) throw new Error(cleanup.error.message);
    const deleted = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleted.error) {
      console.error("Account identity deletion failed after application cleanup", deleted.error.code);
      throw new Error("Game data was removed, but the sign-in account could not be deleted. Retry Delete to finish.");
    }
    return { deleted: true };
  });
export const saveAdminData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("economy"), key: z.string(), value: z.unknown() }),
      z.object({ kind: z.literal("aircraft"), create: z.boolean(), aircraft: aircraftSchema }),
      z.object({ kind: z.literal("fuel"), rule: fuelRuleSchema }),
      z.object({ kind: z.literal("supporter"), company: z.string().uuid(), supporter: z.boolean() }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const access = await db.rpc("is_admin");
    if (access.error || !access.data) throw new Error("Administrator access required");
    if (data.kind === "economy") {
      const value = validateEconomyValue(data.key, data.value);
      if (data.key === fuelVolatilitySetting.key) {
        const result = await db.from("economy_config").upsert({ ...fuelVolatilitySetting, value }, { onConflict: "key" });
        if (result.error) throw new Error(result.error.message);
        return { saved: true };
      }
      if (data.key === dispatchRangeSetting.key) {
        const result = await db.from("economy_config").upsert({ ...dispatchRangeSetting, value }, { onConflict: "key" });
        if (result.error) throw new Error(result.error.message);
        return { saved: true };
      }
      if (data.key === "spot_rental_multiplier") {
        const result = await db.from("economy_config").upsert({ key: data.key, value, description: "Single-flight rental as a fraction of the weekly rate (0.20 = 20%). No deposit or weekly commitments." }, { onConflict: "key" });
        if (result.error) throw new Error(result.error.message);
        return { saved: true };
      }
      if (data.key === "recruitment_commissions") {
        const result = await db.from("economy_config").upsert({ key: data.key, value, description: "Pilot commission as a percentage of net flight profit." }, { onConflict: "key" });
        if (result.error) throw new Error(result.error.message);
        return { saved: true };
      }
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
      assertAircraftMasses(data.aircraft);
      const result = data.create
        ? await db.from("aircraft_types").insert(data.aircraft).select("id").single()
        : await db
            .from("aircraft_types")
            .update(data.aircraft)
            .eq("id", data.aircraft.id)
            .select("id")
            .single();
      if (result.error) throw new Error(result.error.message);
    } else if (data.kind === "supporter") {
      const result = await db.rpc("set_company_supporter", { p_company: data.company, p_supporter: data.supporter });
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
