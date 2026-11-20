import { describe, expect, it } from "vitest";
import { operationalAirportCodes } from "./operations-airports";

describe("global radar airport coverage", () => {
  it("includes another company's active small airport without private flight records", () => {
    expect(operationalAirportCodes([{ icao: "SMALL", operations_7d: 2 }], ["HOME"]))
      .toEqual(["HOME", "SMALL"]);
  });
  it("keeps owner airports and does not load every inactive airport", () => {
    expect(operationalAirportCodes([
      { icao: "HOME", operations_7d: 1 },
      { icao: "IDLE", operations_7d: 0 },
    ], ["HOME", "DEST"])).toEqual(["HOME", "DEST"]);
  });
});