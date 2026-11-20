import { describe, expect, it } from "vitest";
import { plannedFuel } from "./fleet-rules";

describe("pay-as-you-burn planning", () => {
  it("adds a 45-minute reserve without adding it to trip consumption", () => {
    expect(plannedFuel(18, 45, 12)).toEqual({ tripGallons: 18, reserveGallons: 9, plannedGallons: 27 });
  });
  it("uses an edited 60-minute reserve rather than a fixed 45 minutes", () => {
    expect(plannedFuel(18, 60, 12)).toEqual({ tripGallons: 18, reserveGallons: 12, plannedGallons: 30 });
  });
});