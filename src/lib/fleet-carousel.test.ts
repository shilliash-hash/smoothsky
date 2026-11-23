import { describe, it, expect } from "vitest";
import { arrangeFleet } from "./fleet-carousel";
const f = [{ id: "1", status: "RESERVED", registration: "A" }, { id: "2", status: "AVAILABLE", registration: "B" }, { id: "3", status: "EN_ROUTE", registration: "C" }];
describe("fleet carousel", () => {
  it("puts airborne first, then available", () => expect(arrangeFleet(f, "all", new Set()).map(x => x.id)).toEqual(["3", "2", "1"]));
  it("For Sale shows only listed aircraft", () => expect(arrangeFleet(f, "sale", new Set(["2"])).map(x => x.id)).toEqual(["2"]));
  it("keeps a diverted aircraft actionable ahead of airborne aircraft, never available", () => {
    const fleet = [...f, { id: "divert", status: "DIVERTED", registration: "D" }];
    expect(arrangeFleet(fleet, "flight", new Set()).map(x => x.id)).toEqual(["divert", "3"]);
    expect(arrangeFleet(fleet, "available", new Set()).map(x => x.id)).toEqual(["2"]);
  });
});
