import { z } from "zod";

export const flightNumberSchema = z.string().trim().toUpperCase().refine(
  (value) => value === "" || /^[A-Z][A-Z0-9]{2,11}$/.test(value),
  "Flight number must contain 3–12 letters or digits and start with a letter",
);