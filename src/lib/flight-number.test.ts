import { describe, expect, it } from "vitest";
import { flightNumberSchema } from "./flight-number";

describe("dispatch flight number", () => {
  it("accepts the requested ICAO and sequence format FJO101", () => {
    expect(flightNumberSchema.parse("FJO101")).toBe("FJO101");
  });
  it("allows an empty override for automatic allocation", () => {
    expect(flightNumberSchema.parse(" ")).toBe("");
  });
  it("normalizes a player override", () => {
    expect(flightNumberSchema.parse(" fjo202 ")).toBe("FJO202");
  });
  it("rejects invalid identifiers before dispatch", () => {
    for (const value of ["1FJO", "FJ", "FJO-101", "FJO1234567890"]) {
      expect(flightNumberSchema.safeParse(value).success).toBe(false);
    }
  });
});