import { describe, expect, it } from "vitest";
import { DEFAULT_UNITS, formatVolume, formatWeight, parseUnitPreferences, pricePerVolume } from "./unit-preferences";

describe("unit preferences", () => {
  it("defaults to kg and US gallons for missing or corrupt storage", () => {
    expect(parseUnitPreferences(null)).toEqual(DEFAULT_UNITS);
    expect(parseUnitPreferences("{oops")).toEqual({ weight: "kg", volume: "gal" });
    expect(parseUnitPreferences('{"weight":"stone","volume":"pint"}')).toEqual({ weight: "kg", volume: "gal" });
  });
  it("restores a saved lbs / litres choice", () => {
    expect(parseUnitPreferences('{"weight":"lbs","volume":"ltr"}')).toEqual({ weight: "lbs", volume: "ltr" });
  });
  it("converts Commander 114TC MTOW 1424 kg to 3139 lbs", () => {
    expect(formatWeight(1424, "kg")).toBe("1,424 kg");
    expect(formatWeight(1424, "lbs")).toBe("3,139 lbs");
  });
  it("converts a full 70 gal tank to 265 litres", () => {
    expect(formatVolume(70, "gal")).toBe("70 gal");
    expect(formatVolume(70, "ltr")).toBe("265 ltr");
  });
  it("shows fuel price per litre as price per gallon divided by 3.785", () => {
    expect(pricePerVolume(7.77, "ltr")).toBeCloseTo(2.0526, 3);
    expect(pricePerVolume(7.77, "gal")).toBe(7.77);
  });
});
