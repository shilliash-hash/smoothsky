import { describe, expect, it } from "vitest";
import { flightTransactionContext } from "./transaction-history";

describe("flight transaction identity", () => {
  const flight = { registration: "SP-SHI", flight_id: "b3c94522-ccdd-4000-8000-000000000001", origin_icao: "EPGD", destination_icao: "EPBY", description: "Legacy description" };
  it("identifies a flight by registration, route and the first eight ID characters", () => {
    expect(flightTransactionContext(flight)).toBe("SP-SHI · EPGD → EPBY (#b3c94522)");
  });
  it("does not fabricate a flight identity for non-flight entries", () => {
    expect(flightTransactionContext({ ...flight, flight_id: null })).toBeNull();
  });
});