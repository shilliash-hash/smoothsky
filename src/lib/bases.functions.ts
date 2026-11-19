import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { baseActionSchema, type FinancialHealth } from "./bases-rules";

export const getBases = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = context.supabase;
  const sync = await db.rpc("process_due_obligations");
  if (sync.error) throw new Error(sync.error.message);
  const [bases, health] = await Promise.all([db.from("company_fobs").select("*, airport:airports(*)").is("closed_at", null).order("created_at"), db.rpc("company_financial_health")]);
  if (bases.error) throw new Error(bases.error.message);
  if (health.error) throw new Error(health.error.message);
  return { bases: bases.data, health: health.data as unknown as FinancialHealth | null };
});
export const baseAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(baseActionSchema).handler(async ({ data, context }) => {
  const result = data.action === "restructure" ? await context.supabase.rpc("restructure_company") : await context.supabase.rpc("manage_fob", data.action === "open" ? { p_action: "open", p_airport: data.airport, p_type: data.type } : { p_action: "module", p_base: data.base, p_module: data.module });
  if (result.error) throw new Error(result.error.message);
  return result.data;
});