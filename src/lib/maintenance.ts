export type MaintenanceState = { reliability_pct?: number | null; hours_since_a_check?: number | null; hours_since_c_check?: number | null; hours_since_d_check?: number | null; maintenance_status?: string | null; last_hard_landing_fpm?: number | null };
export function reliabilityBand(pct: number) {
  return pct >= 90 ? "Optimal" : pct >= 70 ? "Good" : pct >= 50 ? "Worn" : "Critical";
}
export const maintenanceStatusLabel: Record<string, string> = { OPERATIONAL: "Operational", MINOR_DEFECT: "Minor defect", MAJOR_DEFECT: "Major defect · ferry only", AOG: "AOG · grounded" };
export function dispatchMaintenanceBlock(status: string | null | undefined) {
  if (status === "AOG") return "Aircraft is AOG — repair it with a check or a Fly-in Mechanic before dispatch.";
  if (status === "MAJOR_DEFECT") return "Major defect — only an empty ferry flight to a maintenance airport is allowed.";
  return null;
}
export function landingMaintenanceNote(fpm: number, rental: boolean) {
  const a = Math.abs(fpm);
  if (rental) return a > 900 ? "Severe landing: Spot Rental deposit forfeited." : a > 600 ? "Hard landing: +25% Spot Rental surcharge." : "Gear and airframe within limits.";
  return a > 900 ? "Severe landing: −15 reliability, aircraft grounded (AOG)." : a > 600 ? "Hard landing: −5 reliability, gear inspection (minor defect)." : a > 300 ? "Firm landing: −1 reliability." : "Gear and airframe within limits.";
}
