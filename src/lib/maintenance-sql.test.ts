// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const cid = '00000000-0000-4000-8000-000000000010';
const uid = '00000000-0000-4000-8000-000000000001';
const ac = '00000000-0000-4000-8000-0000000000a1';
const fl = '00000000-0000-4000-8000-0000000000f1';
async function scalar(sql: string) { const r = await db.query<{ n: unknown }>(sql); return r.rows[0]?.n; }
async function land(fpm: number, minutes = 60) {
 await db.exec(`INSERT INTO flights VALUES('${fl}','${ac}','DISPATCHED',0,${minutes},'{}',NULL,NULL);
  UPDATE flights SET status='COMPLETED',telemetry='{"landing_rate_fpm":${-fpm}}' WHERE id='${fl}'`);
}
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb,description text);
 CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE airports(icao text PRIMARY KEY,size int);
 CREATE TABLE aircraft_types(id text PRIMARY KEY,tier int,weekly_rate numeric);
 CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz,has_maintenance_bay boolean);
 CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,aircraft_type_id text,registration text,location_icao text,ownership text,lease_deposit numeric,weekly_rate numeric,returned_at timestamptz,status text DEFAULT 'AVAILABLE');
 CREATE TABLE flights(id uuid PRIMARY KEY,aircraft_id uuid,status text,passengers int,estimated_minutes numeric,estimate jsonb,telemetry jsonb,settlement jsonb);
 CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY,company_id uuid,entry_type text,company_delta numeric,balance_after numeric,idempotency_key text UNIQUE);
 CREATE FUNCTION company_balance(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=$1 ORDER BY id DESC LIMIT 1),100000) $$;
 CREATE FUNCTION company_post(cid uuid,kind text,debit text,credit text,delta numeric,descr text,ref text,ikey text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE bal numeric; BEGIN bal:=company_balance(cid)+delta; INSERT INTO company_ledger(company_id,entry_type,company_delta,balance_after,idempotency_key) VALUES(cid,kind,delta,bal,ikey); RETURN bal; END $$;
 CREATE FUNCTION spot_rental_price(numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT round($1*0.2) $$;`);
 await db.exec(readFileSync('docs/sql/0090_fleet_maintenance_aog.sql', 'utf8'));
}, 30000);
beforeEach(async () => {
 await db.exec(`BEGIN; SELECT set_config('test.user','${uid}',true);
 INSERT INTO companies VALUES('${cid}','${uid}');
 INSERT INTO airports VALUES('SMAL',1),('MIDD',3);
 INSERT INTO aircraft_types VALUES('C172',1,1000);`);
});
afterEach(() => db.exec('ROLLBACK'));
afterAll(() => db.close());
it('Spot Rental: +25% surcharge at 750 fpm and full deposit forfeit at 950 fpm', async () => {
 await db.exec(`INSERT INTO fleet_aircraft VALUES('${ac}','${cid}','C172','SP-R','MIDD','RENTAL',200,0,NULL)`);
 await land(750);
 expect(Number(await scalar(`SELECT company_delta n FROM company_ledger WHERE entry_type='RENTAL_DAMAGE'`))).toBe(-50);
 await db.exec(`DELETE FROM flights`);
 await land(950);
 expect(Number(await scalar(`SELECT sum(company_delta) n FROM company_ledger WHERE idempotency_key LIKE 'landing_forfeit:%'`))).toBe(-200);
});
it('Owned: reliability wears by band, 950 fpm grounds as AOG', async () => {
 await db.exec(`INSERT INTO fleet_aircraft VALUES('${ac}','${cid}','C172','SP-O','MIDD','OWNED',0,0,NULL)`);
 await land(400, 120);
 expect(Number(await scalar(`SELECT reliability_pct n FROM fleet_aircraft`))).toBe(98.6);
 expect(Number(await scalar(`SELECT hours_since_a_check n FROM fleet_aircraft`))).toBe(2);
 await db.exec(`DELETE FROM flights`);
 await land(950);
 expect(await scalar(`SELECT maintenance_status n FROM fleet_aircraft`)).toBe('AOG');
});
it('A-Check with 35% FBO Maintenance Bay discount resets counters; SMAL needs mechanic', async () => {
 await db.exec(`INSERT INTO fleet_aircraft VALUES('${ac}','${cid}','C172','SP-O','MIDD','OWNED',0,0,NULL);
  UPDATE fleet_aircraft SET reliability_pct=80,hours_since_a_check=120,maintenance_status='MINOR_DEFECT';
  INSERT INTO company_fobs VALUES('${cid}','MIDD',NULL,true);
  SELECT perform_maintenance('${ac}','A')`);
 expect(Number(await scalar(`SELECT company_delta n FROM company_ledger WHERE entry_type='MAINTENANCE'`))).toBe(-260);
 expect(Number(await scalar(`SELECT hours_since_a_check n FROM fleet_aircraft`))).toBe(0);
 expect(Number(await scalar(`SELECT reliability_pct n FROM fleet_aircraft`))).toBe(90);
 expect(await scalar(`SELECT maintenance_status n FROM fleet_aircraft`)).toBe('OPERATIONAL');
 await db.exec(`UPDATE fleet_aircraft SET location_icao='SMAL'`);
 expect((await scalar(`SELECT maintenance_quote('${ac}','A') n`) as { available: boolean }).available).toBe(false);
 expect((await scalar(`SELECT maintenance_quote('${ac}','MECHANIC') n`) as { cost: number }).cost).toBe(800);
});
it('AOG aircraft cannot be dispatched', async () => {
 await db.exec(`INSERT INTO fleet_aircraft VALUES('${ac}','${cid}','C172','SP-O','MIDD','OWNED',0,0,NULL); UPDATE fleet_aircraft SET maintenance_status='AOG'`);
 await expect(db.exec(`INSERT INTO flights VALUES('${fl}','${ac}','DISPATCHED',0,60,'{}',NULL,NULL)`)).rejects.toThrow('AOG');
});
