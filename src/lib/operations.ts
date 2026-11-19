import { queryOptions } from "@tanstack/react-query";
import { getOperations } from "./operations.functions";
export const operationsQuery = queryOptions({
  queryKey: ["operations"],
  queryFn: () => getOperations(),
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
  fob_discounts?: { fuel: number; landing: number; handling_origin: number; handling_destination: number; maintenance: number; savings: number };
};
