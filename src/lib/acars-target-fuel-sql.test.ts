import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("CR-08 ACARS full target fuel response", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.fleet_aircraft (id integer PRIMARY KEY, registration text, aircraft_type_id text);
      CREATE TABLE public.flights (id integer, flight_number text, aircraft_id integer, origin_icao text, destination_icao text, status text, execution_source text, passengers integer, distance_nm numeric, estimate jsonb);
      INSERT INTO public.fleet_aircraft VALUES (1, 'LN-TEST', 'C172');
    `);
    await db.exec(readFileSync("docs/sql/0085_acars_target_fuel_clarity.sql", "utf8"));
  });
  afterAll(async () => { await db.close(); });

  async function quote(estimate: Record<string, unknown>) {
    const result = await db.query<{ payload: { target_fuel_gal: number | null; planned_fuel_gal: number | null } }>(`
      SELECT public.acars_flight_json(ROW(1, 'TEST101', 1, 'EPGD', 'EPWA', 'DISPATCHED', 'ACARS_AGENT', 2, 100, $1::jsonb)::public.flights) AS payload
    `, [JSON.stringify(estimate)]);
    const row = result.rows[0];
    if (!row) throw new Error("Missing ACARS flight response");
    return row.payload;
  }

  it("reports the full slider target while retaining legacy planned trip burn", async () => {
    expect(await quote({ target_fuel_gal: 200, weight_budget: { planned_fuel_gal: 130 }, fuel_gal: 100 }))
      .toMatchObject({ target_fuel_gal: 200, planned_fuel_gal: 100 });
  });
  it("falls back to the planned full fuel budget", async () => {
    expect((await quote({ weight_budget: { planned_fuel_gal: 130 }, fuel_gal: 100 })).target_fuel_gal).toBe(130);
  });
  it("preserves zero and falls back to legacy trip only when needed", async () => {
    expect((await quote({ target_fuel_gal: 0, fuel_gal: 100 })).target_fuel_gal).toBe(0);
    expect((await quote({ fuel_gal: 100 })).target_fuel_gal).toBe(100);
    expect((await quote({})).target_fuel_gal).toBeNull();
  });
  it("keeps direct helper execution restricted to trusted server callers", async () => {
    const result = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      SELECT has_function_privilege('anon','public.acars_flight_json(public.flights)','EXECUTE') AS anon,
        has_function_privilege('authenticated','public.acars_flight_json(public.flights)','EXECUTE') AS authenticated,
        has_function_privilege('service_role','public.acars_flight_json(public.flights)','EXECUTE') AS service
    `);
    expect(result.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});