import { describe, expect, it } from "vitest";
import { aircraftProfit, fuelMass, renewalRate } from "./fleet-rules";
describe("fleet economics", () => {
  it("discounts a renewal weekly rate by 5%", () => expect(renewalRate(1500, 0.05)).toBe(1425));
  it("includes daily lease allocation in aircraft profit", () => expect(aircraftProfit(100, 30, 1500 / 7)).toBeCloseTo(-144.285714));
  it("converts US gallons to fuel-specific kg and pounds", () => {
    expect(fuelMass(10, 0.72).kg).toBeCloseTo(27.2549648448);
    expect(fuelMass(10, 0.8).lb).toBeCloseTo(66.7632362);
  });
});