import type { Json } from "@/integrations/supabase/types";

function object(value: Json | null | undefined): { [key: string]: Json | undefined } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type DebriefFlight = {
  settlement: Json | null;
  estimate?: Json | null;
  telemetry?: Json | null;
  estimatedMinutes?: number;
  divertState?: Json | null;
};

// Compare frozen dispatch values, never live prices or tank uplift payments.
export function flightDebriefComparison(flight: DebriefFlight) {
  const final = object(flight.settlement);
  const divert = object(flight.divertState);
  const plan = object(divert["contract"] ?? flight.estimate);
  const budget = object(plan["weight_budget"]);
  const telemetry = object(flight.telemetry);
  const pirep = object(telemetry["pirep"]);
  const legs = Array.isArray(final["legs"]) ? final["legs"].map(object) : [];
  const sumLegs = (key: string) => legs.reduce((sum, leg) => sum + (number(leg[key]) ?? 0), 0);
  const plannedFuelGal = number(budget["trip_fuel_gal"]) ?? number(plan["fuel_gal"]);
  const billedLast = number(final["billed_fuel_gal"]) ?? number(final["fuel_gal"]);
  const actualLast = number(final["actual_fuel_used_gal"]) ?? billedLast;
  const actualFuelGal = actualLast === null || legs.some(leg => number(leg["actual_fuel_used_gal"]) === null) ? null : actualLast + sumLegs("actual_fuel_used_gal");
  const billedFuelGal = billedLast === null ? null : billedLast + legs.reduce((sum, leg) => sum + (number(leg["billed_fuel_gal"]) ?? number(leg["fuel_used_gal"]) ?? 0), 0);
  const plannedFuelCost = number(plan["fuel_cost"]);
  const finalCost = number(final["fuel_cost"]);
  const finalFuelCost = finalCost === null ? null : finalCost + sumLegs("fuel_cost");
  const estimatedNet = number(plan["net"]);
  const finalNet = number(final["net"]);
  const isPersistentTank = Object.hasOwn(final, "fuel_uplift_gal") || Object.hasOwn(object(flight.estimate), "fuel_uplift_gal");
  // Previous divert costs were already settled at the alternate airport.
  const priorLegCosts = sumLegs("fuel_cost") + sumLegs("landing_fee");
  const cashCreditedAtLanding = finalNet === null || (isPersistentTank && finalCost === null)
    ? null
    : finalNet + priorLegCosts + (isPersistentTank ? finalCost ?? 0 : 0);
  const reportedHours = number(pirep["flight_time_hours"]) ?? number(telemetry["flight_time_hours"]);
  const finalMinutes = reportedHours !== null ? reportedHours * 60 + sumLegs("minutes") : number(final["minutes"]) ?? flight.estimatedMinutes ?? null;
  const estimatedMinutes = number(plan["minutes"]) ?? flight.estimatedMinutes ?? null;
  const floorPct = number(final["fuel_billing_floor_pct"]);
  const floorApplied = actualLast !== null && billedLast !== null && billedLast - actualLast > 0.0001;
  const landingFee = number(final["landing_fee"]);
  return {
    plannedFuelGal, actualFuelGal, billedFuelGal, plannedFuelCost, finalFuelCost,
    fuelSavings: plannedFuelCost !== null && finalFuelCost !== null ? plannedFuelCost - finalFuelCost : null,
    estimatedNet, finalNet, isPersistentTank, cashCreditedAtLanding,
    netDelta: estimatedNet !== null && finalNet !== null ? finalNet - estimatedNet : null,
    finalMinutes, estimatedMinutes,
    minutesDelta: finalMinutes !== null && estimatedMinutes !== null ? finalMinutes - estimatedMinutes : null,
    floorApplied, floorPct,
    finalLandingFee: landingFee === null ? null : landingFee + sumLegs("landing_fee"),
  };
}