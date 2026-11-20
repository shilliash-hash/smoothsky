import { canInvest, type FinancialHealth } from './bases-rules';

export type AcquisitionMode = 'lease' | 'rent' | 'buy';
export function spotRentalPrice(weeklyRate: number) { return Math.round(weeklyRate * 0.37); }
export function hasRentalLicense(tier: number, ratings: readonly number[]) { return ratings.includes(tier); }
export function acquisitionDue(mode: AcquisitionMode, type: { weekly_rate: number; security_deposit: number; purchase_price: number }) {
  return mode === 'lease' ? Number(type.security_deposit) + Number(type.weekly_rate) : mode === 'rent' ? spotRentalPrice(type.weekly_rate) : Number(type.purchase_price);
}

export function acquisitionBlock({ health, weeks, busy }: { health: FinancialHealth | null; weeks?: number; busy: boolean }) {
  if (busy) return 'Another acquisition is in progress';
  if (!health) return 'Financial status unavailable — refresh and try again';
  if (!canInvest(health.status)) return 'Outstanding obligations — acquisitions suspended';
  if (weeks !== undefined && (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)) return 'Choose a contract term of 1–52 whole weeks';
  return null;
}