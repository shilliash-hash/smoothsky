import { describe, expect, it } from "vitest";
import { acarsOnline, maskKey, acarsLink, acarsGps, simulationControlsVisible } from "./acars-status";
describe("ACARS status", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("is online within two minutes", () => expect(acarsOnline("2026-11-19T11:58:30Z", now)).toBe(true));
  it("is offline after two minutes", () => expect(acarsOnline("2026-11-19T11:57:59Z", now)).toBe(false));
  it("is offline when never seen", () => expect(acarsOnline(null, now)).toBe(false));
  it("masks the key", () => expect(maskKey("ssk_abcdef1234567890")).toBe("ssk_ab••••••••••••7890"));
  it("allows resuming strictly before 20 minutes", () => {
    expect(acarsLink("2026-11-19T11:40:01Z", now).canResume).toBe(true);
    expect(acarsLink("2026-11-19T11:40:00Z", now).canResume).toBe(false);
  });
  it("reports 18 minutes remaining after two minutes offline", () => expect(acarsLink("2026-11-19T11:57:59Z", now).minutesLeft).toBe(18));
  it("uses exact GPS coordinates and heading, including zero", () => expect(acarsGps({ live: { lat: 63.457, lon: 10.924, heading: 0 } })).toEqual({ lat: 63.457, lon: 10.924, heading: 0 }));
  it("does not invent a position when GPS is absent or invalid", () => {
    expect(acarsGps(null)).toBeNull();
    expect(acarsGps({ live: { lat: 100, lon: 10, heading: 90 } })).toBeNull();
  });
  it("hides disabled simulation from players but keeps it visible to admins", () => {
    expect(simulationControlsVisible(false, false)).toBe(false);
    expect(simulationControlsVisible(false, true)).toBe(true);
    expect(simulationControlsVisible(true, false)).toBe(true);
  });
});
