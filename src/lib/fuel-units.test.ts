import { describe, expect, it } from "vitest";
import { simbriefRampToGallons, simLoad } from "./fuel-units";

describe("fuel units", () => {
  it("converts SimBrief kg ramp fuel to gallons", () => {
    expect(simbriefRampToGallons(1100, "kgs", 0.8)!).toBeCloseTo(363.24, 1);
  });
  it("converts SimBrief lbs ramp fuel to gallons", () => {
    expect(simbriefRampToGallons(2425.08, "lbs", 0.8)!).toBeCloseTo(363.24, 1);
  });
  it("rejects missing ramp fuel", () => {
    expect(simbriefRampToGallons(0, "kgs", 0.8)).toBeNull();
  });
  it("gives sim load in lbs and kg", () => {
    const s = simLoad(295, 0.8);
    expect(s.kg).toBeCloseTo(893.36, 1);
    expect(s.lbs).toBeCloseTo(1969.5, 0);
  });
});
