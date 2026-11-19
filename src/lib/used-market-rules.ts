export type DepreciationRules = { depreciation_pct_per_100h: number; depreciation_floor_pct: number };

/** Current value of an aircraft after airframe-hour depreciation (mirrors SQL depreciated_value). */
export function depreciatedValue(catalogPrice: number, hours: number, r: DepreciationRules) {
  const factor = Math.max(r.depreciation_floor_pct / 100, 1 - (Math.max(hours, 0) / 100) * (r.depreciation_pct_per_100h / 100));
  return Math.round(catalogPrice * factor * 100) / 100;
}

/** Allowed P2P asking-price band: 75%–125% of depreciated value. */
export function askingPriceBand(value: number) {
  return { min: Math.round(value * 0.75 * 100) / 100, max: Math.round(value * 1.25 * 100) / 100 };
}

/** Percentage difference vs a factory-new aircraft, e.g. -42. */
export function pctVsNew(price: number, catalogPrice: number) {
  if (catalogPrice <= 0) return 0;
  return Math.round((price / catalogPrice - 1) * 100);
}
