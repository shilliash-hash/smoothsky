import { describe, expect, it } from "vitest";
import { askingPriceBand, depreciatedValue, pctVsNew } from "./used-market-rules";

const rules = { depreciation_pct_per_100h: 2, depreciation_floor_pct: 30 };

describe("used aircraft depreciation", () => {
  it("new aircraft keeps full catalogue price", () => expect(depreciatedValue(380000, 0, rules)).toBe(380000));
  it("loses 2% per 100 airframe hours", () => expect(depreciatedValue(380000, 1000, rules)).toBe(304000));
  it("never drops below the 30% floor", () => expect(depreciatedValue(380000, 12000, rules)).toBe(114000));
  it("player asking price band is 75%–125% of current value", () => expect(askingPriceBand(100000)).toEqual({ min: 75000, max: 125000 }));
  it("shows discount vs new", () => expect(pctVsNew(304000, 380000)).toBe(-20));
});
