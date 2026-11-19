import { describe, expect, it } from "vitest";
import { logbookResult } from "./logbook";

describe("completed flight logbook", () => {
  it("shows one simulated hour from settled minutes rather than accelerated wall-clock time", () => {
    expect(logbookResult({ estimated_minutes: 50, settlement: { minutes: 60, net: 189.6 } })).toEqual({ hours: 1, net: 189.6 });
  });
  it("retains a flight loss rather than showing the estimated profit", () => {
    expect(logbookResult({ estimated_minutes: 30, settlement: { minutes: 30, net: -20 } }).net).toBe(-20);
  });
  it("uses planned flight time for legacy records without settled minutes", () => {
    expect(logbookResult({ estimated_minutes: 90, settlement: { net: 0 } })).toEqual({ hours: 1.5, net: 0 });
  });
  it("does not invent profit for a missing settlement", () => {
    expect(logbookResult({ estimated_minutes: 60, settlement: null }).net).toBeNull();
  });
});