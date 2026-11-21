import { z } from "zod";

export const baseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), airport: z.string().trim().min(2).max(12), type: z.enum(["MAIN", "SATELLITE"]) }),
  z.object({ action: z.literal("module"), base: z.string().uuid(), module: z.enum(["fuel", "handling", "maintenance"]) }),
  z.object({ action: z.literal("restructure"), confirmation: z.literal("RESTRUCTURE") }),
]);
export type FinancialHealth = { status: "HEALTHY" | "CONSTRAINED" | "DELINQUENT" | "INSOLVENT"; balance: number; weekly_obligations: number; debt: number; next_payment_due: string | null };
export const healthTone = { HEALTHY: "text-success", CONSTRAINED: "text-amber", DELINQUENT: "text-destructive", INSOLVENT: "text-destructive" };
export function canOpenBase(type: "MAIN" | "SATELLITE", bases: { base_type: string }[]) {
  return type === "MAIN" ? !bases.some(b => b.base_type === "MAIN") : bases.some(b => b.base_type === "MAIN") && bases.filter(b => b.base_type === "SATELLITE").length < 2;
}
export function canInvest(status: FinancialHealth["status"]) { return status === "HEALTHY" || status === "CONSTRAINED"; }
/** FBO base setup/upkeep multiplier for an airport size (1–7); Size 3 is the 1.00 baseline. Mirrors SQL fob_size_multiplier. */
export function fboSizeMultiplier(multipliers: unknown, size: number | null | undefined): number {
  if (!Array.isArray(multipliers) || size == null) return 1;
  const value = Number(multipliers[Math.min(7, Math.max(1, Math.round(size))) - 1]);
  return Number.isFinite(value) ? value : 1;
}
export function fboScaledCost(base: number, multipliers: unknown, size: number | null | undefined): number {
  return Math.round(base * fboSizeMultiplier(multipliers, size) * 100) / 100;
}
