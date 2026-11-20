export function fuelMass(gallons: number, kgPerLitre: number) {
  const kg = gallons * 3.785411784 * kgPerLitre;
  return { kg, lb: kg / 0.45359237 };
}
export function fuelLabel(gallons: number, kgPerLitre: number) {
  const { kg, lb } = fuelMass(gallons, kgPerLitre);
  return `${gallons.toFixed(1)} US gal · ${lb.toFixed(1)} lb · ${kg.toFixed(1)} kg`;
}
export function plannedFuel(tripGallons: number, reserveMinutes: number, burnGallonsPerHour: number) {
  const reserveGallons = reserveMinutes / 60 * burnGallonsPerHour;
  return { tripGallons, reserveGallons, plannedGallons: tripGallons + reserveGallons };
}
export function renewalRate(base: number, discount: number) {
  return Math.round(base * (1 - discount) * 100) / 100;
}
export function aircraftProfit(revenue: number, operatingCosts: number, accruedLease: number) {
  return revenue - operatingCosts - accruedLease;
}