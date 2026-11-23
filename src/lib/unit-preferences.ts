import { useCallback, useSyncExternalStore } from "react";
import { LB_PER_KG, LITRES_PER_GAL } from "@/lib/fuel-units";

export type WeightUnit = "kg" | "lbs";
export type VolumeUnit = "gal" | "ltr";
export type UnitPreferences = { weight: WeightUnit; volume: VolumeUnit };

export const UNIT_STORAGE_KEY = "smoothsky_unit_preferences";
export const DEFAULT_UNITS: UnitPreferences = { weight: "kg", volume: "gal" };
const EVENT = "smoothsky-units";

export function parseUnitPreferences(raw: string | null): UnitPreferences {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<UnitPreferences>) : {};
    return { weight: v.weight === "lbs" ? "lbs" : "kg", volume: v.volume === "ltr" ? "ltr" : "gal" };
  } catch { return DEFAULT_UNITS; }
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
/** Internal values stay kg / US gallons; only display converts. */
export const toWeight = (kg: number, unit: WeightUnit) => unit === "lbs" ? kg * LB_PER_KG : kg;
export const toVolume = (gal: number, unit: VolumeUnit) => unit === "ltr" ? gal * LITRES_PER_GAL : gal;
export const formatWeight = (kg: number, unit: WeightUnit) => `${n(toWeight(kg, unit))} ${unit}`;
export const formatVolume = (gal: number, unit: VolumeUnit) => `${n(toVolume(gal, unit))} ${unit}`;
export const otherWeight = (unit: WeightUnit): WeightUnit => unit === "kg" ? "lbs" : "kg";
export const otherVolume = (unit: VolumeUnit): VolumeUnit => unit === "gal" ? "ltr" : "gal";
export const pricePerVolume = (pricePerGal: number, unit: VolumeUnit) => unit === "ltr" ? pricePerGal / LITRES_PER_GAL : pricePerGal;

// Cached string snapshot keeps useSyncExternalStore stable; server renders defaults, client re-renders after hydration.
let cachedRaw: string | null | undefined;
let cached: UnitPreferences = DEFAULT_UNITS;
function read(): UnitPreferences {
  let raw: string | null = null;
  try { raw = localStorage.getItem(UNIT_STORAGE_KEY); } catch { /* storage blocked */ }
  if (raw !== cachedRaw) { cachedRaw = raw; cached = parseUnitPreferences(raw); }
  return cached;
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function useUnitPreferences() {
  const units = useSyncExternalStore(subscribe, read, () => DEFAULT_UNITS);
  const setUnits = useCallback((patch: Partial<UnitPreferences>) => {
    const next = { ...read(), ...patch };
    try { localStorage.setItem(UNIT_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [units, setUnits] as const;
}
