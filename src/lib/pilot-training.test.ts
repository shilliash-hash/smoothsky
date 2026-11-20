// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { hasRentalLicense } from './market-rules';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const file = (name: string) => readFileSync(`drizzle/migrations/${name}`, 'utf8');
const buy = (group = 'T3_4') => db.query('SELECT buy_type_rating($1)', [group]);
const ratings = async () => (await db.query<{ type_ratings: number[] }>('SELECT type_ratings FROM profiles WHERE id=$1', [owner])).rows[0]?.type_ratings;
const balances = async () => (await db.query<{ company: number; pilot: number }>(`SELECT company_balance('${company}')::float company, pilot_balance('${owner}')::float pilot`)).rows[0];

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, career_role text, callsign text, pilot_home_icao text, type_ratings int[] DEFAULT '{1,2}', roster_company_id uuid, roster_joined_at timestamptz);
    CREATE TABLE companies(id uuid PRIMARY KEY, user_id uuid, is_personal boolean DEFAULT false, name text, icao_code text, roster_commission_pct numeric);
    CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb);
    INSERT INTO economy_config VALUES ('type_rating_t3_4','15000'),('type_rating_t5','60000'),('type_rating_t6_7','150000');
    CREATE FUNCTION economy_number(k text) RETURNS numeric LANGUAGE sql AS $$ SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=k $$;
    CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,entry_type text CONSTRAINT company_ledger_entry_type_check CHECK(entry_type IS NOT NULL),debit_account text,credit_account text,amount numeric,company_delta numeric,balance_after numeric,description text,reference text,idempotency_key text UNIQUE,created_at timestamptz DEFAULT now());
    CREATE TABLE pilot_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid,entry_type text,amount numeric,balance_after numeric,description text);
    CREATE FUNCTION company_balance(c uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=c ORDER BY id DESC LIMIT 1),0) $$;
    CREATE FUNCTION pilot_balance(u uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM pilot_ledger WHERE user_id=u ORDER BY id DESC LIMIT 1),0) $$;
    CREATE FUNCTION process_due_obligations() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF coalesce(nullif(current_setting('test.due',true),''),'0')::numeric>0 THEN
        PERFORM company_post((SELECT id FROM companies WHERE user_id=auth.uid() AND NOT is_personal),'LEASE_PAYMENT','LEASE_EXPENSE','COMPANY_CASH',-current_setting('test.due')::numeric,'Due lease',NULL,'test_due');
      END IF;
    END $$;
    CREATE FUNCTION company_daily_results() RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce(sum(amount),0) FROM company_ledger WHERE entry_type IN ('SPOT_RENTAL') $$;
    CREATE FUNCTION pay_due_dividends(c uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce(sum(company_delta),0) FROM company_ledger WHERE company_id=c AND entry_type IN ('SPOT_RENTAL') $$;`);
  for (const name of ['company_post', 'pilot_post']) {
    const definition = file('0025_pilot_flights_stakes_personal_hangar.sql').match(new RegExp(`CREATE OR REPLACE FUNCTION public.${name}[\\s\\S]*?END \\$\\$;`))?.[0];
    if (!definition) throw new Error(`Missing ${name}`);
    await db.exec(definition);
  }
  await db.exec(file('0047_baseline_ratings_company_training.sql'));
}, 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE profiles,companies,company_ledger,pilot_ledger;
    SELECT set_config('test.uid','${owner}',false),set_config('test.due','0',false);
    UPDATE economy_config SET value='15000' WHERE key='type_rating_t3_4';
    INSERT INTO profiles(id,career_role) VALUES('${owner}','ENTREPRENEUR'),('${other}','PILOT_ONLY');
    INSERT INTO companies(id,user_id,name) VALUES('${company}','${owner}','Training Test');
    SELECT company_post('${company}','INITIAL_GRANT','COMPANY_CASH','EQUITY',30000,'Starting funds',NULL,'initial');`);
});
afterAll(async () => { await db.close(); });

describe('baseline licences and atomic training payments', () => {
  it('includes exactly T1–T3 for new pilots and removes their rental licence gates', async () => {
    const tiers = await ratings();
    expect(tiers).toEqual([1, 2, 3]);
    for (const tier of [1, 2, 3]) expect(hasRentalLicense(tier, tiers ?? [])).toBe(true);
    expect(hasRentalLicense(4, tiers ?? [])).toBe(false);
  });
  it('preserves paid higher ratings while adding missing baseline licences', async () => {
    await db.exec(`UPDATE profiles SET type_ratings='{1,2,5,6,7}' WHERE id='${owner}'`);
    expect(await ratings()).toEqual([1, 2, 3, 5, 6, 7]);
  });
  it('backfills historical pilots without touching balances', async () => {
    await db.exec(`ALTER TABLE profiles DISABLE TRIGGER profiles_baseline_type_ratings; UPDATE profiles SET type_ratings='{1,2,5}'; ALTER TABLE profiles ENABLE TRIGGER profiles_baseline_type_ratings;`);
    await db.exec(readFileSync('scripts/grant-baseline-ratings.sql', 'utf8'));
    expect(await ratings()).toEqual([1, 2, 3, 5]);
    expect(await balances()).toEqual({ company: 30000, pilot: 0 });
  });
  it('charges 15000 SC to an owner company with a zero pilot wallet and unlocks T4', async () => {
    await buy();
    expect(await balances()).toEqual({ company: 15000, pilot: 0 });
    expect(await ratings()).toEqual([1, 2, 3, 4]);
    expect((await db.query("SELECT entry_type,debit_account,company_delta::float delta FROM company_ledger WHERE entry_type='TYPE_RATING'")).rows).toEqual([{ entry_type: 'TYPE_RATING', debit_account: 'TRAINING_EXPENSE', delta: -15000 }]);
  });
  it('never credits or debits the owner wallet', async () => {
    await db.exec(`SELECT pilot_post('${owner}','FLIGHT_COMMISSION',20000,'Pilot earnings')`);
    await buy();
    expect(await balances()).toEqual({ company: 15000, pilot: 20000 });
  });
  it('does not double-charge repeated purchases', async () => {
    await buy();
    await expect(buy()).rejects.toThrow('Licence already held');
    expect(await balances()).toEqual({ company: 15000, pilot: 0 });
  });
  it('rejects insufficient company funds even if the pilot wallet is funded', async () => {
    await db.exec(`SELECT pilot_post('${owner}','FLIGHT_COMMISSION',60000,'Earnings')`);
    await expect(buy('T5')).rejects.toThrow('Insufficient company balance');
    expect(await ratings()).toEqual([1, 2, 3]);
    expect(await balances()).toEqual({ company: 30000, pilot: 60000 });
  });
  it('synchronizes due obligations before checking training affordability', async () => {
    await db.exec("SELECT set_config('test.due','16000',false)");
    await expect(buy()).rejects.toThrow('Insufficient company balance');
    expect(await ratings()).toEqual([1, 2, 3]);
  });
  it('keeps wallet-funded training for freelancers and cannot spend a roster company balance', async () => {
    await db.exec(`SELECT set_config('test.uid','${other}',false); UPDATE profiles SET roster_company_id='${company}' WHERE id='${other}'; SELECT pilot_post('${other}','FLIGHT_COMMISSION',20000,'Earnings')`);
    await buy();
    expect((await db.query(`SELECT pilot_balance('${other}')::float balance`)).rows[0]).toEqual({ balance: 5000 });
    expect((await balances())?.company).toBe(30000);
  });
  it('never uses a personal hangar as training company', async () => {
    await db.exec(`UPDATE companies SET is_personal=true; SELECT pilot_post('${owner}','FLIGHT_COMMISSION',15000,'Earnings')`);
    await buy();
    expect(await balances()).toEqual({ company: 30000, pilot: 0 });
  });
  it('uses the live configured training price', async () => {
    await db.exec("UPDATE economy_config SET value='12500' WHERE key='type_rating_t3_4'");
    await buy();
    expect((await balances())?.company).toBe(17500);
  });
  it.each([['T5', 60000, [1, 2, 3, 5]], ['T6_7', 150000, [1, 2, 3, 6, 7]]] as const)('buys %s from the company at its configured price', async (group, price, expected) => {
    await db.exec(`SELECT company_post('${company}','INITIAL_GRANT','COMPANY_CASH','EQUITY',${price - 30000},'Test funds',NULL,'extra')`);
    await buy(group);
    expect(await ratings()).toEqual(expected);
    expect(await balances()).toEqual({ company: 0, pilot: 0 });
  });
  it('includes company training in expenses and dividend profit', async () => {
    await buy();
    expect((await db.query(`SELECT company_daily_results()::float expenses,pay_due_dividends('${company}')::float profit`)).rows[0]).toEqual({ expenses: 15000, profit: -15000 });
  });
  it('rejects unauthenticated and unknown licence purchases', async () => {
    await expect(buy('T1')).rejects.toThrow('Unknown licence');
    await db.exec("SELECT set_config('test.uid','',false)");
    await expect(buy()).rejects.toThrow('Not authenticated');
  });
  it('exposes only the caller’s training company', async () => {
    expect((await db.query<{ p: { training_company: { id: string; balance: number } } }>('SELECT my_pilot_profile() p')).rows[0]?.p.training_company).toMatchObject({ id: company, balance: 30000 });
    await db.exec(`SELECT set_config('test.uid','${other}',false)`);
    expect((await db.query<{ p: { training_company: null } }>('SELECT my_pilot_profile() p')).rows[0]?.p.training_company).toBeNull();
  });
  it('denies anonymous execution and allows authenticated purchase', async () => {
    expect((await db.query("SELECT has_function_privilege('anon','buy_type_rating(text)','EXECUTE') anon,has_function_privilege('authenticated','buy_type_rating(text)','EXECUTE') authenticated")).rows[0]).toEqual({ anon: false, authenticated: true });
  });
});