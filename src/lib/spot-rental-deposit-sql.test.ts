// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { validateEconomyValue } from './admin-rules';
const db = new PGlite();
const cid = '00000000-0000-4000-8000-000000000010';
const uid = '00000000-0000-4000-8000-000000000001';
async function scalar(sql: string) { const r = await db.query<{ n: number }>(sql); return Number(r.rows[0]?.n); }
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb,description text);
 CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,home_base_icao text,is_personal boolean DEFAULT false);
 CREATE TABLE airports(icao text PRIMARY KEY,lat float,lon float,longest_runway_ft int);
 CREATE TABLE aircraft_types(id text PRIMARY KEY,tier int,weekly_rate numeric,minimum_runway_ft int,active boolean);
 CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz,created_at timestamptz);
 CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,aircraft_type_id text,registration text,location_icao text,ownership text,lease_deposit numeric,weekly_rate numeric,purchase_price numeric,next_payment_due timestamptz,returned_at timestamptz,status text DEFAULT 'AVAILABLE');
 CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY,company_id uuid,entry_type text,company_delta numeric,balance_after numeric,idempotency_key text UNIQUE);
 CREATE FUNCTION company_balance(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=$1 ORDER BY id DESC LIMIT 1),1000) $$;
 CREATE FUNCTION company_post(cid uuid,kind text,debit text,credit text,delta numeric,descr text,ref text,ikey text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE bal numeric; BEGIN bal:=company_balance(cid)+delta; INSERT INTO company_ledger(company_id,entry_type,company_delta,balance_after,idempotency_key) VALUES(cid,kind,delta,bal,ikey); RETURN bal; END $$;
 CREATE FUNCTION process_due_obligations() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION assert_company_investment() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION ensure_my_profile() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION assert_aircraft_tier_license(int) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION aircraft_registration(text,text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($2,'SP-TEST') $$;
 CREATE FUNCTION airport_distance_nm(float,float,float,float) RETURNS float LANGUAGE sql AS $$ SELECT abs($1-$3)*60 $$;
 CREATE FUNCTION spot_rental_cfg(text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key=$1),$2) $$;
 CREATE FUNCTION spot_rental_price(numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT round($1*0.2) $$;
 CREATE FUNCTION settle_flight(p_aircraft uuid,p_telemetry jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE c companies%ROWTYPE; bal numeric; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid(); bal:=company_balance(c.id); UPDATE fleet_aircraft SET status='RETURNED',returned_at=now() WHERE id=p_aircraft AND company_id=c.id; RETURN jsonb_build_object('balance_after',bal); END $$;
 `);
 await db.exec(readFileSync('docs/sql/0087_spot_rental_deposit_warmup.sql','utf8'));
},30000);
beforeEach(async () => {
 await db.exec(`BEGIN; SELECT set_config('test.user','${uid}',true);
 INSERT INTO companies VALUES('${cid}','${uid}','MAIN',false);
 INSERT INTO airports VALUES('MAIN',0,0,5000),('NEAR',0.5,0,5000),('SATE',10,0,5000),('SNEA',10.5,0,5000),('FAR',20,0,5000);
 INSERT INTO aircraft_types VALUES('C172',1,950,1500,true);
 INSERT INTO company_fobs VALUES('${cid}','SATE',NULL,now()-interval '11 hours 59 minutes');`);
});
afterEach(() => db.exec('ROLLBACK'));
afterAll(() => db.close());
it('charges 190 rental + 19 positioning + 190 refundable deposit, snapshots the deposit', async () => {
 await db.exec(`SELECT rent_aircraft('C172',NULL,'NEAR')`);
 expect(await scalar(`SELECT lease_deposit n FROM fleet_aircraft`)).toBe(190);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(601);
 expect(await scalar(`SELECT count(*) n FROM company_ledger`)).toBe(2);
});
it('refunds exactly once on terminal settlement and refreshes the returned balance snapshot', async () => {
 await db.exec(`SELECT rent_aircraft('C172',NULL,'MAIN')`);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(620);
 expect(await scalar(`SELECT (settle_flight((SELECT id FROM fleet_aircraft))->>'balance_after')::numeric n`)).toBe(810);
 await db.exec(`SELECT settle_flight((SELECT id FROM fleet_aircraft))`);
 expect(await scalar(`SELECT count(*) n FROM company_ledger WHERE entry_type='LEASE_DEPOSIT_REFUND'`)).toBe(1);
 expect(await scalar(`SELECT lease_deposit n FROM fleet_aircraft`)).toBe(0);
});
it('keeps the deposit through divert and cancelled continuation, refunds on pre-start Recall retirement', async () => {
 await db.exec(`SELECT rent_aircraft('C172',NULL,'MAIN'); UPDATE fleet_aircraft SET status='DIVERTED'; UPDATE fleet_aircraft SET status='DISPATCHED'; UPDATE fleet_aircraft SET status='DIVERTED';`);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(620);
 expect(await scalar(`SELECT lease_deposit n FROM fleet_aircraft`)).toBe(190);
 await db.exec(`UPDATE fleet_aircraft SET returned_at=now(),status='RETURNED'`);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(810);
});
it('blocks satellite and 60 NM zone until 12h, keeps Main immediately available', async () => {
 expect(await scalar(`SELECT count(*) n FROM spot_rental_delivery_zone('${cid}','SATE')`)).toBe(0);
 expect(await scalar(`SELECT count(*) n FROM spot_rental_delivery_zone('${cid}','SNEA')`)).toBe(0);
 expect(await scalar(`SELECT count(*) n FROM spot_rental_delivery_zone('${cid}','MAIN')`)).toBe(1);
 await db.exec(`UPDATE company_fobs SET created_at=now()-interval '12 hours'`);
 expect(await scalar(`SELECT fee_pct n FROM spot_rental_delivery_zone('${cid}','SATE')`)).toBe(0);
 expect(await scalar(`SELECT fee_pct n FROM spot_rental_delivery_zone('${cid}','SNEA')`)).toBe(0.1);
});
it('rejects out-of-zone delivery and insufficient combined fee/deposit funding atomically', async () => {
 await expect(db.exec(`SELECT rent_aircraft('C172',NULL,'FAR')`)).rejects.toThrow('outside operational reach');
 await db.exec('ROLLBACK; BEGIN');
 // A separate transaction avoids PostgreSQL aborted-transaction state after rejection.
 await db.exec(`SELECT set_config('test.user','${uid}',true); INSERT INTO companies VALUES('${cid}','${uid}','MAIN',false); INSERT INTO airports VALUES('MAIN',0,0,5000); INSERT INTO aircraft_types VALUES('C172',1,950,1500,true); INSERT INTO company_ledger(company_id,balance_after) VALUES('${cid}',300)`);
 await expect(db.exec(`SELECT rent_aircraft('C172',NULL,'MAIN')`)).rejects.toThrow('Insufficient');
});
it('validates configurable deposit and warmup boundaries', () => {
 expect(validateEconomyValue('spot_rental_deposit_ratio',1)).toBe(1);
 expect(validateEconomyValue('secondary_hub_rental_warmup_hours',12)).toBe(12);
 for (const n of [-1,169,12.5]) expect(() => validateEconomyValue('secondary_hub_rental_warmup_hours',n)).toThrow();
});
it('does not double-refund deposits already recovered by company restructuring', async () => {
 await db.exec(`SELECT rent_aircraft('C172',NULL,'MAIN'); SELECT company_post('${cid}','RESTRUCTURE_ASSETS','COMPANY_CASH','AIRCRAFT_ASSET',190,'Recovery',NULL,'restructure:test:assets'); UPDATE fleet_aircraft SET returned_at=now(),status='RETURNED'`);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(810);
 expect(await scalar(`SELECT count(*) n FROM company_ledger WHERE entry_type='LEASE_DEPOSIT_REFUND'`)).toBe(0);
 expect(await scalar(`SELECT lease_deposit n FROM fleet_aircraft`)).toBe(0);
});
it('leaves pre-existing rentals without deposits untouched and keeps helpers private', async () => {
 await db.exec(`INSERT INTO fleet_aircraft(id,company_id,registration,ownership,lease_deposit) VALUES(gen_random_uuid(),'${cid}','OLD','RENTAL',0); UPDATE fleet_aircraft SET returned_at=now()`);
 expect(await scalar(`SELECT count(*) n FROM company_ledger`)).toBe(0);
 expect(await scalar(`SELECT count(*) n FROM (VALUES('refund_spot_rental_deposit()'),('spot_rental_delivery_zone(uuid,text)')) x(fn) WHERE has_function_privilege('authenticated',fn,'EXECUTE') OR has_function_privilege('anon',fn,'EXECUTE')`)).toBe(0);
});
