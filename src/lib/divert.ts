import { z } from "zod";

const schema = z.object({
  airport: z.string(),
  original_origin: z.string(),
  deadline_at: z.string().nullable().optional(),
  contract: z.object({ passengers: z.number(), cargo_kg: z.number().optional(), revenue: z.number() }).passthrough(),
  legs: z.array(z.object({ origin: z.string(), destination: z.string(), fuel_cost: z.number(), landing_fee: z.number(), minutes: z.number() }).passthrough()),
}).passthrough();

export function readDivertState(value: unknown) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}