import { describe, expect, it } from "vitest";
import { flightTransactionContext } from "./transaction-history";

describe("flight transaction identity", () => {
  const flight = { flight_number: "FJO101", registration: "SP-SHI", flight_id: "b3c94522-ccdd-4000-8000-000000000001", origin_icao: "EPGD", destination_icao: "EPBY", description: "Legacy description" };
  it("identifies a flight by number, registration and route instead of a technical hash", () => {
    expect(flightTransactionContext(flight)).toBe("FJO101 · SP-SHI · EPGD → EPBY");
  });
  it("does not fabricate a flight identity for non-flight entries", () => {
    expect(flightTransactionContext({ ...flight, flight_id: null })).toBeNull();
  });
});