import { describe, expect, it } from "vitest";
import { acarsOnline, maskKey } from "./acars-status";
describe("ACARS status", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("is online within two minutes", () => expect(acarsOnline("2026-11-19T11:58:30Z", now)).toBe(true));
  it("is offline after two minutes", () => expect(acarsOnline("2026-11-19T11:57:59Z", now)).toBe(false));
  it("is offline when never seen", () => expect(acarsOnline(null, now)).toBe(false));
  it("masks the key", () => expect(maskKey("ssk_abcdef1234567890")).toBe("ssk_ab••••••••••••7890"));
});
