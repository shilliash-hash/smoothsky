import { describe, expect, it } from "vitest";
import { canOpenBase, canInvest, baseActionSchema } from "./bases-rules";
describe("FOB ownership and recovery", () => {
  it("allows one Main FOB", () => { expect(canOpenBase("MAIN", [])).toBe(true); expect(canOpenBase("MAIN", [{ base_type: "MAIN" }])).toBe(false); });
  it("allows at most two Satellite FOBs", () => { expect(canOpenBase("SATELLITE", [{ base_type: "MAIN" }, { base_type: "SATELLITE" }])).toBe(true); expect(canOpenBase("SATELLITE", [{ base_type: "MAIN" }, { base_type: "SATELLITE" }, { base_type: "SATELLITE" }])).toBe(false); });
  it("requires the Main FOB before satellites", () => expect(canOpenBase("SATELLITE", [])).toBe(false));
  it("blocks investments with overdue debt", () => { expect(canInvest("DELINQUENT")).toBe(false); expect(canInvest("INSOLVENT")).toBe(false); expect(canInvest("CONSTRAINED")).toBe(true); });
  it("requires explicit restructuring confirmation", () => { expect(baseActionSchema.safeParse({ action: "restructure", confirmation: "" }).success).toBe(false); expect(baseActionSchema.safeParse({ action: "restructure", confirmation: "RESTRUCTURE" }).success).toBe(true); });
});
import { fboScaledCost as scaledCost } from "./bases-rules";
describe("FBO size multipliers", () => {
  const m = [0.7, 0.85, 1, 1.25, 1.6, 2, 2.5];
  it("Size 3 keeps the base price", () => expect(scaledCost(5000, m, 3)).toBe(5000));
  it("Size 1 is 30% cheaper", () => expect(scaledCost(5000, m, 1)).toBe(3500));
  it("Size 7 costs 2.5x", () => expect(scaledCost(250, m, 7)).toBe(625));
});
