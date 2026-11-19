import { describe, expect, it } from "vitest";
import { parseTiers, searchAirports, toggleTier } from "./airport-tiers";
const ap = (icao: string, size: number, iata: string | null = null, name = "Field") => ({ icao, iata, name, city: "X", size });
describe("airport tiers", () => {
  it("restores a saved selection without T1", () => expect(parseTiers("[2,3,4,5,6,7]")).toEqual([2,3,4,5,6,7]));
  it("falls back to all tiers for corrupt storage", () => expect(parseTiers("oops")).toEqual([1,2,3,4,5,6,7]));
  it("never leaves zero tiers selected", () => expect(toggleTier([3], 3)).toEqual([3]));
  it("exact ICAO match comes first", () => expect(searchAirports([ap("EPWAX", 7), ap("EPWA", 5)], "epwa", [1,2,3,4,5,6,7])[0]?.icao).toBe("EPWA"));
  it("exact IATA match comes first", () => expect(searchAirports([ap("EGLL", 7, "LHR"), ap("EPGD", 5, "GDN")], "gdn", [1,2,3,4,5,6,7])[0]?.icao).toBe("EPGD"));
  it("larger airports rank before small strips", () => expect(searchAirports([ap("EPXA", 1), ap("EPXB", 6)], "field", [1,2,3,4,5,6,7]).map(a => a.icao)).toEqual(["EPXB", "EPXA"]));
  it("hidden tiers are excluded", () => expect(searchAirports([ap("EPXA", 1)], "", [2,3])).toEqual([]));
});
