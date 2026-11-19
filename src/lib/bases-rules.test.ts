import { describe, expect, it } from "vitest";
import { canOpenBase, canInvest, baseActionSchema } from "./bases-rules";
describe("FOB ownership and recovery", () => {
  it("allows one Main FOB", () => { expect(canOpenBase("MAIN", [])).toBe(true); expect(canOpenBase("MAIN", [{ base_type: "MAIN" }])).toBe(false); });
  it("allows at most two Satellite FOBs", () => { expect(canOpenBase("SATELLITE", [{ base_type: "MAIN" }, { base_type: "SATELLITE" }])).toBe(true); expect(canOpenBase("SATELLITE", [{ base_type: "MAIN" }, { base_type: "SATELLITE" }, { base_type: "SATELLITE" }])).toBe(false); });
  it("requires the Main FOB before satellites", () => expect(canOpenBase("SATELLITE", [])).toBe(false));
  it("blocks investments with overdue debt", () => { expect(canInvest("DELINQUENT")).toBe(false); expect(canInvest("INSOLVENT")).toBe(false); expect(canInvest("CONSTRAINED")).toBe(true); });
  it("requires explicit restructuring confirmation", () => { expect(baseActionSchema.safeParse({ action: "restructure", confirmation: "" }).success).toBe(false); expect(baseActionSchema.safeParse({ action: "restructure", confirmation: "RESTRUCTURE" }).success).toBe(true); });
});