import { describe, expect, it } from 'vitest';
import { acquisitionBlock, acquisitionDue, hasRentalLicense, spotRentalPrice } from './market-rules';
const health = { status: 'HEALTHY' as const, balance: 30000, weekly_obligations: 0, debt: 0, next_payment_due: null };
describe('market acquisition guards', () => {
  it('charges a rounded 37% weekly rate for one flight', () => { expect(spotRentalPrice(950)).toBe(352); expect(spotRentalPrice(2600)).toBe(962); });
  it('requires the exact aircraft tier licence', () => { expect(hasRentalLicense(2, [1, 2])).toBe(true); expect(hasRentalLicense(3, [1, 2])).toBe(false); });
  it('charges no deposit on rentals', () => expect(acquisitionDue('rent', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(352));
  it('charges deposit plus first week for leases', () => expect(acquisitionDue('lease', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(3950));
  it('charges the full outright price for purchases', () => expect(acquisitionDue('buy', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 })).toBe(380000));
  it('permits a funded healthy owner with a four-week term without country coverage', () => expect(acquisitionBlock({ health, weeks: 4, busy: false })).toBeNull());
  it('permits a funded purchase without country coverage', () => expect(acquisitionBlock({ health, busy: false })).toBeNull());
  it('rejects fractional and out-of-range contract terms', () => { for (const weeks of [0, 1.5, 53]) expect(acquisitionBlock({ health, weeks, busy: false })).not.toBeNull(); });
  it('does not bypass debt restrictions', () => expect(acquisitionBlock({ health: { ...health, status: 'DELINQUENT' }, weeks: 4, busy: false })).not.toBeNull());
});