import { describe, expect, it } from "vitest";
import { validateEconomyValue } from "./admin-rules";

describe("dispatch timeout administration", () => {
  it("keeps the automatic recall timeout within 1–168 hours", () => {
    expect(validateEconomyValue("dispatch_timeout_hours", 3)).toBe(3);
    expect(() => validateEconomyValue("dispatch_timeout_hours", 0)).toThrow();
    expect(() => validateEconomyValue("dispatch_timeout_hours", 2.5)).toThrow();
  });

  it("keeps the ACARS freshness guard within 5–120 minutes", () => {
    expect(validateEconomyValue("dispatch_telemetry_grace_minutes", 30)).toBe(30);
    expect(() => validateEconomyValue("dispatch_telemetry_grace_minutes", 0)).toThrow();
    expect(() => validateEconomyValue("dispatch_telemetry_grace_minutes", 121)).toThrow();
  });
});
