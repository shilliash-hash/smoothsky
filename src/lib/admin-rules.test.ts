import { describe, expect, it } from "vitest";
import { fuelProjection, fuelCapacity, validateEconomyValue, aircraftSchema } from "./admin-rules";
describe("airport fuel and admin validation", () => {
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
