import { describe, expect, it } from "vitest";
import { parseSimbriefRoute, splitRouteAtPosition } from "./route-waypoints";

describe("SimBrief route parsing", () => {
  it("builds origin → fixes → destination and skips bad coordinates", () => {
    const route = parseSimbriefRoute({
      origin: { icao_code: "EPWA", pos_lat: "52.16570", pos_long: "20.96710" },
      destination: { icao_code: "EDDB", pos_lat: "52.3514", pos_long: "13.4939" },
      navlog: { fix: [
        { ident: "TOC", pos_lat: "52.2", pos_long: "19.5", via_airway: "DCT", altitude_feet: "34000", type: "ltlg" },
        { ident: "BAD", pos_lat: "x", pos_long: "1" },
        { ident: "EDDB", pos_lat: "52.3514", pos_long: "13.4939" },
      ] },
    });
    expect(route?.map(p => p.ident)).toEqual(["EPWA", "TOC", "EDDB"]);
    expect(route?.[0]?.lat).toBe(52.1657);
    expect(route?.[1]?.alt).toBe(34000);
  });
  it("accepts a single navlog fix object", () => {
    const r = parseSimbriefRoute({ origin: { icao_code: "A", pos_lat: 1, pos_long: 1 }, destination: { icao_code: "B", pos_lat: 2, pos_long: 2 }, navlog: { fix: { ident: "X", pos_lat: 1.5, pos_long: 1.5 } } });
    expect(r).toHaveLength(3);
  });
  it("splits the route at the aircraft", () => {
    const pts = [{ ident: "A", lat: 0, lon: 0 }, { ident: "B", lat: 0, lon: 10 }, { ident: "C", lat: 0, lon: 20 }];
    const s = splitRouteAtPosition(pts, { lat: 0, lon: 12 });
    expect(s.flown).toEqual([[0, 0], [0, 10], [0, 12]]);
    expect(s.planned).toEqual([[0, 12], [0, 20]]);
  });
});
