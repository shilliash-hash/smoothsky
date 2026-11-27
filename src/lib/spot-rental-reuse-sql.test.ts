// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const cid = '00000000-0000-4000-8000-000000000010';
const uid = '00000000-0000-4000-8000-000000000001';
async function scalar(sql: string) { const r = await db.query<{ n: number }>(sql); return Number(r.rows[0]?.n); }
async function text(sql: string) { const r = await db.query<{ s: string }>(sql); return String(r.rows[0]?.s); }
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb,description text);
 CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,home_base_icao text,is_personal boolean DEFAULT false);
 CREATE TABLE airports(icao text PRIMARY KEY,lat float,lon float,longest_runway_ft int,country text);
 CREATE TABLE registration_rules(country text PRIMARY KEY,prefix text);
 CREATE TABLE aircraft_types(id text PRIMARY KEY,tier int,weekly_rate numeric,minimum_runway_ft int,active boolean);
 CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz,created_at timestamptz);
 CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,aircraft_type_id text,registration text,location_icao text,ownership text,lease_deposit numeric,weekly_rate numeric,purchase_price numeric,next_payment_due timestamptz,returned_at timestamptz,status text DEFAULT 'AVAILABLE',
  leased_at timestamptz,airframe_hours numeric DEFAULT 0,current_fuel_gal numeric DEFAULT 0,reserved_by uuid,reserved_until timestamptz,
  reliability_pct numeric DEFAULT 100,maintenance_status text DEFAULT 'OPERATIONAL',hours_since_a_check numeric DEFAULT 0,hours_since_c_check numeric DEFAULT 0,hours_since_d_check numeric DEFAULT 0,defect_hours numeric DEFAULT 0,last_hard_landing_fpm numeric);
 CREATE TABLE flights(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aircraft_id uuid,status text);
 CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY,company_id uuid,entry_type text,company_delta numeric,balance_after numeric,idempotency_key text UNIQUE);
 CREATE FUNCTION company_balance(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=$1 ORDER BY id DESC LIMIT 1),5000) $$;
 CREATE FUNCTION company_post(cid uuid,kind text,debit text,credit text,delta numeric,descr text,ref text,ikey text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE bal numeric; BEGIN bal:=company_balance(cid)+delta; INSERT INTO company_ledger(company_id,entry_type,company_delta,balance_after,idempotency_key) VALUES(cid,kind,delta,bal,ikey); RETURN bal; END $$;
 CREATE FUNCTION process_due_obligations() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION assert_company_investment() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION ensure_my_profile() RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE FUNCTION assert_aircraft_tier_license(int) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 CREATE SEQUENCE regseq;
 CREATE FUNCTION aircraft_registration(text,text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($2,'SP-T'||nextval('regseq')) $$;
 CREATE FUNCTION spot_rental_cfg(text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT $2 $$;
 CREATE FUNCTION spot_rental_price(numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT round($1*0.2) $$;
 CREATE FUNCTION spot_rental_delivery_zone(uuid,text,OUT zone text,OUT fee_pct numeric) LANGUAGE sql AS $$ SELECT 'MAIN'::text,0::numeric $$;
 CREATE FUNCTION apply_flight_maintenance() RETURNS trigger LANGUAGE plpgsql AS $f$ DECLARE a fleet_aircraft%ROWTYPE; dep numeric; BEGIN
  dep := coalesce(nullif(a.lease_deposit,0),(SELECT company_delta FROM company_ledger WHERE idempotency_key='spot_deposit_refund:'||a.id),0); RETURN NEW; END $f$;
 CREATE FUNCTION forfeit_base(p uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
 `);
 await db.exec(readFileSync('docs/sql/0091_spot_rental_airframe_reuse.sql','utf8'));
 await db.exec('CREATE TRIGGER refund_spot_rental_deposit BEFORE UPDATE OF returned_at ON fleet_aircraft FOR EACH ROW EXECUTE FUNCTION refund_spot_rental_deposit()');
},30000);
beforeEach(async () => {
 await db.exec(`BEGIN; SELECT set_config('test.user','${uid}',true); ALTER SEQUENCE regseq RESTART;
 INSERT INTO companies VALUES('${cid}','${uid}','EPWA',false);
 INSERT INTO airports VALUES('EPWA',0,0,5000,'PL'),('EPKK',1,0,5000,'PL');
 INSERT INTO registration_rules VALUES('PL','SP-');
 INSERT INTO aircraft_types VALUES('C172',1,950,1500,true);`);
});
afterEach(() => db.exec('ROLLBACK'));
afterAll(() => db.close());
const fly = (hrs: number) => `UPDATE fleet_aircraft SET airframe_hours=airframe_hours+${hrs},returned_at=now(),status='RETURNED' WHERE returned_at IS NULL`;
it('first rental mints a new SP- airframe with 0 h', async () => {
 await db.exec(`SELECT rent_aircraft('C172')`);
 expect(await text(`SELECT registration s FROM fleet_aircraft`)).toBe('SP-T1');
 expect(await scalar(`SELECT airframe_hours n FROM fleet_aircraft`)).toBe(0);
});
it('re-rents the same airframe with preserved hours, cleared defects and new location', async () => {
 await db.exec(`SELECT rent_aircraft('C172'); ${fly(1.5)}; UPDATE fleet_aircraft SET reliability_pct=61,maintenance_status='AOG',last_hard_landing_fpm=950;`);
 await db.exec(`SELECT rent_aircraft('C172',NULL,'EPKK')`);
 expect(await scalar(`SELECT count(*) n FROM fleet_aircraft`)).toBe(1);
 const r = await db.query<Record<string, unknown>>(`SELECT registration,airframe_hours::float h,reliability_pct::float rel,maintenance_status,location_icao,returned_at,lease_deposit::float dep FROM fleet_aircraft`);
 expect(r.rows[0]).toMatchObject({ registration: 'SP-T1', h: 1.5, rel: 100, maintenance_status: 'OPERATIONAL', location_icao: 'EPKK', returned_at: null, dep: 190 });
});
it('mints a second airframe when the pooled one is on an active flight', async () => {
 await db.exec(`SELECT rent_aircraft('C172'); ${fly(1)}; INSERT INTO flights(aircraft_id,status) SELECT id,'DISPATCHED' FROM fleet_aircraft;`);
 await db.exec(`SELECT rent_aircraft('C172')`);
 expect(await scalar(`SELECT count(*) n FROM fleet_aircraft`)).toBe(2);
 expect(await text(`SELECT registration s FROM fleet_aircraft WHERE returned_at IS NULL`)).toBe('SP-T2');
});
it('does not reuse airframes from another country prefix or when a custom registration is requested', async () => {
 await db.exec(`SELECT rent_aircraft('C172','OK-ABC'); ${fly(1)};`);
 await db.exec(`SELECT rent_aircraft('C172')`);
 expect(await scalar(`SELECT count(*) n FROM fleet_aircraft`)).toBe(2);
});
it('repeated sessions of one airframe post unique fees, deposits and refunds', async () => {
 for (let i = 0; i < 3; i++) await db.exec(`SELECT rent_aircraft('C172'); ${fly(1)};`);
 expect(await scalar(`SELECT count(*) n FROM fleet_aircraft`)).toBe(1);
 expect(await scalar(`SELECT count(*) n FROM company_ledger WHERE entry_type='LEASE_DEPOSIT_REFUND'`)).toBe(3);
 expect(await scalar(`SELECT company_balance('${cid}') n`)).toBe(5000 - 3 * 190);
});
it('patches the CR-06 forfeit lookup to the latest refund by prefix', async () => {
 expect(await text(`SELECT pg_get_functiondef('apply_flight_maintenance()'::regprocedure) s`)).toContain(`LIKE 'spot_deposit_refund:'||a.id||':%'`);
});
