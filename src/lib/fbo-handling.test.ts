// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
type Quote = { handling_fee: number; landing_fee: number; fob_discounts: { handling_savings: number } };
const quote = async (cargo = false) => (await db.query<{q: Quote}>(`SELECT ${cargo ? 'flight_quote_cargo' : 'flight_quote'}('${aircraft}','DEST') q`)).rows[0]?.q;
const base = (airport: string, closed = false, other = false, desk = false) => db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${other ? owner : company}','${airport}',false,${desk},false,${closed ? 'now()' : 'NULL'})`);
beforeAll(async () => {
 await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
 CREATE TABLE companies(id uuid,user_id uuid);
 CREATE TABLE fleet_aircraft(id uuid,company_id uuid,location_icao text,aircraft_type_id text);
 CREATE TABLE company_fobs(id uuid,company_id uuid,airport_icao text,has_fuel_contract boolean,has_handling_desk boolean,has_maintenance_bay boolean,closed_at timestamptz);
 CREATE TABLE aircraft_types(id text,cargo_kg numeric,tier int);
 CREATE TABLE operating_rules(singleton boolean,cargo_airport_fee_discount numeric,cargo_pax_rate_ratio numeric,all_cargo_capacity_bonus numeric);
 CREATE TABLE special_missions(id uuid,accepted_by uuid,status text,origin_icao text,destination_icao text,cargo_kg numeric,category text,payout numeric);
 CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT CASE WHEN $1='handling_rate' THEN 0.05 ELSE 0.2 END::numeric $$;
 CREATE FUNCTION cargo_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1000::numeric $$;
 CREATE FUNCTION flight_quote_without_fobs(uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"handling_fee":100,"landing_fee":50,"fuel_cost":100,"maintenance":50,"revenue":1000,"passengers":3,"distance_nm":100,"rules":{"fare_per_nm":0.18,"charter_by_tier":[65]}}'::jsonb $$;
 CREATE FUNCTION settle_flight(uuid,jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE item record; delta numeric; BEGIN FOR item IN SELECT 0 change LOOP delta:=item.change; END LOOP; RETURN '{}'::jsonb; END $$;
 INSERT INTO companies VALUES('${company}','${owner}'); INSERT INTO fleet_aircraft VALUES('${aircraft}','${company}','ORIG','T1');
 INSERT INTO aircraft_types VALUES('T1',1000,1); INSERT INTO operating_rules VALUES(true,0.4,0.6,0.5);`);
 const cargo = readFileSync('drizzle/migrations/0027_cargo_and_special_missions.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.flight_quote_cargo[\s\S]*?END \$\$;/)?.[0];
 if (!cargo) throw new Error('Missing production cargo quote');
 await db.exec(cargo);
 await db.exec(readFileSync('drizzle/migrations/0040_company_fbo_free_handling.sql','utf8'));
}, 30000);
beforeEach(async () => { await db.exec("TRUNCATE company_fobs; SELECT set_config('smoothsky.cargo','',false)"); });
afterAll(async () => { await db.close(); });
describe('company FBO handling SQL', () => {
 it('charges the full 100 SC without FBOs', async () => { expect((await quote())?.handling_fee).toBe(100); });
 it('halves handling to 50 SC with an origin FBO, without a module', async () => { await base('ORIG'); expect((await quote())?.handling_fee).toBe(50); });
 it('halves handling to 50 SC with a destination FBO, without a module', async () => { await base('DEST'); expect((await quote())?.handling_fee).toBe(50); });
 it('charges zero handling between two own FBOs', async () => { await base('ORIG'); await base('DEST'); expect(await quote()).toMatchObject({handling_fee:0,fob_discounts:{handling_savings:100}}); });
 it('ignores closed FBOs', async () => { await base('ORIG',true); expect((await quote())?.handling_fee).toBe(100); });
 it('ignores another company FBO', async () => { await base('DEST',false,true); expect((await quote())?.handling_fee).toBe(100); });
 it('does not waive landing without the existing handling module', async () => { await base('DEST'); expect((await quote())?.landing_fee).toBe(50); });
 it('preserves the handling module landing discount', async () => { await base('DEST',false,false,true); expect((await quote())?.landing_fee).toBe(40); });
 it.each([false,true])('waives handling for cargo quotes (all cargo %s)', async (allCargo) => {
  await base('ORIG'); await base('DEST');
  await db.query("SELECT set_config('smoothsky.cargo',$1,false)",[JSON.stringify({cargo_kg:100,all_cargo:allCargo})]);
  expect((await quote(true))?.handling_fee).toBe(0);
 });
});
