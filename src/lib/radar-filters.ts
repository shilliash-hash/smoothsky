export const airportCategories = ["Civilian", "Military", "Grass strips"] as const;
export type AirportCategory = (typeof airportCategories)[number];
export function airportMatches(a: { classification_source: string; name: string; runway_surface: string | null; size: number }, categories: readonly AirportCategory[], tiers: readonly number[]) {
  const military = /military|air base|airbase|naval air|army air|raf |flughorst|air force/i.test(`${a.classification_source} ${a.name}`);
  const grass = /grass|turf|grs/i.test(a.runway_surface ?? "");
  return tiers.includes(a.size) && (categories.includes("Military") && military || categories.includes("Grass strips") && grass || categories.includes("Civilian") && !military);
}