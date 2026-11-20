// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquisitionDue, spotRentalPrice } from './market-rules';

const db = new PGlite();
beforeAll(async () => {
  await db.exec('CREATE TABLE public.economy_config(key text PRIMARY KEY,value jsonb);');
  await db.exec(readFileSync('drizzle/migrations/0046_configurable_spot_rental_multiplier.sql', 'utf8'));
});
afterAll(async () => { await db.close(); });
describe('live SQL spot rental pricing', () => {
  it('uses 0.20 by default when the setting has not been seeded', async () => {
    const result = await db.query<{ price: string }>('SELECT spot_rental_price(950) price');
    expect(Number(result.rows[0]?.price)).toBe(190);
  });
  it('reads changed settings without redeployment and matches market and confirmation prices', async () => {
    for (const multiplier of [0.20, 0.25, 0.37, 0.01, 1]) {
      await db.query("INSERT INTO economy_config VALUES('spot_rental_multiplier',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [JSON.stringify(multiplier)]);
      const result = await db.query<{ price: string }>('SELECT spot_rental_price(950) price');
      expect(Number(result.rows[0]?.price)).toBe(spotRentalPrice(950, multiplier));
      expect(Number(result.rows[0]?.price)).toBe(acquisitionDue('rent', { weekly_rate: 950, security_deposit: 3000, purchase_price: 380000 }, multiplier));
    }
  });
});