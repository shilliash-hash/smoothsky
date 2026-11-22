import { queryOptions } from "@tanstack/react-query";
import { getOperations } from "./operations.functions";
import type { CharterSnapshot, DemandSnapshot } from "./dispatch-engine";
export const operationsQuery = queryOptions({
  queryKey: ["operations"],
  queryFn: async () => {
    const r = await getOperations();
    if (!r) throw new Error("Operations data unavailable");
    return r;
  },
  staleTime: 15000,
  refetchInterval: 15000,
});
export type Operations = Awaited<ReturnType<typeof getOperations>>;
export type Airport = Operations["airports"][number];
export type Flight = Operations["flights"][number];
export type Quote = {
  distance_nm: number;
  minutes: number;
  passengers: number;
  revenue: number;
  short_hop_charter?: CharterSnapshot;
  demand?: DemandSnapshot;
  runway_unpaved?: boolean;
  rules: { fare_per_nm: number; charter_by_tier: number[] };
  fuel_gal: number;
  fuel_cost: number;
  landing_fee: number;
  handling_fee: number;
  maintenance: number;
  net: number;
  cargo_kg?: number;
  cargo_capacity_kg?: number;
  cargo_revenue?: number;
  ticket_revenue?: number;
  all_cargo?: boolean;
  mission_category?: string;
  weight_budget?: { empty_weight_kg: number; mtow_kg: number; trip_fuel_gal: number; reserve_fuel_gal: number; planned_fuel_kg: number; available_payload_kg: number; passenger_weight_kg: number; fuel_billing_floor_pct: number; landing_fee_per_ton_mtow: number; payload_kg?: number; takeoff_weight_kg?: number; remaining_payload_kg?: number; planned_fuel_gal?: number; min_safe_fuel_gal?: number; fuel_capacity_gal?: number; fuel_kg_per_gal?: number };
  tank?: { persistent: boolean; current_fuel_gal: number; min_target_gal: number; target_fuel_gal: number; max_target_gal: number; added_fuel_gal: number; uplift_cost: number; fuel_price_effective_per_gal: number };
   fob_discounts?: { fuel: number; landing: number; handling_origin: number; handling_destination: number; handling_discount?: number; handling_savings?: number; maintenance: number; savings: number };
};
