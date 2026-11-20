export const DISPATCH_NEARBY_LIMIT = 60;
export const DISPATCH_SEARCH_LIMIT = 40;
export const DISPATCH_SEARCH_DEBOUNCE_MS = 250;

export function dispatchAirportTiers(aircraftTier: number, explicit: readonly number[] | null): number[] {
  return explicit ? [...explicit] : aircraftTier >= 3 ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
}