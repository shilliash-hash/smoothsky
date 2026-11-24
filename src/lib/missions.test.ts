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

import { missionFleetFit } from "./missions";
describe("missionFleetFit", () => {
  const ac = (cargo: number, at: string, returned: string | null = null) => ({ returned_at: returned, location_icao: at, type: { cargo_kg: cargo } });
  it("blocks a 2,377 kg mission when the fleet maximum is 320 kg All-Cargo", () => {
    expect(missionFleetFit([ac(213, "EPGD")], 2377, "EPGD", 0.5)).toMatchObject({ capable: false, fleetMaxKg: 319, atOrigin: false, elsewhereIcao: null });
  });
  it("counts the All-Cargo bonus: 1,000 kg belly fits a 1,500 kg mission with +50%", () => {
    expect(missionFleetFit([ac(1000, "EPGD")], 1500, "EPGD", 0.5).capable).toBe(true);
  });
  it("flags repositioning when the capable aircraft is parked elsewhere", () => {
    expect(missionFleetFit([ac(2000, "EPWA")], 1500, "EPGD", 0.5)).toMatchObject({ capable: true, atOrigin: false, elsewhereIcao: "EPWA" });
  });
  it("ignores returned aircraft", () => {
    expect(missionFleetFit([ac(5000, "EPGD", "2026-01-01")], 1500, "EPGD", 0.5).capable).toBe(false);
  });
  it("can accept only with a capable aircraft available at the origin", () => {
    const fit = missionFleetFit([{ ...ac(1200, "LJPO"), registration: "SP-KMA", status: "AVAILABLE" }], 1500, "LJPO", 0.5);
    expect(fit).toMatchObject({ atOrigin: true, readyRegistration: "SP-KMA", readyKg: 1800 });
  });
  it("an aircraft at the origin that is busy does not allow accepting", () => {
    expect(missionFleetFit([{ ...ac(1200, "LJPO"), status: "IN_FLIGHT" }], 1500, "LJPO", 0.5).atOrigin).toBe(false);
  });
  it("a too-small aircraft at the origin does not allow accepting", () => {
    expect(missionFleetFit([ac(213, "LJPO"), ac(2000, "EPGD")], 1500, "LJPO", 0.5)).toMatchObject({ capable: true, atOrigin: false, elsewhereIcao: "EPGD" });
  });
});
