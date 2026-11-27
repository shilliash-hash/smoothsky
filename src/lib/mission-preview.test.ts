import { describe, expect, it } from "vitest";
import { findNearestFittingAircraft, type PreviewAircraft, type MissionAirport } from "./mission-preview";

const airports: MissionAirport[] = [
  { icao: "ORIG", name: "Origin", lat: 0, lon: 0, longest_runway_ft: null },
  { icao: "NEAR", name: "Near", lat: 0, lon: 1, longest_runway_ft: null },
  { icao: "FAR", name: "Far", lat: 0, lon: 3, longest_runway_ft: null },
];
const now = Date.parse("2026-11-27T17:21:00Z");
const mission = { category: "AOG", cargo_kg: 1500, origin_icao: "ORIG" };
const aircraft = (id: string, location: string, changes: Partial<PreviewAircraft> = {}): PreviewAircraft => ({
  id, registration: `SP-${id}`, location_icao: location, status: "AVAILABLE", returned_at: null,
  type: { cargo_kg: 1000, pax: 10 }, ...changes,
});

describe("mission preview aircraft ranking", () => {
  it("selects the nearest fitting aircraft and computes ferry NM", () => {
    const result = findNearestFittingAircraft([aircraft("FAR", "FAR"), aircraft("NEAR", "NEAR")], mission, airports, 0.5, now);
    expect(result.nearest?.aircraft.registration).toBe("SP-NEAR");
    expect(result.nearest?.ferryNm).toBeCloseTo(60.04, 1);
  });
  it("reports zero ferry for an aircraft parked at origin even without coordinates", () => {
    expect(findNearestFittingAircraft([aircraft("HOME", "ORIG")], mission, [], 0.5, now).nearest?.ferryNm).toBe(0);
  });
  it("excludes returned aircraft and reports no matching fleet", () => {
    expect(findNearestFittingAircraft([aircraft("OLD", "ORIG", { returned_at: "2026-11-26" })], mission, airports, 0.5, now).capable).toBe(false);
  });
  it("uses All-Cargo capacity for AOG but not charter baggage", () => {
    const fleet = [aircraft("FIT", "ORIG")];
    expect(findNearestFittingAircraft(fleet, mission, airports, 0.5, now).capable).toBe(true);
    expect(findNearestFittingAircraft(fleet, { ...mission, category: "CHARTER", passengers: 6 }, airports, 0.5, now).capable).toBe(false);
  });
  it("requires enough seats for the whole charter party", () => {
    expect(findNearestFittingAircraft([aircraft("SMALL", "ORIG")], { ...mission, category: "CHARTER", passengers: 14, cargo_kg: 250 }, airports, 0.5, now).capable).toBe(false);
  });
  it.each([
    { status: "EN_ROUTE" },
    { reserved_by: "pilot", reserved_until: "2026-11-27T18:00:00Z" },
    { maintenance_status: "AOG" },
    { maintenance_status: "MAJOR_DEFECT" },
  ])("prefers an available aircraft over a closer unavailable one: %j", changes => {
    const result = findNearestFittingAircraft([aircraft("BUSY", "ORIG", changes), aircraft("READY", "NEAR")], mission, airports, 0.5, now);
    expect(result.nearest?.aircraft.id).toBe("READY");
    expect(result.nearest?.available).toBe(true);
  });
  it("does not label a busy aircraft at origin as ready", () => {
    expect(findNearestFittingAircraft([aircraft("BUSY", "ORIG", { status: "DISPATCHED" })], mission, airports, 0.5, now).nearest?.available).toBe(false);
  });
  it("keeps missing ferry coordinates unknown instead of inventing zero", () => {
    const result = findNearestFittingAircraft([aircraft("UNKNOWN", "MISSING")], mission, airports, 0.5, now);
    expect(result.nearest?.ferryNm).toBeNull();
    expect(result.incompleteLocations).toBe(true);
  });
});