import { describe, expect, it } from "vitest";
import { STARTING_CAPITAL, MAX_LEASES, canAffordLease, isValidCompanyCode, leaseUpfrontCost } from "./rules";

describe("economy rules", () => {
  it("starting capital is 50 000 Cr", () => expect(STARTING_CAPITAL).toBe(50000));
  it("max 3 leases", () => expect(MAX_LEASES).toBe(3));
  it("company code must be exactly 3 letters", () => {
    expect(isValidCompanyCode("sso")).toBe(true);
    expect(isValidCompanyCode("SS")).toBe(false);
    expect(isValidCompanyCode("SS1")).toBe(false);
    expect(isValidCompanyCode("SSOX")).toBe(false);
  });
  it("lease needs deposit + first weekly payment", () => {
    const kingAir = { security_deposit: 35000, weekly_rate: 9500 };
    expect(leaseUpfrontCost(kingAir)).toBe(44500);
    expect(canAffordLease(44499, kingAir)).toBe(false);
    expect(canAffordLease(50000, kingAir)).toBe(true);
  });
});
