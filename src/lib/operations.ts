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
export type CorridorSaturation = {
  version: number;
  applied?: boolean;
  window_hours: number;
  pax: {
    factor: number;
    corridor_flown: number;
    feeder_credit: number;
    effective_excess: number;
    floor_pct: number;
    floor_reached: boolean;
  };
  cargo: {
    factor: number;
    corridor_flown_kg: number;
    feeder_credit_kg: number;
    effective_excess_kg: number;
    floor_pct: number;
    floor_reached: boolean;
  };
};
export type Quote = {
  distance_nm: number;
  minutes: number;
  passengers: number;
  payload_limits?: { max_passengers: number; max_cargo_kg: number; ticket_unit_revenue: number; cargo_unit_revenue: number; handling_rate_effective: number };
  revenue: number;
  short_hop_charter?: CharterSnapshot;
  demand?: DemandSnapshot;
  saturation?: CorridorSaturation;
  runway_unpaved?: boolean;
  rules: { fare_per_nm: number; charter_by_tier: number[] };
  fuel_gal: number;
  fuel_cost: number;
  fuel_market?: { utc_date: string; fuel_type: string; departure_icao: string; destination_icao: string; departure_price: number; destination_price: number; departure_deviation_pct: number; destination_deviation_pct: number; departure_fbo_discount: number; destination_fbo_discount: number; destination_fuel_available: boolean; destination_stock_gal: number; tankering_savings_per_gal: number };
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
