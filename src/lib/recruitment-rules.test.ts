import { describe, expect, it } from "vitest";
import { defaultRecruitment, recruitmentSchema, validateHiring } from "./recruitment-rules";

describe("configurable recruitment commissions", () => {
  it("accepts administrator-adjusted roster rates outside the old range", () => {
    const settings = recruitmentSchema.parse({ ...defaultRecruitment, roster: { min: 10, max: 60, default: 55 } });
    expect(validateHiring({ hiring: true, roster: 55, freelance: 25 }, settings).roster).toBe(55);
    expect(() => validateHiring({ hiring: true, roster: 61, freelance: 25 }, settings)).toThrow();
  });
  it("accepts administrator-adjusted freelance rates outside the old range", () => {
    const settings = recruitmentSchema.parse({ ...defaultRecruitment, freelance: { min: 5, max: 45, default: 40 } });
    expect(validateHiring({ hiring: true, roster: 40, freelance: 40 }, settings).freelance).toBe(40);
    expect(() => validateHiring({ hiring: true, roster: 40, freelance: 4 }, settings)).toThrow();
  });
  it("rejects a default outside its range", () => {
    expect(recruitmentSchema.safeParse({ ...defaultRecruitment, roster: { min: 10, max: 50, default: 60 } }).success).toBe(false);
  });
  it("rejects percentages above 100", () => {
    expect(recruitmentSchema.safeParse({ ...defaultRecruitment, freelance: { min: 0, max: 101, default: 25 } }).success).toBe(false);
  });
});