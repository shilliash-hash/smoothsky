import { describe, expect, it } from 'vitest';
import { acquisitionBlock, acquisitionDue, canAcquireWithLicense, hasRentalLicense, spotRentalPrice, spotRentalBreakdown, rentalWarmupRemaining } from './market-rules';
const health = { status: 'HEALTHY' as const, balance: 30000, weekly_obligations: 0, debt: 0, next_payment_due: null };
describe('market acquisition guards', () => {
  for (const mode of ['lease', 'rent'] as const) {
    it(`${mode} permits baseline T1–T3`, () => {
      for (const tier of [1, 2, 3]) expect(canAcquireWithLicense(mode, tier, [1, 2, 3])).toBe(true);
    });
    it(`${mode} blocks every unlicensed T4–T7`, () => {
      for (const tier of [4, 5, 6, 7]) expect(canAcquireWithLicense(mode, tier, [1, 2, 3])).toBe(false);
    });
    it(`${mode} requires the exact tier rather than a higher or lower rating`, () => {
      for (const tier of [4, 5, 6, 7]) {
        expect(canAcquireWithLicense(mode, tier, [1, 2, 3, tier])).toBe(true);
        expect(canAcquireWithLicense(mode, tier, [tier - 1, tier + 1])).toBe(false);
      }
    });
  }
  it('does not change outright purchase eligibility', () => expect(canAcquireWithLicense('buy', 4, [1, 2, 3])).toBe(true));
  it('defaults to 20% of the weekly rate', () => { expect(spotRentalPrice(950)).toBe(190); expect(spotRentalPrice(2600)).toBe(520); });
  it('recalculates rental price and affordability with the configured rate', () => {
    expect(spotRentalPrice(950, 0.25)).toBe(238);
    expect(acquisitionDue('rent', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 }, 0.25)).toBe(238);
  });
  it('requires the exact aircraft tier licence', () => { expect(hasRentalLicense(2, [1, 2])).toBe(true); expect(hasRentalLicense(3, [1, 2])).toBe(false); });
  it('charges no deposit on rentals', () => expect(acquisitionDue('rent', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(190));
  it('uses a 100% base rental deposit, excluding the 10% positioning fee', () => {
    expect(spotRentalBreakdown(950, 0.2, 1, 0.1)).toEqual({ base: 190, deposit: 190, positioning: 19, total: 399 });
    expect(acquisitionDue('rent', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 }, 0.2, 1)).toBe(380);
  });
  it('unlocks satellite rental delivery after exactly 12 hours', () => {
    const created = '2026-11-27T00:00:00Z';
    expect(rentalWarmupRemaining(created, 12, Date.parse('2026-11-27T11:00:00Z'))).toBe(1);
    expect(rentalWarmupRemaining(created, 12, Date.parse('2026-11-27T12:00:00Z'))).toBe(0);
  });
  it('charges deposit plus first week for leases', () => expect(acquisitionDue('lease', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(3950));
  it('charges the full outright price for purchases', () => expect(acquisitionDue('buy', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(380000));
  it('permits a funded healthy owner with a four-week term without country coverage', () => expect(acquisitionBlock({ health, weeks: 4, busy: false })).toBeNull());
  it('permits a funded purchase without country coverage', () => expect(acquisitionBlock({ health, busy: false })).toBeNull());
  it('rejects fractional and out-of-range contract terms', () => { for (const weeks of [0, 1.5, 53]) expect(acquisitionBlock({ health, weeks, busy: false })).not.toBeNull(); });
  it('does not bypass debt restrictions', () => expect(acquisitionBlock({ health: { ...health, status: 'DELINQUENT' }, weeks: 4, busy: false })).not.toBeNull());
});