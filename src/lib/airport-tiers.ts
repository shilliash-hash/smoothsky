import { useEffect, useState } from "react";
export const ALL_TIERS = [1, 2, 3, 4, 5, 6, 7] as const;
export const TIER_STORAGE_KEY = "smoothsky_visible_tiers";
export const tierPresets = [
  { label: "All", tiers: [1, 2, 3, 4, 5, 6, 7] },
  { label: "Commercial T3–T7", tiers: [3, 4, 5, 6, 7] },
  { label: "Bush/GA T1–T3", tiers: [1, 2, 3] },
] as const;
export function parseTiers(raw: string | null): number[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(v)) return [...ALL_TIERS];
    const t = [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 7))].sort();
    return t.length ? t : [...ALL_TIERS];
  } catch { return [...ALL_TIERS]; }
}
export function toggleTier(tiers: readonly number[], t: number): number[] {
  const next = tiers.includes(t) ? tiers.filter(x => x !== t) : [...tiers, t];
  return next.length ? next.sort((a, b) => a - b) : [...tiers];
}
/** Shared, persisted tier selection; read after hydration to avoid SSR mismatch. */
export function useVisibleTiers() {
  const [tiers, setTiers] = useState<number[]>([...ALL_TIERS]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTiers(parseTiers(localStorage.getItem(TIER_STORAGE_KEY))); setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(tiers)); }, [tiers, loaded]);
  return [tiers, setTiers] as const;
}
type Searchable = { icao: string; iata?: string | null; name: string; city: string; size: number };
/** Exact ICAO/IATA match first, then larger airports, then ICAO. */
export function searchAirports<T extends Searchable>(list: readonly T[], query: string, tiers: readonly number[]): T[] {
  const q = query.trim().toLowerCase();
  const exact = (a: T) => q !== "" && (a.icao.toLowerCase() === q || (a.iata ?? "").toLowerCase() === q);
  return list
    .filter(a => tiers.includes(a.size) && (q === "" || [a.icao, a.iata ?? "", a.name, a.city ?? ""].some(v => v.toLowerCase().includes(q))))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || b.size - a.size || a.icao.localeCompare(b.icao));
}
