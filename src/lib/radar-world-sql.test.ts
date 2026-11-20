// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
type Row = { icao: string; flights_7d: number; grounded_aircraft_count: number };
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE airports(icao text PRIMARY KEY,size integer);
    CREATE TABLE fleet_aircraft(location_icao text, returned_at timestamptz, status text);
    CREATE TABLE flights(origin_icao text,destination_icao text,status text,created_at timestamptz,completed_at timestamptz);
    ALTER TABLE fleet_aircraft ENABLE ROW LEVEL SECURITY; ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
    INSERT INTO airports SELECT 'A'||i,1+i%7 FROM generate_series(1,49501) i;`);
  await db.exec(readFileSync('drizzle/migrations/0043_radar_world_activity.sql', 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE flights,fleet_aircraft;
    INSERT INTO fleet_aircraft VALUES('PARK',NULL,'AVAILABLE'),('PARK',NULL,'DISPATCHED'),('AIR',NULL,'EN_ROUTE'),('OLD',now(),'AVAILABLE');
    INSERT INTO flights VALUES('DEP','ARR','EN_ROUTE',now(),NULL),('DEP','ARR','DISPATCHED',now(),NULL),
      ('DEP','ARR','COMPLETED',now(),now()),('CANCEL','CANCEL','CANCELLED',now(),NULL),
      ('STALE','STALE','COMPLETED',now()-interval '8 days',now()-interval '8 days');`);
});
afterAll(() => db.close());
const rows = async () => (await db.query<Row>('SELECT * FROM get_radar_world_activity()')).rows;
describe('safe world activity production SQL', () => {
  it('counts all parked active aircraft, excluding returned and en-route aircraft', async () => {
    expect(await rows()).toContainEqual({ icao: 'PARK', flights_7d: 0, grounded_aircraft_count: 2 });
    expect((await rows()).some(r => ['AIR', 'OLD'].includes(r.icao))).toBe(false);
  });
  it('counts non-cancelled departures and completed arrivals over seven days only', async () => {
    expect(await rows()).toContainEqual({ icao: 'DEP', flights_7d: 3, grounded_aircraft_count: 0 });
    expect(await rows()).toContainEqual({ icao: 'ARR', flights_7d: 1, grounded_aircraft_count: 0 });
    expect((await rows()).some(r => ['CANCEL', 'STALE'].includes(r.icao))).toBe(false);
  });
  it('exposes only airport counts to anonymous readers despite private source RLS', async () => {
    await db.exec('SET ROLE anon');
    const result = await rows();
    expect(result).toHaveLength(3);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(['flights_7d', 'grounded_aircraft_count', 'icao']);
    await expect(db.query('SELECT * FROM flights')).rejects.toThrow();
  });
  it('allows authenticated readers without owner filtering', async () => {
    await db.exec('SET ROLE authenticated');
    expect(await rows()).toContainEqual({ icao: 'PARK', flights_7d: 0, grounded_aircraft_count: 2 });
  });
  it('never truncates world activity to 500 or 1000 ports in a 49,501-airport world', async () => {
    await db.exec(`INSERT INTO fleet_aircraft SELECT 'A'||i,NULL,'AVAILABLE' FROM generate_series(1,1200) i`);
    expect(await rows()).toHaveLength(1203);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM airports')).rows[0]?.n).toBe(49501);
  });
});