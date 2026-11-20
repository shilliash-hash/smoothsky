// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dispatchAirportTiers, DISPATCH_SEARCH_DEBOUNCE_MS } from './dispatch-airports';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
type Result = { airport: { icao: string; size: number }; distance_nm: number | null; is_fbo: boolean };
const nearby = (tiers: number[] | null = null, id = aircraft) => db.query<Result>('SELECT * FROM get_dispatch_nearby_airports($1,$2)', [id, tiers]);
const search = (q: string, origin: string | null = 'ORIG', tiers = [1,2,3,4,5,6,7], runway = 0, limit = 40) => db.query<Result>('SELECT * FROM search_airports($1,$2,$3,$4,$5)', [q, origin, tiers, runway, limit]);

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
    CREATE TABLE airports(icao text PRIMARY KEY,iata text,name text,city text,size int,lat double precision,lon double precision,longest_runway_ft int,development_level int DEFAULT 1);
    CREATE TABLE companies(id uuid,user_id uuid);
    CREATE TABLE aircraft_types(id text,range_nm int,minimum_runway_ft int,tier int);
    CREATE TABLE fleet_aircraft(id uuid,company_id uuid,aircraft_type_id text,location_icao text,returned_at timestamptz);
    CREATE TABLE company_fobs(company_id uuid,airport_icao text,closed_at timestamptz);
    CREATE TABLE flights(origin_icao text,destination_icao text,status text,created_at timestamptz,completed_at timestamptz);
    CREATE TABLE economy_config(key text,value jsonb);
    CREATE TABLE airport_passenger_pools(airport_icao text,stock numeric,updated_at timestamptz,last_departure_at timestamptz);
    CREATE TABLE airport_fuel_rules(size int,fuel_type text,capacity_gal numeric,development_multiplier numeric,refill_per_hour numeric);
    CREATE TABLE airport_fuel_pools(airport_icao text,fuel_type text,stock_gal numeric,updated_at timestamptz);
    INSERT INTO economy_config VALUES('airport_capacities','[100,200,300,400,500,600,700]'),('initial_stock','0.5');
    INSERT INTO companies VALUES('${company}','${owner}');
    INSERT INTO aircraft_types VALUES('TEST',300,1000,3);
    INSERT INTO fleet_aircraft VALUES('${aircraft}','${company}','TEST','ORIG',NULL);`);
  await db.exec(readFileSync('drizzle/migrations/0009_optimize_radar_metrics.sql','utf8'));
  const migration = readFileSync('drizzle/migrations/0041_bounded_dispatch_and_radar_airports.sql','utf8')
    .replace(/^CREATE EXTENSION.*\n/gm, '').replace(/^CREATE INDEX.*\n/gm, '');
  await db.exec(migration);
  await db.exec(readFileSync('drizzle/migrations/0042_airport_search_nullable_code_ordering.sql','utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`SELECT set_config('test.user','${owner}',false);
    TRUNCATE airports,company_fobs,flights;
    UPDATE aircraft_types SET tier=3; UPDATE fleet_aircraft SET returned_at=NULL;
    INSERT INTO airports(icao,iata,name,city,size,lat,lon,longest_runway_ft) VALUES('ORIG','ORG','Origin','Origin',3,0,0,5000);
    INSERT INTO airports(icao,name,city,size,lat,lon,longest_runway_ft) SELECT 'A'||lpad(i::text,4,'0'),'Airport '||i,'City',3,i*0.01,0,3000 FROM generate_series(1,100) i;`);
});
afterAll(() => db.close());

describe('bounded production airport RPCs', () => {
  it('returns at most 60 nearest ports from a 49,501-airport catalogue', async () => {
    await db.exec("INSERT INTO airports(icao,name,city,size,lat,lon,longest_runway_ft) SELECT 'W'||i,'World '||i,'World',4,50,50,5000 FROM generate_series(1,49400) i");
    expect((await db.query<{n:number}>('SELECT count(*)::int n FROM airports')).rows[0]?.n).toBe(49501);
    const rows = (await nearby()).rows;
    expect(rows).toHaveLength(60);
    expect(rows[0]?.airport.icao).toBe('A0001');
    expect(rows[59]?.airport.icao).toBe('A0060');
  });
  it('includes a reachable own FBO beyond the nearest 60 and sorts by distance', async () => {
    await db.exec(`INSERT INTO company_fobs VALUES('${company}','A0100',NULL)`);
    const rows = (await nearby()).rows;
    expect(rows).toHaveLength(60);
    expect(rows[59]).toMatchObject({airport:{icao:'A0100'},is_fbo:true});
  });
  it('does not promote closed or foreign FBOs', async () => {
    await db.exec(`INSERT INTO company_fobs VALUES('${company}','A0100',now()),('${owner}','A0099',NULL)`);
    expect((await nearby()).rows.at(-1)?.airport.icao).toBe('A0060');
  });
  it('rejects another owner and retired aircraft', async () => {
    await db.exec("SELECT set_config('test.user','00000000-0000-4000-8000-000000000099',false)");
    expect((await nearby()).rows).toHaveLength(0);
    await db.exec(`SELECT set_config('test.user','${owner}',false); UPDATE fleet_aircraft SET returned_at=now()`);
    expect((await nearby()).rows).toHaveLength(0);
  });
  it('excludes T1 by default for aircraft T3, but an explicit T1 filter restores it', async () => {
    await db.exec('UPDATE airports SET size=1 WHERE icao=\'A0001\'');
    expect((await nearby()).rows[0]?.airport.icao).toBe('A0002');
    expect((await nearby([1])).rows[0]?.airport.icao).toBe('A0001');
  });
  it('includes T1 by default for aircraft T2', async () => {
    await db.exec("UPDATE aircraft_types SET tier=2; UPDATE airports SET size=1 WHERE icao='A0001'");
    expect((await nearby()).rows[0]?.airport.icao).toBe('A0001');
  });
  it('excludes origin, short runways and out-of-range ports, retaining unknown runways', async () => {
    await db.exec("UPDATE airports SET longest_runway_ft=900 WHERE icao='A0001'; UPDATE airports SET lat=50 WHERE icao='A0002'; UPDATE airports SET longest_runway_ft=NULL WHERE icao='A0003'");
    const rows = (await nearby()).rows;
    expect(rows[0]?.airport.icao).toBe('A0003');
    expect(rows.some(r => ['ORIG','A0001','A0002'].includes(r.airport.icao))).toBe(false);
  });
  it('crosses the international date line without losing nearby destinations', async () => {
    await db.exec("UPDATE airports SET lon=179.9 WHERE icao='ORIG'; UPDATE airports SET lat=0,lon=-179.9 WHERE icao='A0001'");
    expect((await nearby()).rows[0]?.airport.icao).toBe('A0001');
  });
  it('returns no candidates for an empty tier selection', async () => { expect((await nearby([])).rows).toHaveLength(0); });
  it('requires two search characters and caps oversized requests at 40', async () => {
    expect((await search('A')).rows).toHaveLength(0);
    expect((await search('Airport','ORIG',[3],0,999)).rows).toHaveLength(40);
  });
  it('sorts exact ICAO and IATA before nearer name matches without IATA', async () => {
    await db.exec("UPDATE airports SET name='A0100 matching' WHERE icao='A0001'; UPDATE airports SET iata='ZZZ' WHERE icao='A0100'; UPDATE airports SET name='ZZZ matching' WHERE icao='A0002'");
    expect((await search('A0100')).rows[0]?.airport.icao).toBe('A0100');
    expect((await search('ZZZ')).rows[0]?.airport.icao).toBe('A0100');
  });
  it('orders other matches by distance from the selected aircraft', async () => {
    expect((await search('Airport')).rows.slice(0,2).map(r => r.airport.icao)).toEqual(['A0001','A0002']);
  });
  it('applies tier and runway filters before the search limit', async () => {
    await db.exec("UPDATE airports SET size=1 WHERE icao='A0001'; UPDATE airports SET longest_runway_ft=900 WHERE icao='A0002'");
    expect((await search('Airport','ORIG',[3],1000)).rows[0]?.airport.icao).toBe('A0003');
  });
  it('keeps distances unknown without a selected origin', async () => {
    expect((await search('A0001',null)).rows[0]?.distance_nm).toBeNull();
  });
  it('computes aggregate supply and activity only for requested radar ports', async () => {
    await db.exec("INSERT INTO flights VALUES('A0001','A0002','EN_ROUTE',now(),NULL),('A0002','A0001','COMPLETED',now(),now())");
    const rows = (await db.query<{icao:string;operations_7d:number;pax_stock:string}>("SELECT * FROM radar_airport_metrics(ARRAY['A0001'])")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({icao:'A0001',operations_7d:2});
    expect(Number(rows[0]?.pax_stock)).toBe(150);
    expect((await db.query('SELECT * FROM radar_airport_metrics(ARRAY[]::text[])')).rows).toHaveLength(0);
  });
});
describe('dispatch filter defaults', () => {
  it('uses T2–7 for aircraft T3–7', () => { expect(dispatchAirportTiers(3,null)).toEqual([2,3,4,5,6,7]); });
  it('uses all airport tiers for aircraft T1–2', () => { expect(dispatchAirportTiers(2,null)).toEqual([1,2,3,4,5,6,7]); });
  it('preserves explicitly enabled T1', () => { expect(dispatchAirportTiers(7,[1,2])).toEqual([1,2]); });
  it('debounces search by 250 milliseconds', () => { expect(DISPATCH_SEARCH_DEBOUNCE_MS).toBe(250); });
});