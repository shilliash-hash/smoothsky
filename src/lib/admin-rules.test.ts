import { describe, expect, it } from "vitest";
import { fuelProjection, fuelCapacity, validateEconomyValue, aircraftSchema } from "./admin-rules";
describe("airport fuel and admin validation", () => {
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
});
