import { describe, expect, it } from "vitest";
import { flightBriefing } from "./flight-briefing";

const weightBudget = { empty_weight_kg: 1000, mtow_kg: 1500, passenger_weight_kg: 80, planned_fuel_gal: 50, planned_fuel_kg: 135, fuel_kg_per_gal: 2.7, payload_kg: 280, takeoff_weight_kg: 1415, trip_fuel_gal: 30, reserve_fuel_gal: 15, fuel_billing_floor_pct: 0.8 };

describe("flight briefing snapshot", () => {
  it("shows the approved owned-aircraft tank plan with the uplift actually paid", () => {
    const b = flightBriefing({ estimate: { passengers: 3, cargo_kg: 40, weight_budget: weightBudget, tank: { persistent: true, current_fuel_gal: 10, target_fuel_gal: 50, added_fuel_gal: 40, uplift_cost: 300 }, initial_fuel_gal: 12, target_fuel_gal: 50, fuel_uplift_gal: 38, fuel_uplift_cost: 285, net: 420 } });
    expect(b.fuel.persistent).toBe(true);
    expect(b.fuel.initialFuelGal).toBe(12);
    expect(b.fuel.upliftGal).toBe(38);
    expect(b.fuel.upliftCost).toBe(285);
    expect(b.finance.net).toBe(420);
  });

  it("includes ACARS ramp fuel adjustments in target, uplift cost and takeoff weight", () => {
    const b = flightBriefing({ estimate: { passengers: 3, cargo_kg: 40, weight_budget: { ...weightBudget, planned_fuel_gal: 60, planned_fuel_kg: 162, takeoff_weight_kg: 1442 }, target_fuel_gal: 60, fuel_uplift_gal: 48, fuel_uplift_cost: 360, ramp_adjustments: [{ added_gal: 10, cost: 75, phase: "TAXI" }] } });
    expect(b.fuel.targetFuelGal).toBe(60);
    expect(b.fuel.rampAddedGal).toBe(10);
    expect(b.fuel.rampCost).toBe(75);
    expect(b.fuel.dispatchUpliftGal).toBe(38);
    expect(b.fuel.dispatchUpliftCost).toBe(285);
    expect(b.fuel.upliftCost).toBe(360);
    expect(b.weights?.takeoffWeightKg).toBe(1442);
    expect(b.weights?.remainingKg).toBe(58);
  });

  it("treats spot rentals as pay-as-you-burn with no uplift charge", () => {
    const b = flightBriefing({ estimate: { passengers: 2, weight_budget: weightBudget, tank: { persistent: false, current_fuel_gal: 0, target_fuel_gal: 50, added_fuel_gal: 50, uplift_cost: 0 } } });
    expect(b.fuel.persistent).toBe(false);
    expect(b.fuel.upliftGal).toBeNull();
    expect(b.fuel.upliftCost).toBeNull();
    expect(b.fuel.targetFuelGal).toBe(50);
  });

  it("computes takeoff weight as a share of MTOW", () => {
    const b = flightBriefing({ estimate: { passengers: 3, cargo_kg: 40, weight_budget: weightBudget } });
    expect(b.weights?.mtowPct).toBeCloseTo(94.33, 2);
    expect(b.weights?.payloadKg).toBe(280);
  });

  it("derives ticket revenue from total revenue minus cargo on older plans", () => {
    const b = flightBriefing({ estimate: { passengers: 4, revenue: 500, cargo_revenue: 120, cargo_kg: 50 } });
    expect(b.finance.ticketRevenue).toBe(380);
    expect(b.weights).toBeNull();
  });

  it("labels empty all-cargo flights as ferry and mission plans as missions", () => {
    expect(flightBriefing({ estimate: { passengers: 0, cargo_kg: 0, all_cargo: true } }).mode).toBe("ferry");
    expect(flightBriefing({ estimate: { passengers: 0, cargo_kg: 900, all_cargo: true } }).mode).toBe("cargo");
    expect(flightBriefing({ estimate: { passengers: 0, cargo_kg: 200, all_cargo: true, mission_category: "MEDEVAC" } }).mode).toBe("mission");
  });

  it("keeps the original contract visible on a continuation leg", () => {
    const b = flightBriefing({ estimate: { passengers: 3, net: -40 }, divertState: { airport: "ENBN", original_origin: "ENVA", contract: { passengers: 3, revenue: 900, net: 610 }, legs: [] } });
    expect(b.divert?.airport).toBe("ENBN");
    expect(b.divert?.contractRevenue).toBe(900);
    expect(b.divert?.contractNet).toBe(610);
  });
});
