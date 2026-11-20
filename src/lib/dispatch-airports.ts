export const DISPATCH_NEARBY_LIMIT = 60;
export const DISPATCH_SEARCH_LIMIT = 40;
export const DISPATCH_SEARCH_DEBOUNCE_MS = 250;

export type DealSort = "best" | "nearest";
export type DealEstimate = { icao: string; distance_nm: number; estimated_margin: number | null };

export function sortDestinationDeals<T extends DealEstimate>(rows: readonly T[], sort: DealSort): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "best") {
      if (a.estimated_margin === null && b.estimated_margin !== null) return 1;
      if (b.estimated_margin === null && a.estimated_margin !== null) return -1;
      const difference = (b.estimated_margin ?? 0) - (a.estimated_margin ?? 0);
      if (difference) return difference;
    }
    return a.distance_nm - b.distance_nm || a.icao.localeCompare(b.icao);
  });
}

export function topDestinationDeals(rows: readonly DealEstimate[]): Set<string> {
  return new Set(sortDestinationDeals(rows.filter(row => row.estimated_margin !== null && row.estimated_margin > 0), "best").slice(0, 3).map(row => row.icao));
}

export function dispatchAirportTiers(aircraftTier: number, explicit: readonly number[] | null): number[] {
  return explicit ? [...explicit] : aircraftTier >= 3 ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
}