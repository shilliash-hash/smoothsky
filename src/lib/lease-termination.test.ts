// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
const contract = '00000000-0000-4000-8000-000000000004';
const other = '00000000-0000-4000-8000-000000000005';
const db = new PGlite();
const sql = (file: string) => readFileSync(`drizzle/migrations/${file}`, 'utf8');
const terminate = () => db.query<{ result: { penalty: number; refund: number; balance_after: number } }>(`SELECT terminate_lease_early('${aircraft}') result`);

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,is_personal boolean DEFAULT false);
    CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,ownership text DEFAULT 'LEASED',returned_at timestamptz,status text DEFAULT 'AVAILABLE',reserved_by uuid,reserved_until timestamptz,lease_deposit numeric DEFAULT 3000,registration text,purchase_price numeric DEFAULT 0,next_payment_due timestamptz);
    CREATE TABLE lease_contracts(id uuid PRIMARY KEY,aircraft_id uuid,company_id uuid,starts_at timestamptz,ends_at timestamptz,term_weeks int DEFAULT 4,weekly_rate numeric DEFAULT 950,paid_weeks int DEFAULT 1);
    CREATE TABLE flights(id uuid PRIMARY KEY,aircraft_id uuid,status text);
    CREATE TABLE operating_rules(singleton boolean DEFAULT true);
    INSERT INTO operating_rules DEFAULT VALUES;
    CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,entry_type text CONSTRAINT company_ledger_entry_type_check CHECK(entry_type IS NOT NULL),debit_account text,credit_account text,amount numeric,company_delta numeric,balance_after numeric,description text,reference text,idempotency_key text UNIQUE,created_at timestamptz DEFAULT now());
    CREATE FUNCTION company_balance(p_company uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=p_company ORDER BY id DESC LIMIT 1),0) $$;
  `);
  const post = sql('0025_pilot_flights_stakes_personal_hangar.sql').match(/CREATE OR REPLACE FUNCTION public.company_post[\s\S]*?END \$\$;/)?.[0];
  if (!post) throw new Error('Missing production ledger function');
  await db.exec(post);
  // Apply the same historical billing guards as migrations 0016 and 0020.
  const sync = sql('0011_harden_lease_billing.sql').split('\n')[0];
  if (!sync) throw new Error('Missing production lease billing');
  await db.exec(sync.replace('FROM lease_contracts WHERE company_id=v_company.id ORDER BY', "FROM lease_contracts WHERE company_id=v_company.id AND EXISTS(SELECT 1 FROM fleet_aircraft fa WHERE fa.id=lease_contracts.aircraft_id AND fa.returned_at IS NULL AND fa.ownership='LEASED') ORDER BY").replace('AND fa.returned_at IS NULL;', "AND fa.returned_at IS NULL AND fa.ownership='LEASED';"));
  await db.exec('CREATE FUNCTION process_due_obligations() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM sync_lease_payments(); END $$;');
  const daily = sql('0014_daily_results_and_test_simulation.sql').split(';')[0];
  if (!daily) throw new Error('Missing production daily results');
  await db.exec(daily.replace("'MAINTENANCE_RESERVE'))", "'MAINTENANCE_RESERVE','FOB_UPKEEP','SPOT_RENTAL'))").replace('least(k.ends_at,now(),', 'least(k.ends_at,(SELECT coalesce(returned_at,k.ends_at) FROM fleet_aircraft WHERE id=k.aircraft_id),now(),'));
  await db.exec(sql('0038_early_lease_termination.sql'));
}, 30000);

beforeEach(async () => {
  await db.exec(`TRUNCATE company_ledger,flights,lease_contracts,fleet_aircraft,companies;
    SELECT set_config('test.uid','${owner}',false);
    INSERT INTO companies(id,user_id) VALUES('${company}','${owner}');
    INSERT INTO fleet_aircraft(id,company_id,registration) VALUES('${aircraft}','${company}','SP-TEST'),('${other}','${company}','SP-OTHER');
    INSERT INTO lease_contracts(id,aircraft_id,company_id,starts_at,ends_at) VALUES('${contract}','${aircraft}','${company}',now()-interval '1 day',now()+interval '27 days'),('${other}','${other}','${company}',now()-interval '1 day',now()+interval '27 days');
    INSERT INTO company_ledger(company_id,entry_type,amount,company_delta,balance_after,reference) VALUES('${company}','LEASE_PAYMENT',950,-950,26050,'SP-TEST');`);
});
afterAll(async () => { await db.close(); });

describe('early lease termination SQL', () => {
  it('withholds rounded 25% and refunds deposit minus fee without refunding the paid week', async () => {
    const result = (await terminate()).rows[0]?.result;
    expect(result).toMatchObject({ penalty: 750, refund: 2250, balance_after: 28300 });
    const ledger = await db.query<{ entry_type: string; delta: string }>("SELECT entry_type,company_delta::text delta FROM company_ledger ORDER BY id");
    expect(ledger.rows).toEqual([{ entry_type: 'LEASE_PAYMENT', delta: '-950' }, { entry_type: 'LEASE_DEPOSIT_REFUND', delta: '3000' }, { entry_type: 'LEASE_TERMINATION_FEE', delta: '-750' }]);
  });
  it('rounds the penalty to whole coins, deriving refund by subtraction', async () => {
    await db.exec(`UPDATE fleet_aircraft SET lease_deposit=3002 WHERE id='${aircraft}'`);
    expect((await terminate()).rows[0]?.result).toMatchObject({ penalty: 751, refund: 2251 });
  });
  it('posts already-due weekly payments before returning the deposit', async () => {
    await db.exec(`UPDATE lease_contracts SET starts_at=now()-interval '8 days',ends_at=now()+interval '20 days' WHERE id='${contract}'`);
    expect((await terminate()).rows[0]?.result.balance_after).toBe(27350);
    expect((await db.query(`SELECT paid_weeks FROM lease_contracts WHERE id='${contract}'`)).rows[0]).toEqual({ paid_weeks: 2 });
  });
  it('preserves contractual dates, other leases and all historical rows', async () => {
    const before = await db.query('SELECT id,starts_at,ends_at FROM lease_contracts ORDER BY id');
    await terminate();
    expect((await db.query('SELECT id,starts_at,ends_at FROM lease_contracts ORDER BY id')).rows).toEqual(before.rows);
    expect((await db.query(`SELECT status,returned_at FROM fleet_aircraft WHERE id='${other}'`)).rows[0]).toEqual({ status: 'AVAILABLE', returned_at: null });
    expect((await db.query(`SELECT termination_status,ended_at IS NOT NULL ended FROM lease_contracts WHERE id='${contract}'`)).rows[0]).toEqual({ termination_status: 'TERMINATED', ended: true });
  });
  it('never bills the returned aircraft for future weeks', async () => {
    await terminate();
    await db.exec(`UPDATE lease_contracts SET starts_at=now()-interval '22 days' WHERE id='${contract}'; SELECT sync_lease_payments();`);
    expect((await db.query("SELECT count(*)::int count FROM company_ledger WHERE entry_type='LEASE_PAYMENT' AND reference='SP-TEST'")).rows[0]).toEqual({ count: 1 });
  });
  it('rejects duplicate termination without a second refund', async () => {
    await terminate();
    await expect(terminate()).rejects.toThrow('Aircraft already returned');
    expect((await db.query('SELECT count(*)::int count FROM company_ledger')).rows[0]).toEqual({ count: 3 });
  });
  it.each(['DISPATCHED', 'EN_ROUTE'])('blocks %s flights even if aircraft status is stale', async (status) => {
    await db.exec(`INSERT INTO flights VALUES('${other}','${aircraft}','${status}')`);
    await expect(terminate()).rejects.toThrow('Complete or cancel active flights');
  });
  it('blocks a live crew reservation', async () => {
    await db.exec(`UPDATE fleet_aircraft SET reserved_by='${other}',reserved_until=now()+interval '20 minutes' WHERE id='${aircraft}'`);
    await expect(terminate()).rejects.toThrow('reserved by a crew pilot');
  });
  it('clears expired reservations on return', async () => {
    await db.exec(`UPDATE fleet_aircraft SET reserved_by='${other}',reserved_until=now()-interval '1 minute' WHERE id='${aircraft}'`);
    await terminate();
    expect((await db.query(`SELECT reserved_by,reserved_until FROM fleet_aircraft WHERE id='${aircraft}'`)).rows[0]).toEqual({ reserved_by: null, reserved_until: null });
  });
  it.each(['OWNED', 'RENTAL'])('rejects %s aircraft', async (ownership) => {
    await db.exec(`UPDATE fleet_aircraft SET ownership='${ownership}' WHERE id='${aircraft}'`);
    await expect(terminate()).rejects.toThrow('Only leased aircraft');
  });
  it('keeps expired contracts on the full-deposit standard return path', async () => {
    await db.exec(`UPDATE lease_contracts SET ends_at=now()-interval '1 second' WHERE id='${contract}'`);
    await expect(terminate()).rejects.toThrow('standard return for a full deposit refund');
  });
  it('rejects another company aircraft', async () => {
    await db.exec(`UPDATE fleet_aircraft SET company_id='${other}' WHERE id='${aircraft}'`);
    await expect(terminate()).rejects.toThrow('Aircraft not found');
  });
  it('rejects unauthenticated access', async () => {
    await db.exec("SELECT set_config('test.uid','',false)");
    await expect(terminate()).rejects.toThrow('Authentication required');
  });
  it('includes termination fee in aircraft and company expenses and stops accrued lease costs', async () => {
    await terminate();
    const finance = await db.query<{ result: { termination_fee: number; lease_accrued: number } }>(`SELECT aircraft_finance('${aircraft}') result`);
    expect(finance.rows[0]?.result.termination_fee).toBe(750);
    expect(finance.rows[0]?.result.lease_accrued).toBeCloseTo(950 / 7, 1);
    const daily = await db.query<{ expenses: string }>('SELECT expenses::text FROM company_daily_results() WHERE day=current_date');
    expect(Number(daily.rows[0]?.expenses)).toBeGreaterThanOrEqual(750);
  });
});