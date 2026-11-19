import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getFleetOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const sync = await db.rpc("sync_lease_payments");
    if (sync.error) throw new Error(sync.error.message);
    const [fleet, contracts, rules] = await Promise.all([
      db.from("fleet_aircraft").select("*, type:aircraft_types(*)").order("leased_at"),
      db.from("lease_contracts").select("*").order("starts_at", { ascending: false }),
      db.from("operating_rules").select("*").single(),
    ]);
    if (fleet.error) throw new Error(fleet.error.message);
    if (contracts.error) throw new Error(contracts.error.message);
    if (rules.error) throw new Error(rules.error.message);
    return { fleet: fleet.data, contracts: contracts.data, rules: rules.data };
  });
export const leaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ action: z.enum(["sign", "renew", "return"]), aircraft: z.string().uuid().optional(), type: z.string().optional(), weeks: z.number().int().min(1).max(52) }))
  .handler(async ({ data, context }) => {
    if (data.action === "sign") {
      if (!data.type) throw new Error("Aircraft type required");
      const result = await context.supabase.rpc("sign_lease", { p_type: data.type, p_weeks: data.weeks });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
    if (!data.aircraft) throw new Error("Aircraft required");
    const result = await context.supabase.rpc("manage_lease", { p_aircraft: data.aircraft, p_action: data.action, p_weeks: data.weeks });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const getAircraftFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ aircraft: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("aircraft_finance", { p_aircraft: data.aircraft });
    if (result.error) throw new Error(result.error.message);
    return result.data as unknown as { ownership: string; asset_value: number; revenue: number; fuel: number; airport: number; handling: number; maintenance: number; lease_paid: number; lease_accrued: number; deposit: number; daily_lease: number; ends_at: string; term_weeks: number; weekly_rate: number; returned_at: string | null; flights: number };
  });
export const saveOperatingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ default_lease_weeks: z.number().int().min(1).max(52), renewal_discount: z.number().min(0).max(1), avgas_kg_per_litre: z.number().positive(), jeta_kg_per_litre: z.number().positive() }))
  .handler(async ({ data, context }) => {
    const access = await context.supabase.rpc("is_admin");
    if (access.error || !access.data) throw new Error("Administrator access required");
    const result = await context.supabase.from("operating_rules").update(data).eq("singleton", true).select().single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const purchaseAircraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ type: z.string(), registration: z.string().trim().max(12) }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("purchase_aircraft", { p_type: data.type, ...(data.registration ? { p_registration: data.registration } : {}) });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const getCompanyResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase.rpc("company_daily_results");
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const getRegistrationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase.from("registration_rules").select("*");
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });