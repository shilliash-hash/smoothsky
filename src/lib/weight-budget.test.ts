// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { validateEconomyValue } from './admin-rules';

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
},30000);
beforeEach(async () => {
 await db.exec(`TRUNCATE flights,company_ledger,company_fobs,special_missions,airport_passenger_pools;
 SELECT set_config('test.uid','${owner}',false); SELECT set_config('smoothsky.cargo','',false); SELECT set_config('smoothsky.acars_settlement','${flight}',false);
 UPDATE fleet_aircraft SET aircraft_type_id='C172',status='AVAILABLE',location_icao='ORIG';
 UPDATE operating_rules SET avgas_kg_per_litre=0.72,jeta_kg_per_litre=0.80;
 UPDATE airports SET lat=1,size=4 WHERE icao='DEST';
 DELETE FROM economy_config WHERE key IN ('passenger_weight_kg','fuel_billing_floor_pct','landing_fee_per_ton_mtow');
 UPDATE economy_config SET value='45' WHERE key='fuel_reserve_minutes'; UPDATE economy_config SET value='8.2' WHERE key='fuel_price_100ll';`);
});
afterAll(()=>db.close());
describe('production weight budget SQL',()=>{
 it('validates the default admin tuning values and rejects impossible fuel floors or passenger mass',()=>{
  expect(validateEconomyValue('landing_fee_per_ton_mtow',2.5)).toBe(2.5);
  expect(validateEconomyValue('passenger_weight_kg',80)).toBe(80);
  expect(validateEconomyValue('fuel_billing_floor_pct',0.8)).toBe(0.8);
  expect(()=>validateEconomyValue('fuel_billing_floor_pct',1.01)).toThrow();
  expect(()=>validateEconomyValue('passenger_weight_kg',0)).toThrow();
 });
 it.each(catalogue)('backfills exact masses for %s',async(id,empty,mtow)=>{
  expect((await db.query('SELECT empty_weight_kg::float,mtow_kg::float FROM aircraft_types WHERE id=$1',[id])).rows[0]).toEqual({empty_weight_kg:empty,mtow_kg:mtow});
 });
 it('includes exactly 45 minutes reserve in mass, never trip consumption',async()=>{
  const b=await budget(); expect(b?.trip_fuel_gal).toBe(8.5); expect(b?.reserve_fuel_gal).toBe(6.375); expect(b?.planned_fuel_gal).toBe(14.875);
  expect(b?.planned_fuel_kg).toBeCloseTo(14.875*3.785411784*0.72,8); expect(b?.passenger_weight_kg).toBe(80);
 });
 it('uses edited reserve minutes and densities',async()=>{
  await db.exec(`UPDATE economy_config SET value='60' WHERE key='fuel_reserve_minutes'; UPDATE operating_rules SET avgas_kg_per_litre=0.75;`);
  expect((await budget())?.planned_fuel_kg).toBeCloseTo(17*3.785411784*0.75,8);
 });
 it('uses Jet-A density independently',async()=>{expect((await budget('B350',310))?.planned_fuel_kg).toBeCloseTo(166.25*3.785411784*0.8,8);});
 it('rejects insufficient tanks including reserve',async()=>{await expect(budget('C172',800)).rejects.toThrow('fuel capacity with reserve');});
 it('rejects an empty ferry if fuel alone exceeds MTOW',async()=>{await db.exec("UPDATE aircraft_types SET mtow_kg=2200 WHERE id='BE58'");await expect(budget('BE58',1000)).rejects.toThrow('even with no payload');await db.exec("UPDATE aircraft_types SET mtow_kg=2495 WHERE id='BE58'");});
 it('fails safely on unconfigured new aircraft',async()=>{await db.exec(`INSERT INTO aircraft_types(id) VALUES('NEW_TYPE');`); await expect(budget('NEW_TYPE',100)).rejects.toThrow('Configure valid aircraft');});
 it('reduces passengers to physically available 80 kg seats on longer routes',async()=>{
  await db.exec('UPDATE airports SET lat=7 WHERE icao=\'DEST\''); const q=await quote(); expect(q.passengers).toBe(2); expect(q.weight_budget.payload_kg).toBe(160); expect(q.weight_budget.takeoff_weight_kg).toBeLessThanOrEqual(1157);
 });
 it.each([false,true])('caps mixed/cargo load within MTOW (all-cargo %s)',async allCargo=>{
  await db.exec(`UPDATE fleet_aircraft SET aircraft_type_id='C208B'; UPDATE airports SET lat=17 WHERE icao='DEST';`);
  const q=await quote(1200,allCargo); expect(q.weight_budget.payload_kg).toBe(q.passengers*80+q.cargo_kg); expect(q.weight_budget.takeoff_weight_kg).toBeLessThanOrEqual(4350); expect(q.weight_budget.remaining_payload_kg).toBeGreaterThanOrEqual(0); expect(q.cargo_kg).toBeLessThan(1200);
 });
 it('returns a zero-payload ferry with full reserve still in mass',async()=>{const q=await quote(0,true);expect(q).toMatchObject({passengers:0,cargo_kg:0,ferry:true,revenue:0});expect(q.weight_budget.payload_kg).toBe(0);expect(q.weight_budget.takeoff_weight_kg).toBeGreaterThan(830);});
 it('rejects overweight mission instead of silently cutting cargo or paying full reward',async()=>{
  await db.exec(`INSERT INTO special_missions(id,accepted_by,status,origin_icao,destination_icao,cargo_kg,payout,category) VALUES('${flight}','${owner}','ACCEPTED','ORIG','DEST',400,1000,'CARGO'); SELECT set_config('smoothsky.cargo','{"mission":"${flight}"}',false);`);
  await expect(db.query(`SELECT flight_quote_cargo('${aircraft}','DEST')`)).rejects.toThrow('Mission payload exceeds MTOW');
 });
 it.each([['C172',4,1.16],['B77W',7,615.13]] as const)('charges MTOW landing fee for %s at airport size %s',async(type,size,fee)=>{
  await db.query('UPDATE fleet_aircraft SET aircraft_type_id=$1',[type]);await db.query('UPDATE airports SET size=$1 WHERE icao=\'DEST\'',[size]); expect((await quote()).landing_fee).toBe(fee);
 });
 it('applies live landing rate and preserves FBO module discount',async()=>{
  await db.exec(`INSERT INTO economy_config VALUES('landing_fee_per_ton_mtow','5'); INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','DEST',NULL,false,true,false);`);expect((await quote()).landing_fee).toBe(1.85);
 });
 it('dispatch freezes a physically legal load and returns the same masses on readback',async()=>{
  const q=await quote(); const id=(await db.query<{id:string}>(`SELECT dispatch_flight('${aircraft}','DEST') id`)).rows[0]?.id;
  const f=(await db.query<{estimate:Quote;passengers:number}>('SELECT estimate,passengers FROM flights WHERE id=$1',[id])).rows[0]; expect(f?.estimate.weight_budget).toEqual(q.weight_budget);expect(f?.passengers).toBe(q.passengers);
 });
 it('retains stage-one commercial range restriction while checking mass first',async()=>{
  await db.exec(`UPDATE fleet_aircraft SET aircraft_type_id='B350'; UPDATE airports SET lat=25 WHERE icao='DEST';`);
  await expect(db.query(`SELECT dispatch_flight('${aircraft}','DEST')`)).rejects.toThrow('usable payload range');
 });
 it('denies another owner access to quotes',async()=>{await db.exec(`SELECT set_config('test.uid','${flight}',false);`);await expect(quote()).rejects.toThrow('Aircraft not found');});
});
describe('verified fuel settlement SQL',()=>{
 const prepare=async(source='ACARS_AGENT')=>{
  const q=await quote(); await db.query(`INSERT INTO flights(id,company_id,aircraft_id,status,execution_source,estimate,rules_snapshot,departed_at,estimated_minutes,passengers,origin_icao,destination_icao,flight_number) VALUES('${flight}','${company}','${aircraft}','EN_ROUTE',$1,$2::jsonb,'{"dissolve_min":0,"dissolve_max":0,"simulation_time_scale":1}',now()-interval '2 hours',30,3,'ORIG','DEST','TST101')`,[source,JSON.stringify(q)]);return q;
 };
 it('bills unlimited-fuel 0 gal at exactly 80% of trip, not reserve',async()=>{const q=await prepare();const s=await settle();expect(s?.billed_fuel_gal).toBeCloseTo(q.weight_budget.trip_fuel_gal*0.8,10);expect(s?.fuel_cost).toBe(Math.round(q.weight_budget.trip_fuel_gal*0.8*8.2*100)/100);});
 it('bills actual burn above the floor including actual reserve consumption',async()=>{await prepare();expect((await settle({fuel_used_gal:12}))?.fuel_cost).toBe(98.4);});
 it('accepts nested PIREP consumption',async()=>{await prepare();expect((await settle({pirep:{fuel_used_gal:12}}))?.billed_fuel_gal).toBe(12);});
 it.each([{}, {fuel_used_gal:-1}, {fuel_used_gal:'0'}])('rejects invalid ACARS fuel data %j',async telemetry=>{await prepare();await expect(settle(telemetry)).rejects.toThrow();expect((await db.query('SELECT count(*)::int n FROM company_ledger')).rows[0]).toEqual({n:0});});
 it('keeps estimated burn for WEB_MANUAL despite fake fuel telemetry',async()=>{const q=await prepare('WEB_MANUAL');expect((await settle({fuel_used_gal:0}))?.fuel_cost).toBe(q.fuel_cost);});
 it('preserves old in-progress estimates without weight snapshot',async()=>{await prepare();await db.exec(`UPDATE flights SET estimate=estimate-'weight_budget'||'{"fuel_cost":100,"net":500}'::jsonb;`);expect(await settle()).toMatchObject({fuel_cost:100,net:500});});
 it('uses frozen price and fuel discount after live admin changes',async()=>{
  await db.exec(`INSERT INTO company_fobs VALUES(gen_random_uuid(),'${company}','ORIG',NULL,true,false,false);`);await prepare();await db.exec(`UPDATE economy_config SET value='99' WHERE key='fuel_price_100ll'; TRUNCATE company_fobs;`);
  expect(await settle({fuel_used_gal:12})).toMatchObject({fuel_cost:78.72,fuel_price_effective_per_gal:6.56});
 });
 it('posts actual fuel and correct net once across retries',async()=>{
  const q=await prepare();const first=await settle({fuel_used_gal:12});expect(first?.net).toBeCloseTo(q.net+q.fuel_cost-98.4,2);expect(await settle({fuel_used_gal:0})).toEqual(first);
  expect((await db.query("SELECT amount::float FROM company_ledger WHERE entry_type='FUEL_EXPENSE'")).rows).toEqual([{amount:98.4}]);
 });
 it('requires verified ingestion before changing any ledger entry',async()=>{await prepare();await db.exec("SELECT set_config('smoothsky.acars_settlement','',false)");await expect(settle()).rejects.toThrow('verified telemetry ingestion');});
});

describe('stage two physical-range discovery SQL',()=>{
 const stageTwo=()=>{const n=readdirSync('drizzle/migrations').find(f=>f.endsWith('_physical_range_dispatch_discovery.sql'));if(!n)throw new Error('missing');return readFileSync(`drizzle/migrations/${n}`,'utf8').split('DO $m$')[0]!;};
 const est=async(lat:number)=>{await db.query("UPDATE airports SET lat=$1 WHERE icao='DEST'",[lat]);return (await db.query<{q:{estimated_margin:number|null;estimated_revenue:number|null;estimate_error:string|null;passengers:number;cargo_kg:number;available_payload_kg:number}}>(`SELECT dispatch_destination_estimate('${aircraft}','DEST',0,false) q`)).rows[0]!.q;};
 beforeAll(async()=>{await db.exec(stageTwo());await db.exec(readFileSync('drizzle/migrations/0058_deals_use_selected_cargo.sql','utf8'));});
 it('bounds discovery by tank capacity and IFR reserve, not 75% of catalogue range',async()=>{
  const r=(await db.query<{r:number}>("SELECT aircraft_physical_range_nm('C172') r")).rows[0]!.r;
  // C172: 56 gal - 45 min * 8.5 gph = 49.625 gal → 49.625/8.5*122 ≈ 712 NM, capped below MTOW mass limit
  expect(r).toBeGreaterThan(640*0.75); expect(r).toBeLessThan(720);
 });
 it('auto-loads fewer passengers on long legs and Best Deals sorting reflects reduced payload',async()=>{
  const short=await est(1), long=await est(7);
  expect(long.passengers).toBeLessThan(short.passengers);
  expect(long.available_payload_kg).toBeLessThan(short.available_payload_kg);
  const sorted=[{icao:'LONG',...long},{icao:'SHORT',...short}].sort((a,b)=>(b.estimated_margin??-1e9)-(a.estimated_margin??-1e9));
  expect(Number(long.estimated_revenue)/420).toBeLessThan(Number(short.estimated_revenue)/60);
  expect(sorted.map(s=>s.icao)).toContain('SHORT');
 });
 it('previews use exactly the cargo set on the slider',async()=>{
  await db.exec("UPDATE fleet_aircraft SET aircraft_type_id='C208B'");
  const q=await est(5); expect(q.cargo_kg).toBe(0);
  const withCargo=(await db.query<{q:{cargo_kg:number}}>(`SELECT dispatch_destination_estimate('${aircraft}','DEST',100,false) q`)).rows[0]!.q;
  expect(withCargo.cargo_kg).toBe(100);
 });
 it('marks routes with zero spare payload as ferry-only',async()=>{
  await db.exec("UPDATE aircraft_types SET mtow_kg=905 WHERE id='C172'");
  const q=await est(5); await db.exec("UPDATE aircraft_types SET mtow_kg=1157 WHERE id='C172'");
  expect(q.estimate_error ?? '').toMatch(/Ferry only|MTOW/);
  expect(q.estimated_margin).toBeNull();
 });
});
