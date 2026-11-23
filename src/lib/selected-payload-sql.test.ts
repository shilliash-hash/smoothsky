// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { Quote as PayloadQuote } from './operations';
import { payloadPlanning } from './payload-planning';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
const flight = '00000000-0000-4000-8000-000000000004';
const catalogue = [
 ['C172',830,1157,3,0,640,122,8.5,56,'100LL'],
 ['BE58',1820,2495,5,150,1480,200,26,194,'100LL'],
 ['C208B',2150,4350,12,1200,1070,185,55,360,'Jet-A'],
 ['B350',4600,6804,9,400,1800,310,95,539,'Jet-A'],
 ['PC12NGX',3100,4740,9,800,1800,285,66,467,'Jet-A'],
 ['DHC6',3200,6350,19,1500,775,170,90,478,'Jet-A'],
 ['AT76',13000,26500,70,7500,825,275,210,788,'Jet-A'],
 ['A320NEO',44300,79000,180,16000,3400,450,780,6479,'Jet-A'],
 ['B77W',167829,351500,365,25000,7370,490,2100,33161,'Jet-A'],
] as const;
type Budget = { empty_weight_kg:number; mtow_kg:number; trip_fuel_gal:number; reserve_fuel_gal:number; planned_fuel_gal:number; planned_fuel_kg:number; available_payload_kg:number; passenger_weight_kg:number; payload_kg:number; takeoff_weight_kg:number; remaining_payload_kg:number };
type Quote = { weight_budget:Budget; passengers:number; cargo_kg:number; ferry:boolean; fuel_gal:number; fuel_cost:number; landing_fee:number; revenue:number; net:number; billed_fuel_gal:number; balance_after:number; fuel_price_effective_per_gal:number };
const budget = async (type='C172', distance=122) => (await db.query<{q:Budget}>('SELECT flight_weight_budget($1,$2) q',[type,distance])).rows[0]?.q;
const quote = async (cargo=0,allCargo=false) => {
 const q=(await db.query<{q:Quote}>(`SELECT flight_quote_full('${aircraft}','DEST',$1,$2) q`,[cargo,allCargo])).rows[0]?.q;
 if (!q) throw new Error('Quote missing');
 return q;
};
const settle = async (telemetry:unknown={fuel_used_gal:0}) => (await db.query<{q:Quote}>(`SELECT settle_flight('${flight}',$1::jsonb) q`,[JSON.stringify(telemetry)])).rows[0]?.q;
const migrationPath = () => {
 const override=process.env['WEIGHT_BUDGET_SQL'];
 if (override) return override;
 const name=readdirSync('drizzle/migrations').find(f=>f.endsWith('_weight_budget_stage_one.sql'));
 if (!name) throw new Error('Applied weight-budget migration missing');
 return `drizzle/migrations/${name}`;
};
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE aircraft_types(id text PRIMARY KEY,tier int,pax int,cargo_kg numeric,range_nm numeric,cruise_kts numeric,fuel_burn_gph numeric,fuel_capacity_gal numeric,fuel_type text,minimum_runway_ft int DEFAULT 0,unpaved_capable boolean DEFAULT true);
 CREATE TABLE fleet_aircraft(id uuid PRIMARY KEY,company_id uuid,aircraft_type_id text,registration text,status text,ownership text DEFAULT 'OWNED',returned_at timestamptz,location_icao text,reserved_by uuid,reserved_until timestamptz);
 CREATE TABLE airports(icao text PRIMARY KEY,size int,lat double precision,lon double precision,longest_runway_ft int DEFAULT 10000,runway_surface text DEFAULT 'ASPHALT');
 CREATE TABLE lease_contracts(aircraft_id uuid,starts_at timestamptz,ends_at timestamptz);
 CREATE TABLE company_fobs(id uuid,company_id uuid,airport_icao text,closed_at timestamptz,has_fuel_contract boolean,has_handling_desk boolean,has_maintenance_bay boolean);
 CREATE TABLE flights(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,aircraft_id uuid,status text DEFAULT 'DISPATCHED',execution_source text DEFAULT 'WEB_MANUAL',estimate jsonb,rules_snapshot jsonb,telemetry jsonb,settlement jsonb,passengers int,distance_nm numeric,estimated_minutes numeric,origin_icao text,destination_icao text,departed_at timestamptz,completed_at timestamptz,flight_number text);
 CREATE TABLE special_missions(id uuid,accepted_by uuid,status text,flight_id uuid,origin_icao text,destination_icao text,cargo_kg numeric,payout numeric,category text,deadline_at timestamptz,completed_at timestamptz,final_payout numeric,delivered_late boolean);
 CREATE TABLE airport_passenger_pools(airport_icao text PRIMARY KEY,stock numeric,updated_at timestamptz,last_departure_at timestamptz);
 CREATE TABLE economy_config(key text PRIMARY KEY,value jsonb);
 CREATE TABLE operating_rules(singleton boolean,cargo_airport_fee_discount numeric,cargo_pax_rate_ratio numeric,all_cargo_capacity_bonus numeric,avgas_kg_per_litre numeric,jeta_kg_per_litre numeric,butter_landing_max_fpm numeric,smooth_landing_min_fpm numeric,smooth_landing_max_fpm numeric,butter_tip_rate numeric,smooth_tip_rate numeric);
 CREATE TABLE company_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id uuid,entry_type text,debit_account text,credit_account text,amount numeric CHECK(amount>0),company_delta numeric,balance_after numeric,description text,reference text,idempotency_key text UNIQUE);
 CREATE FUNCTION company_balance(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT balance_after FROM company_ledger WHERE company_id=$1 ORDER BY id DESC LIMIT 1),100000) $$;
 CREATE FUNCTION company_post(uuid,text,text,text,numeric,text,text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 100000::numeric $$;
 CREATE FUNCTION passenger_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT CASE WHEN $1='ORIG' THEN 1000 ELSE 0 END::numeric $$;
 CREATE FUNCTION passenger_capacity(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 1000::numeric $$;
 CREATE FUNCTION cargo_stock(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 50000::numeric $$;
 CREATE FUNCTION airport_fuel_stock(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 50000::numeric $$;
 CREATE FUNCTION runway_is_unpaved(text,int,int) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE FUNCTION economy_number(text) RETURNS numeric LANGUAGE sql AS $$ SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=$1 $$;
 CREATE FUNCTION economy_number_or(text,numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT (value #>> '{}')::numeric FROM economy_config WHERE key=$1),$2) $$;
 CREATE FUNCTION passenger_landing_tip(text,int,jsonb,numeric,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"passenger_tip":0}'::jsonb $$;
 INSERT INTO economy_config VALUES('fuel_reserve_minutes','45'),('fare_per_nm','0.18'),('charter_by_tier','[65,50,35,20,0,0,0]'),('transit_cap','1.5'),('fuel_price_100ll','8.2'),('fuel_price_jeta','5.8'),('landing_base_fee','20'),('airport_fee_multipliers','[0.1,0.2,0.3,0.4,0.5,0.6,0.7]'),('handling_rate','0.05'),('maintenance_per_hour','10'),('fob_fuel_discount','0.2'),('fob_handling_discount','0.2'),('fob_maintenance_discount','0.2'),('web_simulation_enabled','true'),('dissolve_min','0'),('dissolve_max','0'),('simulation_time_scale','1');
 INSERT INTO operating_rules VALUES(true,0.4,0.6,0.5,0.72,0.80,100,101,180,0.1,0.05);
 INSERT INTO airports(icao,size,lat,lon) VALUES('ORIG',1,0,0),('DEST',4,1,0);
 INSERT INTO companies VALUES('${company}','${owner}');
 INSERT INTO fleet_aircraft(id,company_id,aircraft_type_id,registration,status,location_icao) VALUES('${aircraft}','${company}','C172','SP-TST','AVAILABLE','ORIG');`);
 for (const [id,,,pax,cargo,range,speed,burn,tank,fuel] of catalogue) await db.query('INSERT INTO aircraft_types(id,tier,pax,cargo_kg,range_nm,cruise_kts,fuel_burn_gph,fuel_capacity_gal,fuel_type) VALUES($1,1,$2,$3,$4,$5,$6,$7,$8)',[id,pax,cargo,range,speed,burn,tank,fuel]);
 await db.exec(readFileSync('src/test/fixtures/weight-budget-baseline.sql','utf8'));
 const fob=readFileSync('drizzle/migrations/0040_company_fbo_free_handling.sql','utf8').split('-- Keep the private baseline')[0];
 if (!fob) throw new Error('FBO quote missing');
 await db.exec(fob);
 await db.exec(readFileSync(migrationPath(),'utf8'));
 const dispatch=readFileSync('drizzle/migrations/0054_ferry_flights_range_enforcement.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.dispatch_flight[\s\S]*$/)?.[0];
 if (!dispatch) throw new Error('Dispatch missing');
 await db.exec(`CREATE FUNCTION dispatch_usable_range_pct() RETURNS double precision LANGUAGE sql AS $$ SELECT 0.75::double precision $$;`+dispatch);

 await db.exec('ALTER TABLE fleet_aircraft ADD COLUMN current_fuel_gal numeric DEFAULT 0; CREATE TABLE airport_cargo_pools(airport_icao text PRIMARY KEY,cargo_pool_kg numeric,updated_at timestamptz);');
 const fuel = readFileSync('drizzle/migrations/0057_persistent_fuel_tanks.sql','utf8');
 for (const name of ['flight_weight_budget','flight_tank_plan','set_target_fuel','flight_quote_fueled','dispatch_flight_fueled']) {
   const definition = fuel.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?(?:\\$function\\$|\\$\\$);', 'g'))?.[0];
   if (!definition) throw new Error('Fuel function missing: ' + name);
   await db.exec(definition);
 }
 await db.exec(readFileSync('src/test/fixtures/selected-payload-dispatch.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0074_selected_dispatch_payload.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0075_payload_preview_precision.sql','utf8'));
},30000);

beforeEach(async () => {
 await db.exec(`TRUNCATE flights,company_fobs,airport_passenger_pools,special_missions; SELECT set_config('test.uid','${owner}',false); SELECT set_config('smoothsky.passengers','',false); SELECT set_config('smoothsky.target_fuel','',false); SELECT set_config('smoothsky.cargo','',false); UPDATE fleet_aircraft SET aircraft_type_id='C208B',status='AVAILABLE',current_fuel_gal=0;`);
});
afterAll(()=>db.close());
const loaded = async(pax:number|null,cargo=0,allCargo=false,target:number|null=null) => {
 const result=(await db.query<{q:PayloadQuote}>(`SELECT flight_quote_loaded('${aircraft}','DEST',$1,$2,NULL,$3,$4) q`,[cargo,allCargo,target,pax])).rows[0]?.q;
 if (!result) throw new Error('Missing loaded quote');
 return result;
};
describe('selected payload SQL integration',()=>{
 it('reserves exactly two selected passengers and 350 kg cargo at dispatch',async()=>{
  const q=await loaded(2,350);
  expect([q.passengers,q.cargo_kg]).toEqual([2,350]);
  const id=(await db.query<{id:string}>(`SELECT dispatch_flight_loaded('${aircraft}','DEST','TST101',350,false,NULL,NULL,2) id`)).rows[0]?.id;
  const row=(await db.query<{passengers:number;estimate:PayloadQuote}>('SELECT passengers,estimate FROM flights WHERE id=$1',[id])).rows[0];
  expect([row?.passengers,row?.estimate.cargo_kg,row?.estimate.revenue]).toEqual([2,350,q.revenue]);
  expect((await db.query<{stock:string}>("SELECT stock FROM airport_passenger_pools WHERE airport_icao='ORIG'")).rows[0]?.stock).toBe('998');
  expect((await db.query<{stock:string}>("SELECT cargo_pool_kg stock FROM airport_cargo_pools WHERE airport_icao='ORIG'")).rows[0]?.stock).toBe('49650');
 });
 it('keeps null automatic but honours an explicit zero',async()=>{
  expect((await loaded(null)).passengers).toBe(12);
  expect((await loaded(0,350)).passengers).toBe(0);
 });
 it('limits passengers by seats and demand',async()=>{
  expect((await loaded(999)).passengers).toBe(12);
  await db.exec("INSERT INTO economy_config VALUES('demand_factor_by_size','[1,1,1,0.5,1,1,1]')");
  expect((await loaded(999)).passengers).toBe(6);
  await db.exec("DELETE FROM economy_config WHERE key='demand_factor_by_size'");
 });
 it('rejects invalid passenger inputs',async()=>{
  await expect(loaded(-1)).rejects.toThrow('Invalid passenger count');
  await expect(loaded(1001)).rejects.toThrow('Invalid passenger count');
 });
 it('All-Cargo carries zero passengers and respects the expanded hold',async()=>{
  const q=await loaded(12,1800,true);
  expect(q.passengers).toBe(0);
  expect(q.payload_limits?.max_cargo_kg).toBe(1800);
  expect(q.cargo_kg).toBeLessThanOrEqual(1800);
 });
 it('Ferry is empty and has zero revenue',async()=>{
  const q=await loaded(0,0,true);
  expect([q.passengers,q.cargo_kg,q.revenue]).toEqual([0,0,0]);
 });
 it('target fuel consumes payload and cannot exceed MTOW',async()=>{
  const q=await loaded(12,1200,false,350);
  expect(q.weight_budget?.takeoff_weight_kg).toBeLessThanOrEqual(4350);
  expect(q.cargo_kg).toBeLessThan(1200);
 });
 it('live preview matches the confirmed SQL ticket/cargo/handling/net',async()=>{
  const source=await loaded(8,200);
  const preview=payloadPlanning(source,'commercial',4,350,null)?.quote;
  const final=await loaded(4,350);
  expect([preview?.ticket_revenue,preview?.cargo_revenue,preview?.handling_fee,preview?.net]).toEqual([final.ticket_revenue,final.cargo_revenue,final.handling_fee,final.net]);
 });
 it('other owners cannot quote or dispatch this aircraft',async()=>{
  await db.exec("SELECT set_config('test.uid','00000000-0000-4000-8000-000000000099',false)");
  await expect(loaded(2,350)).rejects.toThrow('Aircraft not found');
  await expect(db.exec(`SELECT dispatch_flight_loaded('${aircraft}','DEST','TST102',350,false,NULL,NULL,2)`)).rejects.toThrow('Aircraft not found');
 });
 it('helper is private and anonymous dispatch is denied',async()=>{
  const r=(await db.query<{helper:boolean;anon:boolean}>("SELECT has_function_privilege('authenticated','set_selected_passengers(integer)','execute') helper,has_function_privilege('anon','dispatch_flight_loaded(uuid,text,text,integer,boolean,uuid,numeric,integer)','execute') anon")).rows[0];
  expect(r).toEqual({helper:false,anon:false});
 });
 it('does not compare smaller loads when selected payload is unavailable on another route',async()=>{
  await db.exec("SELECT set_config('smoothsky.loaded_discovery','1',false); SELECT set_config('smoothsky.passengers','13',false)");
  const r=(await db.query<{q:{estimated_margin:null;estimate_error:string}}>(`SELECT dispatch_destination_estimate('${aircraft}','DEST',0,false) q`)).rows[0]?.q;
  expect(r?.estimated_margin).toBeNull();
  expect(r?.estimate_error).toContain('Selected payload unavailable');
  await db.exec("SELECT set_config('smoothsky.loaded_discovery','',false)");
 });
});
