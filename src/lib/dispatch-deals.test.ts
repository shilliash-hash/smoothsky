// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sortDestinationDeals, topDestinationDeals } from './dispatch-airports';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
type Row = { airport: { icao: string }; distance_nm: number; distance_from_target_nm: number; estimated_revenue: string | null; estimated_margin: string | null; margin_diff_vs_target: string | null; estimate_error: string | null };
const deals = (query: string | null = null, cargo = 0, allCargo = false) => db.query<Row>('SELECT * FROM get_dispatch_destination_deals($1,ARRAY[3],$2,$3,$4)', [aircraft, query, cargo, allCargo]);
const alternatives = (target = 'TARGET', radius = 150, tiers = [3]) => db.query<Row>('SELECT * FROM get_destination_alternatives($1,$2,$3,$4)', [aircraft, target, radius, tiers]);
const sql = (file: string) => readFileSync(`drizzle/migrations/${file}`, 'utf8');
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
    CREATE TABLE airports(icao text PRIMARY KEY,iata text,name text,city text,size int,lat double precision,lon double precision,longest_runway_ft int);
    CREATE TABLE companies(id uuid,user_id uuid);
    CREATE TABLE aircraft_types(id text,range_nm int,minimum_runway_ft int,tier int);
    CREATE TABLE fleet_aircraft(id uuid,company_id uuid,aircraft_type_id text,location_icao text,returned_at timestamptz);
    CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz);
    CREATE TABLE quote_calls(destination text,cargo int,all_cargo boolean);
    CREATE FUNCTION flight_quote_full(p_aircraft uuid,p_destination text,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE revenue numeric; handling numeric;
    BEGIN
      INSERT INTO quote_calls VALUES(p_destination,p_cargo_kg,p_all_cargo);
      IF p_destination='A0001' THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF;
      revenue:=1000+p_cargo_kg-CASE WHEN p_all_cargo THEN 500 ELSE 0 END;
      handling:=100*(1-(SELECT count(*)::numeric/2 FROM company_fobs WHERE company_id='${company}' AND airport_icao IN('ORIG',p_destination) AND closed_at IS NULL));
      RETURN jsonb_build_object('revenue',revenue,'net',revenue-100-handling);
    END $$;
    INSERT INTO companies VALUES('${company}','${owner}');
    INSERT INTO aircraft_types VALUES('TEST',300,1000,3);
    INSERT INTO fleet_aircraft VALUES('${aircraft}','${company}','TEST','ORIG',NULL);`);
  const bounded = sql('0041_bounded_dispatch_and_radar_airports.sql');
  const definitions = bounded.slice(bounded.indexOf('CREATE OR REPLACE FUNCTION public.airport_distance_nm'), bounded.indexOf('DO $migration$'));
  await db.exec(definitions);
  await db.exec(sql('0042_airport_search_nullable_code_ordering.sql'));
  await db.exec(sql('0044_dispatch_destination_deals.sql'));
}, 30000);
beforeEach(async () => {
  await db.exec(`SELECT set_config('test.user','${owner}',false); TRUNCATE airports,company_fobs,quote_calls;
    UPDATE aircraft_types SET range_nm=300; UPDATE fleet_aircraft SET returned_at=NULL;
    INSERT INTO airports VALUES('ORIG','ORG','Origin','Origin',3,0,0,5000),('TARGET',NULL,'Target','Target',3,1,0,5000);
    INSERT INTO airports(icao,name,city,size,lat,lon,longest_runway_ft) SELECT 'A'||lpad(i::text,4,'0'),'Airport '||i,'City',3,i*0.01,0,3000 FROM generate_series(1,100) i;`);
});
afterAll(() => db.close());

describe('bounded private destination estimates', () => {
  it('quotes at most 60 nearby results even with a 49,501-airport catalogue', async () => {
    await db.exec("INSERT INTO airports(icao,name,city,size,lat,lon,longest_runway_ft) SELECT 'W'||i,'World','World',4,50,50,5000 FROM generate_series(1,49399) i");
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM airports')).rows[0]?.n).toBe(49501);
    expect((await deals()).rows).toHaveLength(60);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM quote_calls')).rows[0]?.n).toBe(59);
  });
  it('quotes at most 40 search results, preserving exact code priority', async () => {
    expect((await deals('Airport')).rows).toHaveLength(40);
    expect((await deals('A0100')).rows[0]?.airport.icao).toBe('A0100');
    expect((await deals('A')).rows).toHaveLength(0);
  });
  it('uses the shared full quote and forwards cargo and All-Cargo without approximating economics', async () => {
    const row = (await deals('A0002',100,true)).rows[0];
    expect(Number(row?.estimated_revenue)).toBe(600);
    expect(Number(row?.estimated_margin)).toBe(400);
    expect((await db.query('SELECT * FROM quote_calls')).rows).toEqual([{ destination: 'A0002', cargo: 100, all_cargo: true }]);
  });
  it('preserves active owner FBO savings from the shared quote', async () => {
    await db.exec(`INSERT INTO company_fobs VALUES('${company}','ORIG',NULL),('${company}','A0002',NULL)`);
    expect(Number((await deals('A0002')).rows[0]?.estimated_margin)).toBe(900);
  });
  it('keeps failed estimates null rather than advertising a fabricated zero profit', async () => {
    expect((await deals('A0001')).rows[0]).toMatchObject({ estimated_margin: null, estimated_revenue: null, estimate_error: 'Insufficient airport fuel stock' });
  });
  it('denies foreign and anonymous owners for both RPCs', async () => {
    for (const user of ['00000000-0000-4000-8000-000000000099','']) {
      await db.query("SELECT set_config('test.user',$1,false)",[user]);
      await expect(deals()).rejects.toThrow('Aircraft not found');
      await expect(alternatives()).rejects.toThrow('Aircraft not found');
    }
  });
  it('denies retired aircraft', async () => {
    await db.exec('UPDATE fleet_aircraft SET returned_at=now()');
    await expect(deals()).rejects.toThrow('Aircraft not found');
  });
  it('returns only six nearest eligible alternatives and quotes just six plus the target', async () => {
    const rows = (await alternatives()).rows;
    expect(rows).toHaveLength(6);
    expect(rows.every(row => !['ORIG','TARGET'].includes(row.airport.icao))).toBe(true);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM quote_calls')).rows[0]?.n).toBe(7);
  });
  it('enforces the 150 NM radius even when caller requests a larger radius', async () => {
    await db.exec("TRUNCATE airports; INSERT INTO airports VALUES('ORIG',NULL,'O','O',3,0,0,5000),('TARGET',NULL,'T','T',3,1,0,5000),('IN',NULL,'I','I',3,3.4,0,5000),('OUT',NULL,'X','X',3,3.6,0,5000)");
    const rows = (await alternatives('TARGET',999)).rows;
    expect(rows.map(row => row.airport.icao)).toEqual(['IN']);
    expect(rows[0]?.distance_from_target_nm).toBeLessThanOrEqual(150);
  });
  it('filters range, runway, origin, destination and tiers before limiting to six', async () => {
    await db.exec("UPDATE airports SET longest_runway_ft=500 WHERE icao='A0099'; UPDATE airports SET size=1 WHERE icao='A0100'; UPDATE airports SET lat=10 WHERE icao='A0098'");
    const rows = (await alternatives()).rows;
    expect(rows).toHaveLength(6);
    expect(rows.some(row => ['A0099','A0100','A0098','ORIG','TARGET'].includes(row.airport.icao))).toBe(false);
    expect((await alternatives('TARGET',150,[])).rows).toHaveLength(0);
  });
  it('calculates a concrete margin difference using the target full quote', async () => {
    await db.exec(`INSERT INTO company_fobs VALUES('${company}','A0099',NULL)`);
    const row = (await alternatives()).rows[0];
    expect(row?.airport.icao).toBe('A0099');
    expect(Number(row?.estimated_margin)).toBe(850);
    expect(Number(row?.margin_diff_vs_target)).toBe(50);
  });
  it('includes alternatives across the international date line', async () => {
    await db.exec("UPDATE airports SET lat=0,lon=179.9 WHERE icao IN('ORIG','TARGET'); UPDATE airports SET lat=0,lon=-179.9 WHERE icao='A0002'");
    expect((await alternatives()).rows.map(row => row.airport.icao)).toEqual(['A0002']);
  });
});

describe('instant local deal sorting', () => {
  const rows = [
    { icao: 'A', distance_nm: 10, estimated_margin: -20 },
    { icao: 'B', distance_nm: 40, estimated_margin: 420 },
    { icao: 'C', distance_nm: 30, estimated_margin: 535 },
    { icao: 'D', distance_nm: 20, estimated_margin: 115 },
    { icao: 'E', distance_nm: 1, estimated_margin: null },
    { icao: 'F', distance_nm: 50, estimated_margin: 40 },
  ];
  it('sorts Best Deals descending with unavailable estimates last, without changing the input', () => {
    expect(sortDestinationDeals(rows,'best').map(row => row.icao)).toEqual(['C','B','D','F','A','E']);
    expect(rows[0]?.icao).toBe('A');
  });
  it('sorts Nearest by distance regardless of profit', () => { expect(sortDestinationDeals(rows,'nearest').map(row => row.icao)).toEqual(['E','A','D','C','B','F']); });
  it('marks only the top three positive opportunities in either sort mode', () => { expect([...topDestinationDeals(rows)]).toEqual(['C','B','D']); });
  it('does not mark zero or negative margin as a top opportunity', () => { expect(topDestinationDeals([{ icao:'A',distance_nm:1,estimated_margin:0 },{ icao:'B',distance_nm:2,estimated_margin:-1 }]).size).toBe(0); });
});