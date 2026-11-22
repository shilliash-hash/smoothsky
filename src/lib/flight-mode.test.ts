import { describe, expect, it } from "vitest";
import { canDispatchPayload, commercialRangeError, flightModePayload, flightModeRange } from "./flight-mode";

describe("explicit flight modes", () => {
  it("Commercial keeps passengers enabled and permits zero belly cargo", () => {
    expect(flightModePayload("commercial", 0, 350)).toEqual({ allCargo: false, cargoKg: 0 });
  });
  it("All-Cargo starts at 10 kg rather than silently becoming Ferry", () => {
    expect(flightModePayload("cargo", 0, 525)).toEqual({ allCargo: true, cargoKg: 10 });
  });
  it("Ferry clears all previously selected freight", () => {
    expect(flightModePayload("ferry", 350, 525)).toEqual({ allCargo: true, cargoKg: 0 });
  });
  it("changing back to Commercial clamps freight to belly capacity", () => {
    expect(flightModePayload("commercial", 525, 350)).toEqual({ allCargo: false, cargoKg: 350 });
  });
  it("commercial modes use 75% while Ferry uses 100% of 1500 NM", () => {
    expect(flightModeRange("commercial", 1500, 0.75)).toBe(1125);
    expect(flightModeRange("cargo", 1500, 0.75)).toBe(1125);
    expect(flightModeRange("ferry", 1500, 0.75)).toBe(1500);
  });
  it("range responds to the administrator's live setting", () => {
    expect(flightModeRange("commercial", 1500, 0.7)).toBe(1050);
    expect(flightModeRange("ferry", 1500, 0.7)).toBe(1500);
  });
  it("only Ferry allows an empty dispatch", () => {
    expect(canDispatchPayload("ferry", 0, 0)).toBe(true);
    expect(canDispatchPayload("commercial", 0, 0)).toBe(false);
    expect(canDispatchPayload("cargo", 0, 0)).toBe(false);
    expect(canDispatchPayload("cargo", 0, 10)).toBe(true);
    expect(canDispatchPayload("ferry", 1, 0)).toBe(false);
  });
  it("offers range recovery only for commercial range failures", () => {
    expect(commercialRangeError("Route exceeds usable payload range (1125 NM).")).toBe(true);
    expect(commercialRangeError("Flight exceeds commercial payload range (1125 NM).")).toBe(true);
    expect(commercialRangeError("Insufficient airport fuel stock")).toBe(false);
    expect(commercialRangeError("Ferry flight exceeds aircraft range (1500 NM)")).toBe(false);
  });
});