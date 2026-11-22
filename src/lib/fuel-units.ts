export const LB_PER_KG = 2.20462262185;
export const LITRES_PER_GAL = 3.785411784;

/** SimBrief plan_ramp is a mass in the OFP weight unit; convert to US gallons with fuel density (kg per litre). */
export function simbriefRampToGallons(value: number, unit: "kgs" | "lbs", kgPerLitre: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(kgPerLitre) || kgPerLitre <= 0) return null;
  const kg = unit === "lbs" ? value / LB_PER_KG : value;
  return kg / (kgPerLitre * LITRES_PER_GAL);
}

export function simLoad(gal: number, kgPerLitre: number) {
  const kg = gal * LITRES_PER_GAL * kgPerLitre;
  return { gal, kg, lbs: kg * LB_PER_KG };
}
