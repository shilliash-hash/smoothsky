import { describe, expect, it } from "vitest";
import { ACTIVE_OPERATION_STATUSES, dashboardRefreshKeys, newlyArrivedFlights } from "./dashboard-operations";

describe("dashboard operational synchronization", () => {
  const flight = { id: "rental", flight_number: "TEST101", destination_icao: "EPWA" };
  it("keeps diverted contracts among active operations", () => {
    expect(ACTIVE_OPERATION_STATUSES).toContain("DIVERTED");
    expect(ACTIVE_OPERATION_STATUSES).not.toContain("COMPLETED");
  });
  it("announces a completed continuation observed in flight", () => {
    expect(newlyArrivedFlights(new Map([[flight.id, "EN_ROUTE"]]), [{ ...flight, status: "COMPLETED" }])).toHaveLength(1);
  });
  it("does not announce historical or repeatedly polled arrivals", () => {
    expect(newlyArrivedFlights(new Map(), [{ ...flight, status: "COMPLETED" }])).toEqual([]);
    expect(newlyArrivedFlights(new Map([[flight.id, "COMPLETED"]]), [{ ...flight, status: "COMPLETED" }])).toEqual([]);
  });
  it("does not mislabel cancellation or another divert as an arrival", () => {
    expect(newlyArrivedFlights(new Map([[flight.id, "EN_ROUTE"]]), [{ ...flight, status: "CANCELLED" }, { ...flight, status: "DIVERTED" }])).toEqual([]);
  });
  it("refreshes returned rentals, authoritative balance and filtered history together", () => {
    const keys = dashboardRefreshKeys("test-company");
    expect(keys).toContainEqual(["fleet", "test-company"]);
    expect(keys).toContainEqual(["bases"]);
    expect(keys).toContainEqual(["ledger", "test-company"]);
    expect(keys).toContainEqual(["transaction-history", "test-company"]);
    expect(keys).toContainEqual(["fleet-overview"]);
    expect(keys).not.toContainEqual(["operational-board", "test-company"]);
  });
});