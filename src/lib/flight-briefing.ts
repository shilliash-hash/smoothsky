import type { Json } from "@/integrations/supabase/types";
import { readDivertState } from "@/lib/divert";

type Obj = { [key: string]: Json | undefined };
const object = (value: Json | null | undefined): Obj => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const num = (value: Json | undefined): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const str = (value: Json | undefined): string | null => typeof value === "string" && value ? value : null;
const firstNum = (...values: (Json | undefined)[]) => { for (const v of values) { const n = num(v); if (n !== null) return n; } return null; };

export type FlightBriefingMode = "commercial" | "cargo" | "ferry" | "mission";

/**
 * Reads the plan frozen in flights.estimate at dispatch (plus server-side ramp fuel adjustments),
 * never live prices — the briefing must show exactly what was approved.
 */
export function flightBriefing({ estimate, divertState, passengers: fallbackPassengers, estimatedMinutes }: { estimate: Json | null | undefined; divertState?: Json | null; passengers?: number; estimatedMinutes?: number }) {
  const e = object(estimate);
  const wb = object(e["weight_budget"]);
  const tank = object(e["tank"]);
  const fob = object(e["fob_discounts"]);
  const market = object(e["fuel_market"]);
  const divert = readDivertState(divertState);

  const passengers = num(e["passengers"]) ?? fallbackPassengers ?? 0;
  const cargoKg = num(e["cargo_kg"]) ?? 0;
  const allCargo = e["all_cargo"] === true;
  const missionCategory = str(e["mission_category"]);
  const mode: FlightBriefingMode = missionCategory ? "mission" : passengers === 0 && cargoKg === 0 ? "ferry" : allCargo ? "cargo" : "commercial";

  // Weights — top-level target/weight_budget values include ramp adjustments made after dispatch.
  const passengerKg = num(wb["passenger_weight_kg"]);
  const emptyWeightKg = num(wb["empty_weight_kg"]);
  const mtowKg = num(wb["mtow_kg"]);
  const fuelKgPerGal = num(wb["fuel_kg_per_gal"]);
  const targetFuelGal = firstNum(e["target_fuel_gal"], wb["planned_fuel_gal"], tank["target_fuel_gal"]);
  const fuelKg = num(wb["planned_fuel_kg"]) ?? (targetFuelGal !== null && fuelKgPerGal !== null ? targetFuelGal * fuelKgPerGal : null);
  const payloadKg = num(wb["payload_kg"]) ?? (passengerKg !== null ? passengers * passengerKg + cargoKg : null);
  const takeoffWeightKg = num(wb["takeoff_weight_kg"]) ?? (emptyWeightKg !== null && fuelKg !== null && payloadKg !== null ? emptyWeightKg + fuelKg + payloadKg : null);
  const mtowPct = takeoffWeightKg !== null && mtowKg ? (takeoffWeightKg / mtowKg) * 100 : null;
  const remainingKg = takeoffWeightKg !== null && mtowKg !== null ? Math.max(0, mtowKg - takeoffWeightKg) : num(wb["remaining_payload_kg"]);

  // Fuel — owned/leased aircraft carry fuel_uplift_* keys written by the dispatch trigger.
  const persistent = Object.hasOwn(e, "fuel_uplift_gal") || tank["persistent"] === true;
  const rampAdjustments = (Array.isArray(e["ramp_adjustments"]) ? e["ramp_adjustments"] : []).map(object)
    .map(r => ({ addedGal: num(r["added_gal"]) ?? 0, cost: num(r["cost"]) ?? 0, phase: str(r["phase"]) }));
  const fuel = {
    persistent,
    fuelType: str(e["fuel_type"]) ?? str(market["fuel_type"]),
    initialFuelGal: persistent ? firstNum(e["initial_fuel_gal"], tank["current_fuel_gal"]) : null,
    targetFuelGal,
    upliftGal: persistent ? firstNum(e["fuel_uplift_gal"], tank["added_fuel_gal"]) : null,
    upliftCost: persistent ? firstNum(e["fuel_uplift_cost"], tank["uplift_cost"]) : null,
    pricePerGal: firstNum(e["fuel_uplift_price_per_gal"], tank["fuel_price_effective_per_gal"], e["fuel_price_per_gal"]),
    tripFuelGal: firstNum(wb["trip_fuel_gal"], e["fuel_gal"]),
    reserveFuelGal: num(wb["reserve_fuel_gal"]),
    billingFloorPct: num(wb["fuel_billing_floor_pct"]),
    rampAdjustments,
    rampAddedGal: rampAdjustments.reduce((s, r) => s + r.addedGal, 0),
    rampCost: rampAdjustments.reduce((s, r) => s + r.cost, 0),
  };
  // fuel_uplift_* already include ramp adjustments; split out what was bought at dispatch.
  const dispatchUpliftGal = fuel.upliftGal === null ? null : Math.max(0, fuel.upliftGal - fuel.rampAddedGal);
  const dispatchUpliftCost = fuel.upliftCost === null ? null : Math.max(0, fuel.upliftCost - fuel.rampCost);

  const revenue = num(e["revenue"]);
  const cargoRevenue = num(e["cargo_revenue"]) ?? 0;
  const ticketRevenue = num(e["ticket_revenue"]) ?? (revenue === null ? null : Math.max(0, revenue - cargoRevenue));
  const finance = {
    ticketRevenue, cargoRevenue, revenue,
    fuelCost: num(e["fuel_cost"]),
    landingFee: num(e["landing_fee"]),
    handlingFee: num(e["handling_fee"]),
    maintenance: num(e["maintenance"]),
    fboSavings: num(fob["savings"]) ?? 0,
    net: num(e["net"]),
  };

  return {
    hasPlan: Object.keys(e).length > 0,
    mode, missionCategory,
    distanceNm: num(e["distance_nm"]),
    minutes: num(e["minutes"]) ?? estimatedMinutes ?? null,
    payload: { passengers, passengerKg, cargoKg, payloadKg },
    weights: emptyWeightKg !== null && mtowKg !== null && fuelKg !== null && payloadKg !== null && takeoffWeightKg !== null
      ? { emptyWeightKg, mtowKg, fuelKg, payloadKg, takeoffWeightKg, mtowPct: mtowPct ?? 0, remainingKg: remainingKg ?? 0 }
      : null,
    fuelKgPerGal,
    fuel: { ...fuel, dispatchUpliftGal, dispatchUpliftCost },
    finance,
    divert: divert ? {
      airport: divert.airport,
      originalOrigin: divert.original_origin,
      contractRevenue: divert.contract.revenue,
      contractNet: num(object(divert.contract as Json)["net"]),
      deadlineAt: divert.deadline_at ?? null,
    } : null,
  };
}

export type FlightBriefing = ReturnType<typeof flightBriefing>;
