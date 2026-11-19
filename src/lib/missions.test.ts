import { describe, expect, it } from "vitest";
import { missionPayout } from "./missions";
describe("missionPayout", () => {
  const deadline = "2026-01-01T12:00:00Z";
  it("pays the full fixed payout on time", () => {
    expect(missionPayout(5000, deadline, Date.parse("2026-01-01T11:59:00Z"))).toEqual({ amount: 5000, late: false });
  });
  it("cuts the payout by 50% after the deadline", () => {
    expect(missionPayout(5000, deadline, Date.parse("2026-01-01T12:01:00Z"))).toEqual({ amount: 2500, late: true });
  });
});
