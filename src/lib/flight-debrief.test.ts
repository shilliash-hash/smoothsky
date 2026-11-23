import { describe, expect, it } from "vitest";
import { flightDebriefComparison } from "./flight-debrief";

describe("frozen flight debrief comparisons", () => {
  it("compares trip consumption, not full tanks or uplift payments", () => {
    const result = flightDebriefComparison({
      estimate: { weight_budget: { trip_fuel_gal: 193.1, planned_fuel_gal: 359 }, fuel_cost: 1120, fuel_uplift_cost: 0, net: 749.61 },
      settlement: { actual_fuel_used_gal: 150.5, billed_fuel_gal: 154.48, fuel_cost: 872.85, net: 996.76, fuel_billing_floor_pct: 0.8 },
    });
    expect(result.plannedFuelGal).toBe(193.1);
    expect(result.fuelSavings).toBeCloseTo(247.15);
    expect(result.netDelta).toBeCloseTo(247.15);
    expect(result.floorApplied).toBe(true);
    expect(result.floorPct).toBe(0.8);
  });

  it("includes landing tips in the final net delta without double counting", () => {
    const result = flightDebriefComparison({ estimate: { net: 749.61, fuel_cost: 1120 }, settlement: { net: 1020.52, passenger_tip: 23.76, fuel_cost: 872.85 } });
    expect(result.netDelta).toBeCloseTo(270.91);
    expect(result.fuelSavings).toBeCloseTo(247.15);
  });

  it("uses ACARS flight time instead of the estimated minutes copied into settlement", () => {
    const result = flightDebriefComparison({ estimate: { minutes: 99 }, settlement: { minutes: 99 }, telemetry: { pirep: { flight_time_hours: 1.79 } } });
    expect(result.finalMinutes).toBeCloseTo(107.4);
    expect(result.minutesDelta).toBeCloseTo(8.4);
  });

  it("preserves zero values and negative overburn savings", () => {
    const result = flightDebriefComparison({ estimate: { fuel_gal: 10, fuel_cost: 50, net: 0 }, settlement: { actual_fuel_used_gal: 12, billed_fuel_gal: 12, fuel_cost: 60, net: -10 } });
    expect(result.fuelSavings).toBe(-10);
    expect(result.estimatedNet).toBe(0);
    expect(result.netDelta).toBe(-10);
    expect(result.floorApplied).toBe(false);
  });

  it("uses billed trip consumption for manual flights without inventing savings", () => {
    const result = flightDebriefComparison({ estimate: { minutes: 99, fuel_gal: 193.1, fuel_cost: 1120, net: 749.61 }, settlement: { minutes: 99, actual_fuel_used_gal: null, billed_fuel_gal: 193.1, fuel_cost: 1120, net: 749.61 } });
    expect(result.actualFuelGal).toBe(193.1);
    expect(result.fuelSavings).toBe(0);
    expect(result.minutesDelta).toBe(0);
    expect(result.netDelta).toBe(0);
  });

  it("does not fabricate planned values for legacy flights", () => {
    const result = flightDebriefComparison({ settlement: { minutes: 60, fuel_cost: 100, net: 200 }, estimatedMinutes: 70 });
    expect(result.plannedFuelGal).toBeNull();
    expect(result.plannedFuelCost).toBeNull();
    expect(result.fuelSavings).toBeNull();
    expect(result.netDelta).toBeNull();
    expect(result.finalMinutes).toBe(60);
  });

  it("ignores invalid JSON and nonnumeric fields", () => {
    const result = flightDebriefComparison({ estimate: [], settlement: { net: "999", fuel_cost: null }, telemetry: { pirep: [] } });
    expect(result.finalNet).toBeNull();
    expect(result.finalMinutes).toBeNull();
    expect(result.floorApplied).toBe(false);
  });

  it("uses the frozen floor percentage, not a hardcoded 80 percent", () => {
    const result = flightDebriefComparison({ settlement: { actual_fuel_used_gal: 40, billed_fuel_gal: 50, fuel_billing_floor_pct: 0.5 } });
    expect(result.floorPct).toBe(0.5);
    expect(result.floorApplied).toBe(true);
  });

  it("compares the whole diverted journey against the original contract", () => {
    const result = flightDebriefComparison({
      estimate: { minutes: 30, fuel_cost: 90, net: 100 },
      divertState: { contract: { minutes: 90, fuel_gal: 60, fuel_cost: 300, net: 500 } },
      settlement: { minutes: 110, actual_fuel_used_gal: 20, billed_fuel_gal: 20, fuel_cost: 100, landing_fee: 10, net: 450, legs: [{ minutes: 70, fuel_used_gal: 40, fuel_cost: 200, landing_fee: 15 }] },
      telemetry: { pirep: { flight_time_hours: 2 / 3 } },
    });
    expect(result.estimatedMinutes).toBe(90);
    expect(result.finalMinutes).toBe(110);
    expect(result.actualFuelGal).toBeNull();
    expect(result.billedFuelGal).toBe(60);
    expect(result.finalFuelCost).toBe(300);
    expect(result.finalLandingFee).toBe(25);
    expect(result.fuelSavings).toBe(0);
    expect(result.netDelta).toBe(-50);
  });
});