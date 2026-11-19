import { describe, it, expect } from "vitest";
import {
  distanceNm,
  inRange,
  flightPosition,
  projectedPassengers,
  estimatedCosts,
  flightProgress,
} from "./dispatch-engine";
const a = { lat: 50.0777, lon: 19.7848 },
  b = { lat: 52.1657, lon: 20.9671 };
const rules = { natural_cap: 0.95, hourly_rate: 0.01, transit_cap: 1.5 };
describe("flight economy and radar", () => {
  it("regenerates 1% per hour", () => expect(projectedPassengers(8, 80, 1, 0, rules)).toBe(8.8));
  it("caps natural regeneration at 95%", () =>
    expect(projectedPassengers(70, 80, 100, 0, rules)).toBe(76));
  it("burns idle transit at 1% per hour, not below 95%", () =>
    expect(projectedPassengers(100, 80, 100, 100, rules)).toBe(76));
  it("range filter uses nautical miles from aircraft location", () => {
    expect(distanceNm(a, b)).toBeCloseTo(133, 0);
    expect(inRange(a, b, 130)).toBe(false);
    expect(inRange(a, b, 140)).toBe(true);
  });
  it("great-circle progress starts and ends at airports", () => {
    expect(flightPosition(a, b, 0).lat).toBeCloseTo(a.lat, 4);
    expect(flightPosition(a, b, 1).lat).toBeCloseTo(b.lat, 4);
  });
  it("computes fuel from configured speed, burn and price", () =>
    expect(estimatedCosts(120, 120, 9, 2)).toEqual({ minutes: 60, fuel: 9, cost: 18 }));
  it("web flight uses configured time scale", () =>
    expect(
      flightProgress(
        {
          departed_at: "2026-11-19T00:00:00Z",
          estimated_minutes: 60,
          rules_snapshot: { simulation_time_scale: 60 },
        },
        Date.parse("2026-11-19T00:00:30Z"),
      ),
    ).toBe(0.5));
});
