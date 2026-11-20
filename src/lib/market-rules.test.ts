import { describe, expect, it } from 'vitest';
import { acquisitionBlock } from './market-rules';
const health = { status: 'HEALTHY' as const, balance: 30000, weekly_obligations: 0, debt: 0, next_payment_due: null };
describe('market acquisition guards', () => {
  it('permits a funded healthy owner with a four-week term without country coverage', () => expect(acquisitionBlock({ health, weeks: 4, busy: false })).toBeNull());
  it('permits a funded purchase without country coverage', () => expect(acquisitionBlock({ health, busy: false })).toBeNull());
  it('rejects fractional and out-of-range contract terms', () => { for (const weeks of [0, 1.5, 53]) expect(acquisitionBlock({ health, weeks, busy: false })).not.toBeNull(); });
  it('does not bypass debt restrictions', () => expect(acquisitionBlock({ health: { ...health, status: 'DELINQUENT' }, weeks: 4, busy: false })).not.toBeNull());
});