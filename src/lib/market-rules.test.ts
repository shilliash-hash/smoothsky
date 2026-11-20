import { describe, expect, it } from 'vitest';
import { acquisitionBlock } from './market-rules';
const health = { status: 'HEALTHY' as const, balance: 30000, weekly_obligations: 0, debt: 0, next_payment_due: null };
describe('market acquisition guards', () => {
  it('permits a funded healthy owner with a four-week term', () => expect(acquisitionBlock({ health, registrationAvailable: true, weeks: 4, busy: false })).toBeNull());
  it('explains the missing country registration instead of silently disabling', () => expect(acquisitionBlock({ health, registrationAvailable: false, weeks: 4, busy: false })).toBe('Registration rules unavailable for your home-base country'));
  it('rejects fractional and out-of-range contract terms', () => { for (const weeks of [0, 1.5, 53]) expect(acquisitionBlock({ health, registrationAvailable: true, weeks, busy: false })).not.toBeNull(); });
  it('does not bypass debt restrictions', () => expect(acquisitionBlock({ health: { ...health, status: 'DELINQUENT' }, registrationAvailable: true, weeks: 4, busy: false })).not.toBeNull());
});