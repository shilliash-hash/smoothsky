// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), other = id(2), company = id(10), otherCompany = id(11), aircraft = id(20), flight = id(30);
const one = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const asUser = (user: string) => db.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: user })]);
const recall = async () => Number((await one(`SELECT recall_stale_dispatches() AS n`))?.["n"]);

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid NOT NULL,registration text,status text NOT NULL,ownership text NOT NULL DEFAULT 'OWNED',returned_at timestamptz,reserved_by uuid,reserved_until timestamptz,location_icao text NOT NULL);
    CREATE TABLE flights(id uuid PRIMARY KEY,company_id uuid NOT NULL,aircraft_id uuid NOT NULL,origin_icao text NOT NULL,destination_icao text NOT NULL,status text NOT NULL,execution_source text NOT NULL DEFAULT 'ACARS_AGENT',passengers integer NOT NULL,estimate jsonb NOT NULL,telemetry jsonb,divert_state jsonb,departed_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL,flight_number text);
    CREATE TABLE airport_passenger_pools(airport_icao text PRIMARY KEY,stock numeric NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE airport_fuel_pools(airport_icao text NOT NULL,fuel_type text NOT NULL,stock_gal numeric NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(airport_icao,fuel_type));
    CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid NOT NULL,entry_type text NOT NULL,debit_account text NOT NULL,credit_account text NOT NULL,amount numeric NOT NULL CHECK(amount>0),company_delta numeric NOT NULL,balance_after numeric NOT NULL,description text NOT NULL,reference text,idempotency_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb NOT NULL);
    CREATE FUNCTION economy_number_or(k text,fallback numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key=k),fallback) $$;
    CREATE FUNCTION passenger_stock(icao text) RETURNS numeric LANGUAGE sql AS $$ SELECT stock FROM airport_passenger_pools WHERE airport_icao=icao $$;
    CREATE FUNCTION airport_fuel_stock(icao text,kind text) RETURNS numeric LANGUAGE sql AS $$ SELECT stock_gal FROM airport_fuel_pools WHERE airport_icao=icao AND fuel_type=kind $$;
    CREATE FUNCTION airport_fuel_capacity(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1000::numeric $$;
    CREATE FUNCTION company_balance(cid uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=cid ORDER BY id DESC LIMIT 1),0) $$;
    CREATE FUNCTION company_post(cid uuid,kind text,debit text,credit text,delta numeric,descr text,ref text,ikey text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE bal numeric; BEGIN bal:=company_balance(cid)+delta; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(cid,kind,debit,credit,abs(delta),delta,bal,descr,ref,ikey); RETURN bal; END $$;
    CREATE FUNCTION process_due_obligations_core() RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION pay_due_dividends(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION cancel_test_flight(p_flight uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
      DECLARE f flights%ROWTYPE; c uuid;
      BEGIN
        SELECT id INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE;
        SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=c FOR UPDATE;
        IF NOT FOUND OR f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RAISE EXCEPTION 'Only active flights can be cancelled'; END IF;
        IF f.divert_state IS NOT NULL THEN RAISE EXCEPTION 'Continuation requires its own cancellation path'; END IF;
        UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;
        UPDATE flights SET status='CANCELLED' WHERE id=f.id;
        UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;
      END
    $function$;
  `);
  const fuel = readFileSync("drizzle/migrations/0057_persistent_fuel_tanks.sql", "utf8");
  const refund = fuel.match(/CREATE OR REPLACE FUNCTION public\.return_cancelled_fuel\([\s\S]*?END \$function\$;/)?.[0];
  if (!refund) throw new Error("Cancellation refund trigger missing");
  await db.exec(refund);
  await db.exec(`CREATE TRIGGER cancelled_fuel AFTER UPDATE OF status ON flights FOR EACH ROW EXECUTE FUNCTION return_cancelled_fuel();`);
  await db.exec(readFileSync("drizzle/migrations/0081_dispatch_timeout_force_recall.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0082_dispatch_timeout_interval_fix.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0083_idempotent_flight_recall.sql", "utf8"));
}, 30000);

beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO economy_config VALUES('dispatch_timeout_hours','3'),('dispatch_telemetry_grace_minutes','30');
    INSERT INTO companies VALUES('${company}','${owner}'),('${otherCompany}','${other}');
    INSERT INTO fleet_aircraft(id,company_id,registration,status,location_icao) VALUES('${aircraft}','${company}','SP-TST','DISPATCHED','ORIG');
    INSERT INTO airport_passenger_pools VALUES('ORIG',10,now());
    INSERT INTO airport_fuel_pools VALUES('ORIG','100LL',80,now());
    INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,idempotency_key) VALUES('${company}','INITIAL_GRANT','COMPANY_CASH','GRANT',1000,1000,1000,'Starting capital','seed');
    INSERT INTO flights VALUES('${flight}','${company}','${aircraft}','ORIG','DEST','DISPATCHED','ACARS_AGENT',3,'{"fuel_type":"100LL","fuel_reserved_gal":20,"fuel_uplift_gal":20,"fuel_uplift_cost":125}',NULL,NULL,NULL,NULL,now()-interval '4 hours','TST101');
  `);
  await asUser(owner);
});
afterEach(() => db.exec("ROLLBACK"));
afterAll(() => db.close());

describe("CR-01 stale dispatch recall SQL", () => {
  it("recalls a four-hour-old unstarted dispatch and refunds passengers, fuel stock and uplift exactly once", async () => {
    expect(await recall()).toBe(1);
    expect(await one(`SELECT status,telemetry->>'recall_reason' AS reason FROM flights`)).toEqual({ status: "CANCELLED", reason: "DISPATCH_TIMEOUT" });
    expect(await one(`SELECT status,location_icao FROM fleet_aircraft`)).toEqual({ status: "AVAILABLE", location_icao: "ORIG" });
    expect(await one(`SELECT stock::float FROM airport_passenger_pools`)).toEqual({ stock: 13 });
    expect(await one(`SELECT stock_gal::float FROM airport_fuel_pools`)).toEqual({ stock_gal: 100 });
    expect(await one(`SELECT entry_type,company_delta::float,balance_after::float FROM company_ledger ORDER BY id DESC LIMIT 1`)).toEqual({ entry_type: "FUEL_REFUND", company_delta: 125, balance_after: 1125 });
    expect(await recall()).toBe(0);
    expect(Number((await one(`SELECT count(*) AS n FROM company_ledger WHERE entry_type='FUEL_REFUND'`))?.["n"])).toBe(1);
  });

  it("keeps a dispatch younger than the configured three-hour timeout", async () => {
    await db.exec(`UPDATE flights SET created_at=now()-interval '2 hours 59 minutes'`);
    expect(await recall()).toBe(0);
    expect((await one(`SELECT status FROM flights`))?.["status"]).toBe("DISPATCHED");
  });

  it.each([
    ["started DISPATCHED", `departed_at=now()-interval '4 hours'`],
    ["EN_ROUTE", `status='EN_ROUTE',departed_at=now()-interval '4 hours'`],
    ["DIVERTED", `status='DIVERTED',divert_state='{"airport":"ALTN"}'`],
    ["divert continuation", `divert_state='{"airport":"ALTN"}'`],
  ])("never auto-recalls %s", async (_label, change) => {
    await db.exec(`UPDATE flights SET ${change}`);
    expect(await recall()).toBe(0);
    expect((await one(`SELECT status FROM flights`))?.["status"]).not.toBe("CANCELLED");
  });

  it("protects fresh ACARS but recalls after the 30-minute telemetry grace", async () => {
    await db.exec(`UPDATE flights SET telemetry=jsonb_build_object('live',jsonb_build_object('received_at',now()-interval '29 minutes'))`);
    expect(await recall()).toBe(0);
    await db.exec(`UPDATE flights SET telemetry=jsonb_build_object('live',jsonb_build_object('received_at',now()-interval '31 minutes'))`);
    expect(await recall()).toBe(1);
  });

  it("returns a stale Spot Rental instead of releasing it as owned aircraft", async () => {
    await db.exec(`UPDATE fleet_aircraft SET ownership='RENTAL'`);
    expect(await recall()).toBe(1);
    expect(await one(`SELECT status,returned_at IS NOT NULL AS returned FROM fleet_aircraft`)).toEqual({ status: "RETURNED", returned: true });
  });

  it("cannot recall another player's or an anonymous dispatch", async () => {
    await asUser(other);
    expect(await recall()).toBe(0);
    await db.exec(`SELECT set_config('request.jwt.claims','{}',true)`);
    expect(await recall()).toBe(0);
    expect((await one(`SELECT status FROM flights`))?.["status"]).toBe("DISPATCHED");
  });

  it("runs through the existing operational refresh even with no web simulation setting", async () => {
    await db.query(`SELECT process_due_obligations()`);
    expect((await one(`SELECT status FROM flights`))?.["status"]).toBe("CANCELLED");
  });

  it("accepts a manual Recall immediately after automatic cleanup without a second refund", async () => {
    await db.query(`SELECT process_due_obligations()`);
    await db.query(`SELECT cancel_test_flight('${flight}')`);
    expect((await one(`SELECT status FROM flights`))?.["status"]).toBe("CANCELLED");
    expect(Number((await one(`SELECT count(*) AS n FROM company_ledger WHERE entry_type='FUEL_REFUND'`))?.["n"])).toBe(1);
  });
});
