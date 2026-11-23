// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { validateEconomyValue } from './admin-rules';

const db = new PGlite();
const company = '00000000-0000-4000-8000-000000000002';
async function value(sql: string) {
  const row = (await db.query<{ v: number }>(sql)).rows[0];
  if (!row) throw new Error('Missing result');
  return Number(row.v);
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb);
    CREATE TABLE fleet_aircraft(id uuid, company_id uuid,location_icao text);
    CREATE TABLE aircraft_types(id text,fuel_type text);
    CREATE TABLE airports(icao text);
    CREATE TABLE flights(id uuid);
    CREATE TABLE company_fobs(id uuid,company_id uuid,airport_icao text,closed_at timestamptz,has_fuel_contract boolean);
    CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=$1 $$;
    CREATE FUNCTION economy_number_or(text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=$1),$2) $$;
    CREATE FUNCTION airport_fuel_stock(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT CASE WHEN $1='NONE' THEN 0 ELSE 1000 END::numeric $$;
    INSERT INTO economy_config VALUES('fuel_price_jeta','5.8'),('fuel_price_100ll','8.2'),('fob_fuel_discount','0.2');`);
  await db.exec(readFileSync('src/test/fixtures/fuel-market-baseline.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0068_daily_airport_fuel_market.sql','utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`DELETE FROM economy_config WHERE key='fuel_price_volatility_pct'; DELETE FROM company_fobs;`);
});
afterAll(() => db.close());

it('accepts 0–50% volatility in exact 1% steps', () => {
  for (const n of [0,0.01,0.15,0.5]) expect(validateEconomyValue('fuel_price_volatility_pct',n)).toBe(n);
  for (const n of [-0.01,0.51,0.155,NaN,Infinity]) expect(() => validateEconomyValue('fuel_price_volatility_pct',n)).toThrow();
});
it('defaults to ±15% across the airport network', async () => {
  const rows = (await db.query<{ v: number }>(`SELECT airport_fuel_market_multiplier('PORT'||g,'2026-11-23')::float v FROM generate_series(1,1000) g`)).rows;
  expect(rows.length).toBe(1000);
  expect(rows.every(r => r.v >= 0.85 && r.v <= 1.15)).toBe(true);
  expect(new Set(rows.map(r => r.v)).size).toBeGreaterThan(900);
});
it('is identical for the same ICAO/day and normalizes ICAO case', async () => {
  expect(await value(`SELECT airport_fuel_market_multiplier(' epgd ','2026-11-23') v`)).toBe(await value(`SELECT airport_fuel_market_multiplier('EPGD','2026-11-23') v`));
});
it('changes on the next UTC date without a scheduled job', async () => {
  expect(await value(`SELECT airport_fuel_market_multiplier('EPGD','2026-11-23') v`)).not.toBe(await value(`SELECT airport_fuel_market_multiplier('EPGD','2026-11-24') v`));
});
it('uses UTC independently of the database session timezone', async () => {
  await db.exec(`SET TIME ZONE 'Pacific/Kiritimati'`);
  expect(await value(`SELECT airport_fuel_market_multiplier('EPGD') v`)).toBe(await value(`SELECT airport_fuel_market_multiplier('EPGD',(now() AT TIME ZONE 'UTC')::date) v`));
  await db.exec(`SET TIME ZONE 'UTC'`);
});
it('0% restores exact fixed prices for both fuel types', async () => {
  await db.exec(`INSERT INTO economy_config VALUES('fuel_price_volatility_pct','0')`);
  expect(await value(`SELECT airport_fuel_market_price('EPGD','Jet-A') v`)).toBe(5.8);
  expect(await value(`SELECT airport_fuel_market_price('ENVA','100LL') v`)).toBe(8.2);
});
it('50% remains bounded at 0.50–1.50', async () => {
  await db.exec(`INSERT INTO economy_config VALUES('fuel_price_volatility_pct','0.5')`);
  expect(await value(`SELECT count(*) v FROM generate_series(1,1000) g WHERE airport_fuel_market_multiplier('PORT'||g,'2026-11-23') NOT BETWEEN 0.5 AND 1.5`)).toBe(0);
});
it('database rejects out-of-range or fractional-step tuning', async () => {
  for (const n of [-0.01,0.51,0.155]) await expect(db.exec(`INSERT INTO economy_config VALUES('fuel_price_volatility_pct','${n}')`)).rejects.toThrow();
});
it('own active FBO discounts apply after market pricing at each endpoint', async () => {
  await db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','EPGD',NULL,true),(gen_random_uuid(),'${company}','ENVA',NULL,true)`);
  expect(await value(`SELECT (flight_fuel_market('${company}','EPGD','ENVA','Jet-A')->>'departure_price')::numeric v`)).toBeCloseTo((await value(`SELECT airport_fuel_market_price('EPGD','Jet-A') v`))*0.8,10);
  expect(await value(`SELECT (flight_fuel_market('${company}','EPGD','ENVA','Jet-A')->>'destination_price')::numeric v`)).toBeCloseTo((await value(`SELECT airport_fuel_market_price('ENVA','Jet-A') v`))*0.8,10);
});
it('closed and other-company FBOs do not grant discounts', async () => {
  await db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','EPGD',now(),true),(gen_random_uuid(),gen_random_uuid(),'ENVA',NULL,true)`);
  expect(await value(`SELECT (flight_fuel_market('${company}','EPGD','ENVA','Jet-A')->>'departure_fbo_discount')::numeric v`)).toBe(0);
  expect(await value(`SELECT (flight_fuel_market('${company}','EPGD','ENVA','Jet-A')->>'destination_fbo_discount')::numeric v`)).toBe(0);
});
it('reports no destination fuel from simulated stock, not unknown real availability', async () => {
  const row = (await db.query<{ v: { destination_fuel_available: boolean; destination_stock_gal: number } }>(`SELECT flight_fuel_market('${company}','EPGD','NONE','Jet-A') v`)).rows[0];
  expect(row?.v.destination_fuel_available).toBe(false);
  expect(row?.v.destination_stock_gal).toBe(0);
});
it('tankering savings compare effective prices including FBO discounts, never a negative saving', async () => {
  await db.exec(`INSERT INTO economy_config VALUES('fuel_price_volatility_pct','0'); INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','EPGD',NULL,true)`);
  expect(await value(`SELECT (flight_fuel_market('${company}','EPGD','ENVA','Jet-A')->>'tankering_savings_per_gal')::numeric v`)).toBeCloseTo(1.16,10);
  expect(await value(`SELECT (flight_fuel_market('${company}','ENVA','EPGD','Jet-A')->>'tankering_savings_per_gal')::numeric v`)).toBe(0);
});
it('persistent uplift continues using the frozen price after market configuration changes', async () => {
  const q = { fuel_price_per_gal: 5.8, fob_discounts: { fuel: 0.2 }, weight_budget: { planned_fuel_gal: 100, payload_kg: 0, fuel_capacity_gal: 200, mtow_kg: 1000, empty_weight_kg: 200, fuel_kg_per_gal: 3, min_safe_fuel_gal: 70 } };
  await db.exec(`INSERT INTO economy_config VALUES('fuel_price_volatility_pct','0.5')`);
  const row = (await db.query<{ v: { tank: { uplift_cost: number; fuel_price_effective_per_gal: number } } }>(`SELECT flight_tank_plan($1::jsonb,50,true) v`,[JSON.stringify(q)])).rows[0];
  expect(row?.v.tank.uplift_cost).toBe(232);
  expect(row?.v.tank.fuel_price_effective_per_gal).toBe(4.64);
});
it('internal pricing helpers remain unavailable to public/authenticated callers', async () => {
  expect(await value(`SELECT count(*) v FROM (VALUES('airport_fuel_market_multiplier(text,date)'),('airport_fuel_market_price(text,text)'),('flight_fuel_market(uuid,text,text,text)')) f(name) WHERE has_function_privilege('authenticated',name,'EXECUTE') OR has_function_privilege('anon',name,'EXECUTE')`)).toBe(0);
});