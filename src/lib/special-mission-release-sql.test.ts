// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), other = id(2), company = id(10), aircraft = id(20), flight = id(30), mission = id(40);
const one = async (sql: string) => (await db.query(sql)).rows[0];
const asUser = (user: string) => db.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: user })]);

beforeAll(async () => {
  await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
  CREATE TABLE airports(icao text PRIMARY KEY, size int, longest_runway_ft int, airport_type text, lat float8, lon float8);
  CREATE TABLE operating_rules(all_cargo_capacity_bonus numeric);
  CREATE TABLE companies(id uuid PRIMARY KEY, user_id uuid, is_personal boolean DEFAULT false);
  CREATE TABLE aircraft_types(id text PRIMARY KEY, cargo_kg int);
  CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY, company_id uuid, aircraft_type_id text, location_icao text, returned_at timestamptz, status text DEFAULT 'AVAILABLE');
  CREATE TABLE flights(id uuid PRIMARY KEY, status text);
  CREATE TABLE special_missions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text DEFAULT 'AOG', origin_icao text DEFAULT 'ORIG', destination_icao text DEFAULT 'DEST',
    distance_nm numeric DEFAULT 100, cargo_kg int, payout numeric DEFAULT 5000, deadline_hours numeric DEFAULT 4, status text DEFAULT 'OPEN', created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT now() + interval '6 hours', accepted_by uuid, accepted_at timestamptz, deadline_at timestamptz, flight_id uuid, completed_at timestamptz,
    final_payout numeric, delivered_late boolean DEFAULT false);`);
  await db.exec(readFileSync("drizzle/migrations/0077_special_mission_cancel_release.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0078_special_mission_airline_fleet_only.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0079_special_mission_aircraft_at_origin.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`BEGIN;
  INSERT INTO operating_rules VALUES (0.5);
  INSERT INTO companies VALUES ('${company}','${owner}');
  INSERT INTO aircraft_types VALUES ('SMALL',213),('BIG',1200);
  INSERT INTO fleet_aircraft VALUES ('${aircraft}','${company}','SMALL','ORIG',NULL);
  INSERT INTO flights VALUES ('${flight}','DISPATCHED');`);
  await asUser(owner);
});
afterEach(() => db.exec("ROLLBACK"));
afterAll(() => db.close());

describe("special mission cancel and auto-release SQL", () => {
  it("refuses a 2,377 kg mission when the fleet carries at most 319 kg", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg) VALUES ('${mission}',2377)`);
    await expect(db.query(`SELECT accept_special_mission('${mission}')`)).rejects.toThrow(/fleet max: 319 kg/);
  });
  it("accepts when an All-Cargo aircraft at the origin fits (1,200 kg × 1.5 ≥ 1,500 kg)", async () => {
    await db.query(`INSERT INTO fleet_aircraft VALUES ('${id(21)}','${company}','BIG','ORIG',NULL)`);
    await db.query(`INSERT INTO special_missions(id,cargo_kg) VALUES ('${mission}',1500)`);
    await db.query(`SELECT accept_special_mission('${mission}')`);
    expect(await one(`SELECT status, accepted_by FROM special_missions`)).toEqual({ status: "ACCEPTED", accepted_by: owner });
  });
  it("abandoning before dispatch returns the mission to the board with a 4-hour listing", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,accepted_at,deadline_at) VALUES ('${mission}',150,'ACCEPTED','${owner}',now(),now()+interval '2 hours')`);
    await db.query(`SELECT cancel_special_mission('${mission}')`);
    expect(await one(`SELECT status, accepted_by, deadline_at, round(extract(epoch FROM expires_at-now())/3600)::int AS hours FROM special_missions`))
      .toEqual({ status: "OPEN", accepted_by: null, deadline_at: null, hours: 4 });
  });
  it("cannot abandon while the mission flight is dispatched", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,deadline_at,flight_id) VALUES ('${mission}',150,'ACCEPTED','${owner}',now()+interval '2 hours','${flight}')`);
    await expect(db.query(`SELECT cancel_special_mission('${mission}')`)).rejects.toThrow(/Cancel the dispatched mission flight/);
  });
  it("another player cannot abandon someone else's mission", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,deadline_at) VALUES ('${mission}',150,'ACCEPTED','${owner}',now()+interval '2 hours')`);
    await asUser(other);
    await expect(db.query(`SELECT cancel_special_mission('${mission}')`)).rejects.toThrow(/Mission not found/);
  });
  it("auto-releases a mission 68 h past its deadline with no flight, but keeps one with a flight", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,deadline_at) VALUES ('${mission}',150,'ACCEPTED','${owner}',now()-interval '68 hours'),
      ('${id(41)}',150,'ACCEPTED','${other}',now()-interval '1 hour')`);
    await db.query(`UPDATE special_missions SET flight_id='${flight}' WHERE id='${id(41)}'`);
    await db.query(`SELECT refresh_special_missions()`);
    expect(await one(`SELECT status, accepted_by FROM special_missions WHERE id='${mission}'`)).toEqual({ status: "OPEN", accepted_by: null });
    expect(await one(`SELECT status FROM special_missions WHERE id='${id(41)}'`)).toEqual({ status: "ACCEPTED" });
  });
  it("a stale overdue mission no longer blocks accepting a new one", async () => {
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,deadline_at) VALUES ('${id(42)}',150,'ACCEPTED','${owner}',now()-interval '68 hours'),('${mission}',150,'OPEN',NULL,NULL)`);
    await db.query(`SELECT accept_special_mission('${mission}')`);
    expect(await one(`SELECT status FROM special_missions WHERE id='${mission}'`)).toEqual({ status: "ACCEPTED" });
  });
  it("a private personal aircraft does not unlock a mission", async () => {
    await db.query(`INSERT INTO companies VALUES ('${id(11)}','${owner}',true)`);
    await db.query(`INSERT INTO fleet_aircraft VALUES ('${id(22)}','${id(11)}','BIG','ORIG',NULL)`);
    await db.query(`INSERT INTO special_missions(id,cargo_kg) VALUES ('${mission}',1500)`);
    await expect(db.query(`SELECT accept_special_mission('${mission}')`)).rejects.toThrow(/fleet max: 319 kg/);
  });
  it("a diverted mission flight points the player to resolve the divert in Dispatch", async () => {
    await db.query(`UPDATE flights SET status='DIVERTED'`);
    await db.query(`INSERT INTO special_missions(id,cargo_kg,status,accepted_by,deadline_at,flight_id) VALUES ('${mission}',150,'ACCEPTED','${owner}',now()+interval '2 hours','${flight}')`);
    await expect(db.query(`SELECT cancel_special_mission('${mission}')`)).rejects.toThrow(/Resolve the divert in Dispatch/);
  });
  it("refuses when the only capable aircraft is parked at another airport", async () => {
    await db.query(`INSERT INTO fleet_aircraft VALUES ('${id(21)}','${company}','BIG','EPWA',NULL)`);
    await db.query(`INSERT INTO special_missions(id,cargo_kg) VALUES ('${mission}',1500)`);
    await expect(db.query(`SELECT accept_special_mission('${mission}')`)).rejects.toThrow(/available aircraft at ORIG carrying at least 1500 kg/);
  });
  it("refuses when the capable aircraft at the origin is not available", async () => {
    await db.query(`INSERT INTO fleet_aircraft VALUES ('${id(21)}','${company}','BIG','ORIG',NULL,'IN_FLIGHT')`);
    await db.query(`INSERT INTO special_missions(id,cargo_kg) VALUES ('${mission}',1500)`);
    await expect(db.query(`SELECT accept_special_mission('${mission}')`)).rejects.toThrow(/available aircraft at ORIG/);
  });
});
