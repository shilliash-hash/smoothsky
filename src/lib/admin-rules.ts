import { z } from "zod";

export const aircraftSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_-]{2,20}$/),
  tier: z.number().int().min(1).max(4),
  manufacturer: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  pax: z.number().int().min(1).max(1000),
  cargo_kg: z.number().int().min(0),
  range_nm: z.number().int().positive(),
  cruise_kts: z.number().int().positive(),
  engine: z.string().trim().min(1),
  security_deposit: z.number().nonnegative(),
  weekly_rate: z.number().nonnegative(),
  purchase_price: z.number().nonnegative(),
  fuel_type: z.enum(["100LL", "Jet-A"]),
  fuel_burn_gph: z.number().positive(),
  fuel_capacity_gal: z.number().positive(),
  minimum_runway_ft: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type AircraftEdit = z.infer<typeof aircraftSchema>;
export function validateEconomyValue(key: string, value: unknown) {
  if (key === "web_simulation_enabled") return z.boolean().parse(value);
  if (["airport_capacities", "airport_fee_multipliers", "charter_by_tier"].includes(key)) {
    return z
      .array(key === "airport_capacities" ? z.number().positive() : z.number().nonnegative())
      .length(7)
      .refine((values) => key !== "charter_by_tier" || (values[4] === values[5] && values[5] === values[6]), "Tiers 5–7 must share the same charter surcharge")
      .parse(value);
  }
  const number = z.number().finite().nonnegative().parse(value);
  if (
    [
      "handling_rate",
      "hourly_rate",
      "initial_stock",
      "natural_cap",
      "dissolve_min",
      "dissolve_max",
    ].includes(key) &&
    number > 1
  )
    throw new Error("Fraction must be between 0 and 1");
  if (
    ["max_active_leases", "simulation_time_scale"].includes(key) &&
    (!Number.isInteger(number) || number < 1)
  )
    throw new Error("A positive integer is required");
  return number;
}
export const fuelRuleSchema = z.object({
  size: z.number().int().min(1).max(7),
  fuel_type: z.enum(["100LL", "Jet-A"]),
  capacity_gal: z.number().nonnegative(),
  development_multiplier: z.number().nonnegative(),
  refill_per_hour: z.number().min(0).max(1),
});
export function fuelProjection(stock: number, capacity: number, hours: number, rate: number) {
  return Math.max(0, Math.min(capacity, stock + capacity * rate * Math.max(0, hours)));
}
export function fuelCapacity(base: number, development: number, multiplier: number) {
  return base * (1 + multiplier * Math.max(0, development - 1));
}
