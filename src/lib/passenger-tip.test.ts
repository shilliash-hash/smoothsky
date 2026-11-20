// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { pirepSchema } from './acars-gateway';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
const flight = '00000000-0000-4000-8000-000000000004';
const sql = (name: string) => readFileSync(`drizzle/migrations/${name}`, 'utf8');
function extract(name: string, pattern: RegExp) {
  const match = sql(name).match(pattern)?.[0];
  if (!match) throw new Error(`Missing production function in ${name}`);
  return match;
}
type Settlement = { passenger_tip?: number; passenger_tip_pct?: number; landing_rate_fpm?: number; net: number; balance_after: number };
const settle = (telemetry: unknown = { landing_rate_fpm: -61 }) => db.query<{ result: Settlement }>(`SELECT settle_flight('${flight}',$1::jsonb) result`, [JSON.stringify(telemetry)]);

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,registration text,ownership text DEFAULT 'LEASED',purchase_price numeric DEFAULT 0,lease_deposit numeric DEFAULT 3000,returned_at timestamptz,status text,location_icao text,reserved_by uuid,reserved_until timestamptz);
    CREATE TABLE lease_contracts(aircraft_id uuid,company_id uuid,starts_at timestamptz,ends_at timestamptz,ended_at timestamptz,weekly_rate numeric,term_weeks int);
    CREATE TABLE flights(id uuid PRIMARY KEY,company_id uuid,aircraft_id uuid,status text,execution_source text,estimate jsonb,settlement jsonb,rules_snapshot jsonb,departed_at timestamptz,completed_at timestamptz,estimated_minutes numeric,passengers int,origin_icao text,destination_icao text,flight_number text,telemetry jsonb,pilot_id uuid,pilot_mode text,pilot_commission_pct numeric);
    CREATE TABLE special_missions(id uuid,status text,flight_id uuid,deadline_at timestamptz,completed_at timestamptz,final_payout numeric,delivered_late boolean);
    CREATE TABLE airport_passenger_pools(airport_icao text,stock numeric,updated_at timestamptz);
    CREATE TABLE economy_config(key text,value jsonb);
    INSERT INTO economy_config VALUES('web_simulation_enabled','true');
    CREATE TABLE operating_rules(singleton boolean DEFAULT true);
    INSERT INTO operating_rules DEFAULT VALUES;
    CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,entry_type text CONSTRAINT company_ledger_entry_type_check CHECK(entry_type IS NOT NULL),debit_account text,credit_account text,amount numeric,company_delta numeric,balance_after numeric,description text,reference text,idempotency_key text UNIQUE,created_at timestamptz DEFAULT now());
    CREATE TABLE pilot_ledger(amount numeric);
    CREATE FUNCTION company_balance(p_company uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=p_company ORDER BY id DESC LIMIT 1),0) $$;
    CREATE FUNCTION passenger_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION passenger_capacity(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 100::numeric $$;
    CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1::numeric $$;
    CREATE FUNCTION pilot_post(uuid,text,numeric,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO pilot_ledger(amount) VALUES($3) $$;
    CREATE FUNCTION flight_quote(uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"rules":{},"revenue":1000}'::jsonb $$;
    CREATE FUNCTION flight_quote_cargo(p_aircraft uuid,p_destination text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE q jsonb; BEGIN q := flight_quote(p_aircraft, p_destination); RETURN q; END $$;
  `);
  await db.exec(extract('0025_pilot_flights_stakes_personal_hangar.sql', /CREATE OR REPLACE FUNCTION public.company_post[\s\S]*?END \$\$;/));
  await db.exec(extract('0027_cargo_and_special_missions.sql', /CREATE OR REPLACE FUNCTION public.settle_flight[\s\S]*?END \$function\$;/));
  await db.exec(extract('0025_pilot_flights_stakes_personal_hangar.sql', /CREATE OR REPLACE FUNCTION public.split_pilot_result[\s\S]*?END \$\$;/));
  await db.exec(`CREATE TRIGGER split_result AFTER UPDATE ON flights FOR EACH ROW EXECUTE FUNCTION split_pilot_result();`);
  await db.exec(extract('0038_early_lease_termination.sql', /CREATE OR REPLACE FUNCTION public.aircraft_finance[\s\S]*?END \$\$;/));
  const daily = sql('0014_daily_results_and_test_simulation.sql').split(';')[0];
  if (!daily) throw new Error('Missing production daily results');
  await db.exec(daily);
  await db.exec(sql('0039_passenger_butter_tip.sql'));
}, 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE company_ledger,flights,fleet_aircraft,companies,pilot_ledger;
    UPDATE operating_rules SET butter_tip_rate=0.1;
    SELECT set_config('test.uid','${owner}',false);
    SELECT set_config('smoothsky.acars_settlement','${flight}',false);
    INSERT INTO companies VALUES('${company}','${owner}');
    INSERT INTO fleet_aircraft(id,company_id,registration,status,location_icao) VALUES('${aircraft}','${company}','SP-TIP','EN_ROUTE','EPGD');
    INSERT INTO flights(id,company_id,aircraft_id,status,execution_source,estimate,rules_snapshot,departed_at,estimated_minutes,passengers,origin_icao,destination_icao,flight_number)
    VALUES('${flight}','${company}','${aircraft}','EN_ROUTE','ACARS_AGENT','{"ticket_revenue":1000,"cargo_revenue":500,"revenue":1500,"net":1200,"fuel_cost":100,"landing_fee":50,"handling_fee":100,"maintenance":50,"rules":{}}','{"dissolve_min":0,"dissolve_max":0,"simulation_time_scale":1}',now()-interval '2 hours',60,3,'EPGD','EPBY','TIP101');`);
});
afterAll(async () => { await db.close(); });

describe('passenger landing tip SQL', () => {
  it.each([-100, -61, 0, 100])('awards exactly 10%% of tickets at %s fpm, never of cargo', async (fpm) => {
    expect((await settle({ landing_rate_fpm: fpm })).rows[0]?.result).toMatchObject({ passenger_tip: 100, passenger_tip_pct: 10, net: 1300, balance_after: 1300 });
  });
  it.each([-180, -142, -101, 101, 180])('awards exactly 5%% of tickets at %s fpm', async (fpm) => {
    expect((await settle({ landing_rate_fpm: fpm })).rows[0]?.result).toMatchObject({ passenger_tip: 50, passenger_tip_pct: 5, net: 1250 });
  });
  it.each([-181, 181, 100.5])('does not award a tip outside either inclusive range at %s fpm', async (fpm) => {
    expect((await settle({ landing_rate_fpm: fpm })).rows[0]?.result.passenger_tip).toBe(0);
  });
  it('does not tip flights without passengers', async () => {
    await db.exec(`UPDATE flights SET passengers=0 WHERE id='${flight}'`);
    expect((await settle()).rows[0]?.result.passenger_tip).toBe(0);
  });
  it.each([{}, { landing_rate_fpm: null }, { landing_rate_fpm: 'bad' }])('ignores absent or nonnumeric telemetry %j', async (telemetry) => {
    expect((await settle(telemetry)).rows[0]?.result).toMatchObject({ net: 1200 });
    expect((await db.query("SELECT count(*)::int n FROM company_ledger WHERE entry_type='PASSENGER_TIP'")).rows[0]).toEqual({ n: 0 });
  });
  it('accepts nested numeric PIREP touchdown', async () => {
    expect((await settle({ pirep: { landing_rate_fpm: -61 } })).rows[0]?.result.passenger_tip).toBe(100);
  });
  it('keeps browser simulation ineligible even with a fabricated touchdown', async () => {
    await db.exec(`UPDATE flights SET execution_source='WEB_MANUAL' WHERE id='${flight}'`);
    expect((await settle()).rows[0]?.result.net).toBe(1200);
  });
  it('rejects an ACARS settlement outside verified ingestion', async () => {
    await db.exec("SELECT set_config('smoothsky.acars_settlement','',false)");
    await expect(settle()).rejects.toThrow('verified telemetry ingestion');
  });
  it('posts a balanced, readable entry exactly once across retries', async () => {
    const first = (await settle()).rows[0]?.result;
    expect((await settle({ landing_rate_fpm: -142 })).rows[0]?.result).toEqual(first);
    const entry = (await db.query("SELECT debit_account,credit_account,amount::float,company_delta::float,idempotency_key FROM company_ledger WHERE entry_type='PASSENGER_TIP'")).rows;
    expect(entry).toEqual([{ debit_account: 'COMPANY_CASH', credit_account: 'PASSENGER_REVENUE', amount: 100, company_delta: 100, idempotency_key: `flight:${flight}:PASSENGER_TIP` }]);
  });
  it('includes tips in aircraft and daily revenue', async () => {
    await settle();
    expect((await db.query<{ result: { revenue: number } }>(`SELECT aircraft_finance('${aircraft}') result`)).rows[0]?.result.revenue).toBe(1600);
    expect((await db.query('SELECT revenue::float FROM company_daily_results() WHERE day=current_date')).rows[0]).toEqual({ revenue: 1600 });
  });
  it('includes the tip before computing the pilot commission', async () => {
    await db.exec(`UPDATE flights SET pilot_id='${owner}',pilot_mode='ROSTER',pilot_commission_pct=10 WHERE id='${flight}'`);
    await settle();
    expect((await db.query('SELECT amount::float FROM pilot_ledger')).rows).toEqual([{ amount: 130 }]);
  });
  it('rounds tip cash to two decimal places', async () => {
    await db.exec(`UPDATE flights SET estimate=jsonb_set(estimate,'{ticket_revenue}','1425.55') WHERE id='${flight}'`);
    expect((await settle()).rows[0]?.result.passenger_tip).toBe(142.56);
  });
  it('freezes configurable rates in quotes for new dispatches', async () => {
    const before = (await db.query<{ q: { rules: { butter_tip_rate: number } } }>(`SELECT flight_quote_cargo('${aircraft}','EPBY') q`)).rows[0]?.q;
    expect(before?.rules.butter_tip_rate).toBe(0.1);
    await db.exec('UPDATE operating_rules SET butter_tip_rate=0.2');
    expect(before?.rules.butter_tip_rate).toBe(0.1);
    await db.exec(`UPDATE flights SET estimate=jsonb_set(estimate,'{rules}','{"butter_tip_rate":0.1}') WHERE id='${flight}'`);
    expect((await settle()).rows[0]?.result.passenger_tip).toBe(100);
  });
  it('accepts a PIREP without touchdown data, but rejects invalid touchdown', () => {
    expect(pirepSchema.safeParse({ fuel_used_gal: 8, flight_time_hours: 1 }).success).toBe(true);
    expect(pirepSchema.safeParse({ fuel_used_gal: 8, flight_time_hours: 1, landing_rate_fpm: 'bad' }).success).toBe(false);
  });
});