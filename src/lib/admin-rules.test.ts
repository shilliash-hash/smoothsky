import { describe, expect, it } from "vitest";
import { fuelProjection, fuelCapacity, validateEconomyValue, aircraftSchema } from "./admin-rules";
describe("airport fuel and admin validation", () => {
  it("accepts a configurable 0.20 spot rental multiplier", () => {
    expect(validateEconomyValue("spot_rental_multiplier", 0.20)).toBe(0.20);
    expect(validateEconomyValue("spot_rental_multiplier", 0.25)).toBe(0.25);
  });
  it("limits the spot rental multiplier to 0.01–1.00", () => {
    for (const value of [0, -0.2, 1.01, NaN, Infinity, "0.20"]) expect(() => validateEconomyValue("spot_rental_multiplier", value)).toThrow();
    expect(validateEconomyValue("spot_rental_multiplier", 0.01)).toBe(0.01);
    expect(validateEconomyValue("spot_rental_multiplier", 1)).toBe(1);
  });
  it("FOB discounts cannot exceed 100%", () => {
    for (const key of ["fob_fuel_discount", "fob_handling_discount", "fob_maintenance_discount"]) {
      expect(() => validateEconomyValue(key, 1.1)).toThrow();
      expect(validateEconomyValue(key, 0.2)).toBe(0.2);
    }
  });
  it("accepts all seven configured charter rates", () =>
    expect(validateEconomyValue("charter_by_tier", [65, 50, 35, 20, 0, 0, 0])).toEqual([65, 50, 35, 20, 0, 0, 0]));
  it("rejects the obsolete four-tier charter configuration", () =>
    expect(() => validateEconomyValue("charter_by_tier", [65, 50, 35, 20])).toThrow());
  it("keeps the T5–7 charter rate shared", () =>
    expect(() => validateEconomyValue("charter_by_tier", [65, 50, 35, 20, 0, 1, 0])).toThrow());
  it("100LL refills 10% of capacity per hour", () =>
    expect(fuelProjection(200, 1000, 1, 0.1)).toBe(300));
  it("Jet-A1 refills 10% of capacity per hour", () =>
    expect(fuelProjection(1000, 5000, 1, 0.1)).toBe(1500));
  it("fuel refill caps at full", () => expect(fuelProjection(950, 1000, 1, 0.1)).toBe(1000));
  it("development scales configured fuel capacity", () =>
    expect(fuelCapacity(1000, 3, 0.25)).toBe(1500));
  it("airport fee multipliers have seven size entries", () =>
    expect(() => validateEconomyValue("airport_fee_multipliers", [1, 2, 3])).toThrow());
  it("lease rates cannot be negative", () =>
    expect(aircraftSchema.shape.weekly_rate.safeParse(-1).success).toBe(false));
  it("purchase prices cannot be negative", () =>
    expect(aircraftSchema.shape.purchase_price.safeParse(-1).success).toBe(false));
  it("a configured purchase price of 50000 SC is accepted", () =>
    expect(aircraftSchema.shape.purchase_price.parse(50000)).toBe(50000));
});
