import { z } from "zod";

const commissionRange = z.object({
  min: z.number().finite().min(0).max(100),
  max: z.number().finite().min(0).max(100),
  default: z.number().finite().min(0).max(100),
}).refine(r => r.min <= r.default && r.default <= r.max, "Default must be within the commission range");
export const recruitmentSchema = z.object({ roster: commissionRange, freelance: commissionRange });
export const defaultRecruitment = recruitmentSchema.parse({
  roster: { min: 35, max: 50, default: 40 },
  freelance: { min: 20, max: 30, default: 25 },
});
export function recruitmentSettings(value: unknown) {
  return recruitmentSchema.parse(value ?? defaultRecruitment);
}
export const hiringSchema = z.object({ hiring: z.boolean(), roster: z.number().finite().min(0).max(100), freelance: z.number().finite().min(0).max(100) });
export function validateHiring(value: z.infer<typeof hiringSchema>, settings: z.infer<typeof recruitmentSchema>) {
  const data = hiringSchema.parse(value);
  for (const mode of ["roster", "freelance"] as const) {
    if (data[mode] < settings[mode].min || data[mode] > settings[mode].max)
      throw new Error(`${mode === "roster" ? "Roster" : "Freelance"} commission must be ${settings[mode].min}–${settings[mode].max}%`);
  }
  return data;
}