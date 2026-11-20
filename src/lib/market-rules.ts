import { canInvest, type FinancialHealth } from './bases-rules';

export function acquisitionBlock({ health, registrationAvailable, weeks, busy }: { health: FinancialHealth | null; registrationAvailable: boolean; weeks?: number; busy: boolean }) {
  if (busy) return 'Another acquisition is in progress';
  if (!health) return 'Financial status unavailable — refresh and try again';
  if (!canInvest(health.status)) return 'Outstanding obligations — acquisitions suspended';
  if (!registrationAvailable) return 'Registration rules unavailable for your home-base country';
  if (weeks !== undefined && (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)) return 'Choose a contract term of 1–52 whole weeks';
  return null;
}