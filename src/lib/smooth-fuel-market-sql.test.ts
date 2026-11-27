// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb);
    CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz,has_fuel_contract boolean);
    CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT (value#>>'{}')::numeric FROM economy_config WHERE key=$1 $$;
    CREATE FUNCTION economy_number_or(text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key=$1),$2) $$;
    CREATE FUNCTION airport_fuel_stock(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1000::numeric $$;
    INSERT INTO economy_config VALUES ('fuel_price_jeta','5.8'),('fuel_price_100ll','8.2'),('fuel_price_volatility_pct','0.15');`);
  await db.exec(readFileSync('docs/sql/0086_smooth_fuel_market.sql','utf8'));
},30000);
afterAll(() => db.close());
it('limits relative daily price changes to approximately 4% across a 5–7 day cycle', async () => {
  const r = await db.query<{ delta: number }>(`SELECT max(abs(airport_fuel_cycle_multiplier('PORT'||p,t+interval '24 hours')/airport_fuel_cycle_multiplier('PORT'||p,t)-1))::float delta FROM generate_series(1,100) p CROSS JOIN generate_series('2026-11-01'::timestamptz,'2026-11-14',interval '6 hours') t`);
  expect(r.rows[0]?.delta).toBeLessThan(0.041);
  expect(r.rows[0]?.delta).toBeGreaterThan(0.02);
});
it('is continuous across midnight and deterministic regardless of timezone or ICAO case', async () => {
  const r = await db.query<{ gap: number; same: boolean }>(`SELECT abs(airport_fuel_cycle_multiplier('EPGD','2026-11-27 00:00:01Z')-airport_fuel_cycle_multiplier('EPGD','2026-11-26 23:59:59Z'))::float gap, airport_fuel_cycle_multiplier(' epgd ','2026-11-27 12:00Z')=airport_fuel_cycle_multiplier('EPGD','2026-11-27 13:00+01') same`);
  expect(r.rows[0]?.gap).toBeLessThan(0.000001);
  expect(r.rows[0]?.same).toBe(true);
});
it('returns up/down/flat from exact 24h changes and also forecasts 48h', async () => {
  const r = await db.query<{ valid: boolean; kinds: number }>(`WITH forecasts AS (SELECT airport_fuel_trend('PORT'||p,'2026-11-27 12:00Z') q FROM generate_series(1,100) p) SELECT bool_and((q->>'fuel_trend')=CASE WHEN (q->>'delta_pct_24h')::numeric>1.5 THEN 'up' WHEN (q->>'delta_pct_24h')::numeric < -1.5 THEN 'down' ELSE 'flat' END AND q ? 'delta_pct_48h') valid,count(DISTINCT q->>'fuel_trend')::int kinds FROM forecasts`);
  expect(r.rows[0]).toEqual({ valid: true, kinds: 3 });
});
it('preserves effective FBO prices and additive quote telemetry without exposing helper execution', async () => {
  await db.exec(`INSERT INTO company_fobs VALUES('00000000-0000-4000-8000-000000000001','EPGD',NULL,true)`);
  const r = await db.query<{ correct: boolean; allowed: boolean }>(`SELECT ((flight_fuel_market('00000000-0000-4000-8000-000000000001','EPGD','ENVA','Jet-A')->>'departure_price')::numeric=airport_fuel_market_price('EPGD','Jet-A')*0.8) correct,has_function_privilege('authenticated','airport_fuel_trend(text,timestamptz)','EXECUTE') allowed`);
  expect(r.rows[0]).toEqual({ correct: true, allowed: false });
});
it('zero volatility produces fixed prices and a flat forecast', async () => {
  await db.exec(`UPDATE economy_config SET value='0' WHERE key='fuel_price_volatility_pct'`);
  const r = await db.query<{ price: number; trend: string }>(`SELECT airport_fuel_market_price('EPGD','Jet-A')::float price,airport_fuel_trend('EPGD')->>'fuel_trend' trend`);
  expect(r.rows[0]).toEqual({ price: 5.8, trend: 'flat' });
});
