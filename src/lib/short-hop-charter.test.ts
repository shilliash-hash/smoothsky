// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
type Quote = { revenue: number; ticket_revenue: number; cargo_revenue: number; handling_fee: number; landing_fee: number; distance_nm: number; short_hop_charter: { rate: number; multiplier: number; reduced: boolean }; rules: unknown };
const sql = (file: string) => readFileSync(`drizzle/migrations/${file}`, 'utf8');
const definition = (file: string, name: string) => {
  const match = sql(file).match(new RegExp(`CREATE OR REPLACE FUNCTION public.${name}\\([\\s\\S]*?END \\$\\$;`));
  if (!match?.[0]) throw new Error(`Missing ${name}`);
  return match[0];
};
const quote = async (nm?: number, cargo = 0, allCargo = false, destination = 'SHORT') => {
  await db.query("SELECT set_config('test.distance',$1,false)", [nm === undefined ? '' : String(nm)]);
  const result = await db.query<{ q: Quote }>('SELECT flight_quote_full($1,$2,$3,$4) q', [aircraft, destination, cargo, allCargo]);
  const q = result.rows[0]?.q;
  if (!q) throw new Error('No quote');
  return q;
};
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
    CREATE TABLE companies(id uuid,user_id uuid);
    CREATE TABLE fleet_aircraft(id uuid,company_id uuid,location_icao text,aircraft_type_id text,status text,returned_at timestamptz);
    CREATE TABLE aircraft_types(id text,tier int,pax int,cargo_kg numeric,range_nm int,minimum_runway_ft int,cruise_kts numeric,fuel_burn_gph numeric,fuel_type text,fuel_capacity_gal numeric);
    CREATE TABLE airports(icao text PRIMARY KEY,iata text,name text,city text,size int,lat double precision,lon double precision,longest_runway_ft int,fuel_100ll_available boolean,fuel_jeta_available boolean);
    CREATE TABLE company_fobs(id uuid,company_id uuid,airport_icao text,has_fuel_contract boolean,has_handling_desk boolean,has_maintenance_bay boolean,closed_at timestamptz);
    CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb);
    CREATE TABLE operating_rules(singleton boolean,cargo_airport_fee_discount numeric,cargo_pax_rate_ratio numeric,all_cargo_capacity_bonus numeric);
    CREATE TABLE special_missions(id uuid,accepted_by uuid,status text,origin_icao text,destination_icao text,cargo_kg numeric,category text,payout numeric);
    CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=$1 $$;
    CREATE FUNCTION passenger_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT CASE WHEN $1='ORIG' THEN 100 ELSE 0 END::numeric $$;
    CREATE FUNCTION passenger_capacity(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 100::numeric $$;
    CREATE FUNCTION cargo_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1000::numeric $$;
    CREATE FUNCTION settle_flight(uuid,jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE item record; delta numeric; BEGIN FOR item IN SELECT 0 change LOOP delta:=item.change; END LOOP; RETURN '{}'::jsonb; END $$;
    INSERT INTO companies VALUES('${company}','${owner}');
    INSERT INTO fleet_aircraft VALUES('${aircraft}','${company}','ORIG','T1','AVAILABLE',NULL);
    INSERT INTO aircraft_types VALUES('T1',1,3,1000,640,1000,120,8,'100LL',100);
    INSERT INTO airports VALUES('ORIG',NULL,'Origin','Origin',1,0,0,5000,true,true),('SHORT',NULL,'Short','Short',1,0.8,0,5000,true,true),('LONG',NULL,'Long','Long',1,1.8,0,5000,true,true),('ALT',NULL,'Alt','Alt',1,1.9,0,5000,true,true);
    INSERT INTO operating_rules VALUES(true,0.4,0.6,0.5);
    INSERT INTO economy_config VALUES('fare_per_nm','0.18'),('charter_by_tier','[65,50,35,20,0,0,0]'),('transit_cap','1.5'),('fuel_reserve_minutes','30'),('fuel_price_100ll','8.2'),('landing_base_fee','20'),('airport_fee_multipliers','[1,1,1,1,1,1,1]'),('handling_rate','0.05'),('maintenance_per_hour','10'),('fob_handling_discount','0.2');`);
  // Keep the production pricing function; inject only exact distance input for boundary tests.
  const base = definition('0003_flight_economy_functions.sql', 'flight_quote')
    .replace('public.flight_quote(', 'public.flight_quote_without_fobs(')
    .replace('IF nm>t.range_nm', "nm:=coalesce(nullif(current_setting('test.distance',true),'')::numeric,nm); IF nm>t.range_nm");
  await db.exec(base);
  await db.exec(definition('0027_cargo_and_special_missions.sql', 'flight_quote_cargo'));
  await db.exec(definition('0027_cargo_and_special_missions.sql', 'flight_quote_full'));
  await db.exec(sql('0040_company_fbo_free_handling.sql'));
  await db.exec(sql('0045_short_hop_charter_reduction.sql'));
  const bounded = sql('0041_bounded_dispatch_and_radar_airports.sql');
  await db.exec(bounded.slice(bounded.indexOf('CREATE OR REPLACE FUNCTION public.airport_distance_nm'), bounded.indexOf('DO $migration$')));
  await db.exec(sql('0042_airport_search_nullable_code_ordering.sql'));
  await db.exec(sql('0044_dispatch_destination_deals.sql'));
}, 30000);
beforeEach(async () => {
  await db.exec(`SELECT set_config('test.user','${owner}',false); SELECT set_config('test.distance','',false); SELECT set_config('smoothsky.cargo','',false);
    TRUNCATE company_fobs; UPDATE aircraft_types SET tier=1;
    INSERT INTO economy_config VALUES('short_hop_threshold_nm','80'),('short_hop_charter_multiplier','0.5') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`);
});
afterAll(() => db.close());
describe('production short-hop charter pricing', () => {
  it.each([50, 79.999])('halves charter below 80 NM (%s) but preserves distance fare', async nm => {
    const q = await quote(nm);
    expect(q.short_hop_charter).toMatchObject({ rate: 32.5, multiplier: 0.5, reduced: true });
    expect(q.revenue).toBe(Math.round(3 * (nm * 0.18 + 32.5) * 100) / 100);
  });
  it.each([80, 80.001, 120])('pays full charter at and above 80 NM (%s)', async nm => {
    const q = await quote(nm);
    expect(q.short_hop_charter).toMatchObject({ rate: 65, multiplier: 1, reduced: false });
    expect(q.revenue).toBe(Math.round(3 * (nm * 0.18 + 65) * 100) / 100);
  });
  it('freezes exact eligibility even when 79.999 NM rounds to 80 in the UI', async () => {
    const q = await quote(79.999);
    expect(q.distance_nm).toBe(80);
    expect(q.short_hop_charter.reduced).toBe(true);
  });
  it.each([[1,32.5],[2,25],[3,17.5],[4,10],[5,0],[6,0],[7,0]])('applies tier %s short-hop rate %s', async (tier, rate) => {
    await db.query('UPDATE aircraft_types SET tier=$1', [tier]);
    expect((await quote(50)).short_hop_charter.rate).toBe(rate);
  });
  it('uses editable settings and retains previous quote snapshots', async () => {
    const frozen = await quote(50);
    await db.exec(`UPDATE economy_config SET value='0.75' WHERE key='short_hop_charter_multiplier'; UPDATE economy_config SET value='40' WHERE key='short_hop_threshold_nm'`);
    expect((await quote(50)).short_hop_charter.rate).toBe(65);
    expect((await quote(30)).short_hop_charter.rate).toBe(48.75);
    expect(frozen.revenue).toBe(124.5);
  });
  it('keeps FBO handling halves/waivers with reduced revenue', async () => {
    expect((await quote(50)).handling_fee).toBe(12.45);
    await db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','ORIG',false,false,false,NULL)`);
    expect((await quote(50)).handling_fee).toBe(6.23);
    await db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','SHORT',false,true,false,NULL)`);
    const q = await quote(50);
    expect(q.handling_fee).toBe(0);
    expect(q.landing_fee).toBe(16);
    expect(q.revenue).toBe(124.5);
  });
  it.each([false,true])('shares reduced fare with cargo while preserving cargo mechanics (all cargo %s)', async allCargo => {
    const q = await quote(50, 100, allCargo);
    expect(q.cargo_revenue).toBe(24.9);
    expect(q.ticket_revenue).toBe(allCargo ? 0 : 124.5);
    expect(q.revenue).toBe(allCargo ? 24.9 : 149.4);
    expect(q.landing_fee).toBe(allCargo ? 12 : 20);
    expect((await quote(80,100,allCargo)).cargo_revenue).toBe(47.64);
  });
  it('makes nearby and search deal estimates identical to the shared quote', async () => {
    for (const term of [null, 'SHORT']) {
      const rows = (await db.query<{ airport: { icao: string }; estimated_revenue: string; estimated_margin: string }>('SELECT * FROM get_dispatch_destination_deals($1,ARRAY[1],$2)', [aircraft,term])).rows;
      const row = rows.find(r => r.airport.icao === 'SHORT');
      const q = await quote();
      expect(Number(row?.estimated_revenue)).toBe(q.revenue);
      const net = q as Quote & { net: number };
      expect(Number(row?.estimated_margin)).toBe(net.net);
      expect(q.short_hop_charter.reduced).toBe(true);
    }
  });
  it('makes alternatives and margin differences match reduced/full target quotes', async () => {
    const rows = (await db.query<{ airport: { icao: string }; estimated_margin: string; margin_diff_vs_target: string }>('SELECT * FROM get_destination_alternatives($1,\'SHORT\',150,ARRAY[1])', [aircraft])).rows;
    const target = await quote() as Quote & { net: number };
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const q = await quote(undefined,0,false,row.airport.icao) as Quote & { net: number };
      expect(Number(row.estimated_margin)).toBe(q.net);
      expect(Number(row.margin_diff_vs_target)).toBeCloseTo(q.net-target.net,2);
      expect(q.short_hop_charter.reduced).toBe(false);
    }
  });
});