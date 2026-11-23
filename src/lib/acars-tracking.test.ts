// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';


const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const aircraft = '00000000-0000-4000-8000-000000000003';
const flight = '00000000-0000-4000-8000-000000000004';
const migrationPath = () => 'drizzle/migrations/0055_weight_budget_stage_one.sql';
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
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',nullif(current_setting('test.uid',true),''))::uuid $$;
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
 await db.exec(`ALTER TABLE fleet_aircraft ADD COLUMN current_fuel_gal numeric DEFAULT 28, ADD COLUMN airframe_hours numeric DEFAULT 0;
 ALTER TABLE flights ADD COLUMN pilot_id uuid, ADD COLUMN route_waypoints jsonb, ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE flights ADD CONSTRAINT flights_status_check CHECK(status IN ('DISPATCHED','EN_ROUTE','COMPLETED','CANCELLED'));
 CREATE TABLE airport_fuel_pools(airport_icao text,fuel_type text,stock_gal numeric,updated_at timestamptz,PRIMARY KEY(airport_icao,fuel_type));
 CREATE TABLE profiles(id uuid,last_position_at timestamptz);
 CREATE FUNCTION act_as(uuid) RETURNS text LANGUAGE plpgsql AS $$ DECLARE old text:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}'); BEGIN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',$1)::text,true); RETURN old; END $$;
 CREATE FUNCTION acars_pilot(text) RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid() $$;
 CREATE FUNCTION airport_fuel_capacity(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 100000::numeric $$;
 CREATE FUNCTION airport_distance_nm(double precision,double precision,double precision,double precision) RETURNS double precision LANGUAGE sql AS $$ SELECT 2*3440.065*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians($3-$1)/2),2)+cos(radians($1))*cos(radians($3))*power(sin(radians($4-$2)/2),2))))) $$;`);
 await db.exec(readFileSync('src/test/fixtures/divert-baseline.sql','utf8'));
 const fuel=readFileSync('drizzle/migrations/0057_persistent_fuel_tanks.sql','utf8');
 for (const name of ['flight_tank_plan','flight_weight_budget','return_cancelled_fuel']) {
  const fn=fuel.match(new RegExp('CREATE OR REPLACE FUNCTION public.'+name+'\\([\\s\\S]*?END (?:\\$function\\$|\\$\\$);'))?.[0];
  if (!fn) throw new Error(name+' missing'); await db.exec(fn);
 }
 const file=process.env['DIVERT_SQL'] ?? 'drizzle/migrations/0064_divert_continuation.sql';
 await db.exec(readFileSync(file,'utf8'));
 await db.exec(readFileSync('drizzle/migrations/0065_divert_frozen_rules_snapshot.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0066_divert_lease_retention.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0067_acars_ramp_fuel_adjustment.sql','utf8'));
 await db.exec(readFileSync(process.env['ACARS_BURN_SQL'] ?? 'drizzle/migrations/0069_acars_persistent_fuel_burn.sql','utf8'));
 await db.exec(`CREATE FUNCTION acars_flight_json(flights) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('id',($1).id) $$;
 CREATE TRIGGER cancelled_fuel AFTER UPDATE OF status ON flights FOR EACH ROW EXECUTE FUNCTION return_cancelled_fuel();`);
 await db.exec(readFileSync('drizzle/migrations/0032_acars_resume_window.sql','utf8'));
 await db.exec(readFileSync(process.env['ACARS_TRACKING_SQL'] ?? 'drizzle/migrations/0071_acars_continuous_tracking.sql','utf8'));
 await db.exec(readFileSync(process.env['ACARS_AIRCRAFT_SQL'] ?? 'drizzle/migrations/0072_acars_aircraft_fuel_plausibility.sql','utf8'));
},30000);
const one = async (sql:string) => (await db.query<Record<string, unknown>>(sql)).rows[0];
async function safely(sql:string,args:unknown[]=[]){
 await db.exec('SAVEPOINT action');
 try { const result=await db.query(sql,args);await db.exec('RELEASE SAVEPOINT action');return result; }
 catch(e){await db.exec('ROLLBACK TO SAVEPOINT action');throw e;}
}
const call = (action:string, target:number|null=null) => safely(`SELECT divert_action($1,$2,$3) q`,[flight,action,target]);
const divert = () => safely(`SELECT test_divert('${flight}','ALTN') q`);
beforeEach(async()=>{
 await db.exec(`BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${owner}"}',true);
 INSERT INTO airports(icao,size,lat,lon) VALUES('ALTN',2,0.5,0);
 UPDATE fleet_aircraft SET status='AVAILABLE',current_fuel_gal=28;
 INSERT INTO profiles VALUES('${owner}',NULL);
 CREATE OR REPLACE FUNCTION company_post(cid uuid,kind text,debit text,credit text,delta numeric,descr text,ref text,ikey text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE bal numeric; BEGIN bal:=company_balance(cid)+delta; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(cid,kind,debit,credit,abs(delta),delta,bal,descr,ref,ikey); RETURN bal; END $$;
 CREATE OR REPLACE FUNCTION airport_fuel_stock(text,text) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce((SELECT stock_gal FROM airport_fuel_pools WHERE airport_icao=$1 AND fuel_type=$2),50000) $$;
 INSERT INTO airport_fuel_pools VALUES('ALTN','100LL',100,now());
 CREATE TRIGGER hours AFTER UPDATE OF status ON flights FOR EACH ROW EXECUTE FUNCTION accrue_airframe_hours();
 SELECT set_config('smoothsky.target_fuel','28',true);`);
 const q=(await db.query<{q:Quote}>(`SELECT flight_quote_full('${aircraft}','DEST') q`)).rows[0]?.q;
 if (!q) throw new Error('No quote');
 await db.query(`INSERT INTO flights(id,company_id,aircraft_id,status,execution_source,estimate,rules_snapshot,departed_at,estimated_minutes,passengers,origin_icao,destination_icao,flight_number) VALUES($1,$2,$3,'EN_ROUTE','WEB_MANUAL',$4::jsonb||'{"fuel_uplift_gal":0,"fuel_uplift_cost":0,"target_fuel_gal":28,"fuel_type":"100LL"}', '{"dissolve_min":0,"dissolve_max":0,"simulation_time_scale":1}',now()-interval '2 hours',30,3,'ORIG','DEST','TST101')`,[flight,company,aircraft,JSON.stringify(q)]);
 await db.exec(`UPDATE fleet_aircraft SET status='EN_ROUTE'`);
});
afterEach(()=>db.exec('ROLLBACK'));
afterAll(()=>db.close());
describe('ACARS continuous GPS and real-time integrity',()=>{
 const state=()=>one(`SELECT status,telemetry FROM flights`);
 async function position(lat:number,secs:number=60,phase='CRUISE'){
  await db.exec(`UPDATE profiles SET last_position_at=NULL; UPDATE flights SET execution_source='ACARS_AGENT',telemetry=jsonb_set(coalesce(telemetry,'{}'),'{live,received_at}',to_jsonb(now()-interval '${secs} seconds')) WHERE telemetry ? 'live'`);
  return safely(`SELECT acars_position('test',$1::jsonb) q`,[JSON.stringify({lat,lon:0,fuel_gal:28,phase,ground_speed_kt:120})]);
 }
 async function seed(lat=0,tracked=0,age=60){
  await db.query(`UPDATE flights SET execution_source='ACARS_AGENT',distance_nm=60.04046073261873,departed_at=now()-interval '1 hour',telemetry=jsonb_build_object('tracked_distance_nm',$1::numeric,'gps_tracking_started',true,'gps_airborne_at',now()-interval '1 hour','live',jsonb_build_object('lat',$2::numeric,'lon',0,'fuel_gal',28,'phase','CRUISE','received_at',now()-make_interval(secs=>$3::double precision)))`,[tracked,lat,age]);
 }
 async function pirep(icao='DEST',tracked=50,realHours=1){
  await seed(icao==='DEST'?1:0.5,tracked);
  await db.query(`UPDATE flights SET telemetry=jsonb_set(jsonb_set(jsonb_set(telemetry,'{live,phase}','"PARKED"'),'{live,ground_speed_kt}','0'),'{gps_airborne_at}',to_jsonb(now()-make_interval(secs=>$1::double precision)))`,[realHours*3600]);
  return safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1}') q`);
 }
 it('credits only continuous segments at most 20 NM',async()=>{
  await seed(); await position(0.03); expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:expect.closeTo(1.801213821978562,6)});
  await seed(0,0,600); await position(0.34,600);expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:0});
 });
 it('does not credit the offline reconnect gap or reset accumulated distance',async()=>{
  await seed(0,25); await safely(`SELECT acars_connect('test')`); await position(0.03);
  expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:25,gps_reconnect_pending:false});
  await position(0.06);expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:expect.closeTo(26.80121382197856,6)});
 });
 it('does not credit even a small displacement after the two-minute online window',async()=>{
  await seed(0,25,121);await position(0.01,121);
  expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:25});
 });
 it('scales the hard jump guard to 35% on a 1000 NM route',async()=>{
  await seed();await db.exec(`UPDATE flights SET distance_nm=1000; UPDATE fleet_aircraft SET aircraft_type_id='B77W'`);
  const r=(await position(360/60.04046073261873,1190)).rows[0] as {q:{reason:string}}|undefined;
  expect(r?.q.reason).toBe('TELEMETRY_GAP_EXCEEDED');expect((await state())?.['status']).toBe('CANCELLED');
 });
 it('does not count taxi distance and latches takeoff despite phase spoofing',async()=>{
  await db.exec(`UPDATE flights SET departed_at=now()-interval '1 minute',telemetry=NULL,execution_source='ACARS_AGENT'`);
  await position(0,60,'PREFLIGHT');await position(0.01,60,'TAXI');await position(0.02,60,'TAKEOFF');
  expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:0,gps_tracking_started:true});
  await position(0.03,60,'PREFLIGHT');expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:expect.closeTo(0.6004046073261873,6),gps_tracking_started:true});
 });
 it.each(['acars_connect','acars_position'])('rejects exactly 20 minutes offline through %s',async fn=>{
  await seed(0,10,1200);
  await expect(safely(fn==='acars_connect'?`SELECT acars_connect('test')`:`SELECT acars_position('test','{"lat":0,"lon":0,"fuel_gal":28,"phase":"CRUISE"}')`)).rejects.toThrow('resume window expired');
 });
 it('permits a reconnect one second before 20 minutes',async()=>{await seed(0,10,1199);expect((await safely(`SELECT acars_connect('test')`)).rows).toHaveLength(1);});
 it('invalidates a jump over max(80 NM,35% route) and persists cancellation',async()=>{
  await seed();const r=(await position(1.34,1190)).rows[0] as {q:{reason:string}}|undefined;
  expect(r?.q.reason).toBe('TELEMETRY_GAP_EXCEEDED');expect((await state())?.['status']).toBe('CANCELLED');
 });
 it.each([['C172',220,200],['PC12NGX',456,427.5],['A320NEO',720,675],['B77W',740,720]] as const)('uses cruise-derived thresholds for %s',async(type,segment,mean)=>{
  await db.query(`UPDATE fleet_aircraft SET aircraft_type_id=$1`,[type]);
  expect(await one(`SELECT least(740,greatest(220,cruise_kts*1.60))::float segment,least(720,greatest(200,cruise_kts*1.50))::float mean FROM aircraft_types WHERE id='${type}'`)).toEqual({segment,mean});
  await seed();const lat=(segment+1)/3600*60/60.04046073261873;
  const r=(await position(lat)).rows[0] as {q:{reason:string}}|undefined;expect(r?.q.reason).toBe('TIME_ACCELERATION_DETECTED');expect((await state())?.['status']).toBe('CANCELLED');
  await db.exec(`UPDATE flights SET status='EN_ROUTE'; UPDATE fleet_aircraft SET status='EN_ROUTE'`);
  const final=(await pirep('DEST',60,60.04046073261873/(mean+1))).rows[0] as {q:{reason:string}}|undefined;
  expect(final?.q.reason).toBe('TIME_ACCELERATION_DETECTED');expect((await state())?.['status']).toBe('CANCELLED');
 });
 it('does not apply segment speed guard for an interval under 10 seconds',async()=>{
  await seed();await position(0.02,9);expect((await state())?.['status']).toBe('EN_ROUTE');
 });
 it('accepts normal C172 ground speed below the dynamic limit',async()=>{await seed();await position(160/60/60.04046073261873);expect((await state())?.['status']).toBe('EN_ROUTE');});
 it('rejects coverage below 80% without disclosing threshold or paying revenue',async()=>{
  await expect(pirep('DEST',48)).rejects.toThrow('Flight rejected: insufficient continuous ACARS tracking coverage');
  expect((await state())?.['status']).toBe('EN_ROUTE');expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:0});
 });
 it('still rejects a 0.001 NM coverage deficit despite numerical tolerance',async()=>{
  await expect(pirep('DEST',60.04046073261873*0.8-0.001)).rejects.toThrow('insufficient continuous ACARS tracking coverage');
 });
 it('settles at exactly 80% coverage with existing PIREP fields',async()=>{
  await pirep('DEST',60.04046073261873*0.8);expect((await state())?.['status']).toBe('COMPLETED');
  expect(await one(`SELECT location_icao,current_fuel_gal::float fuel FROM fleet_aircraft`)).toEqual({location_icao:'DEST',fuel:24.6535});
 });
 it('validates coverage against actual divert airport, not planned destination',async()=>{
  await pirep('ALTN',30.020230366309365*0.8);expect((await state())?.['status']).toBe('DIVERTED');
  await call('continue');expect((await state())?.['telemetry']).toBeNull();
 });
 it('skips coverage for routes at most 30 NM',async()=>{
  await db.exec(`UPDATE airports SET lat=0.49 WHERE icao='ALTN'`);await seed(0.49,0);
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(jsonb_set(telemetry,'{live,phase}','"PARKED"'),'{live,ground_speed_kt}','0')`);
  await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1}')`);expect((await state())?.['status']).toBe('DIVERTED');
 });
 it('invalidates excessive whole-flight speed before settlement',async()=>{
  const r=(await pirep('DEST',60,60.04046073261873/201)).rows[0] as {q:{reason:string}}|undefined;
  expect(r?.q.reason).toBe('TIME_ACCELERATION_DETECTED');expect((await state())?.['status']).toBe('CANCELLED');
 });
 it('returns purchased uplift and cash once after speed invalidation',async()=>{
  await db.exec(`INSERT INTO airport_fuel_pools VALUES('ORIG','100LL',90,now()); UPDATE flights SET estimate=estimate||'{"fuel_reserved_gal":10,"fuel_uplift_gal":10,"fuel_uplift_cost":82}';`);
  await db.query(`SELECT company_post('${company}','FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-82,'Uplift','${flight}','test:UPLIFT')`);
  await seed();await position(0.1,60);
  expect(await one(`SELECT stock_gal::float fuel FROM airport_fuel_pools WHERE airport_icao='ORIG'`)).toEqual({fuel:100});
  expect(await one(`SELECT sum(company_delta)::float delta,count(*) FILTER(WHERE entry_type='FUEL_REFUND')::int refunds FROM company_ledger WHERE entry_type IN ('FUEL_EXPENSE','FUEL_REFUND')`)).toEqual({delta:0,refunds:1});
  await db.exec(`UPDATE flights SET status='CANCELLED'`);expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='FUEL_REFUND'`)).toEqual({n:1});
 });
 it('invalidated continuation returns to C and refunds only continuation uplift',async()=>{
  await divert();await call('continue',30);await seed(0.5);await position(0.6);
  expect((await state())?.['status']).toBe('DIVERTED');expect(await one(`SELECT status,location_icao FROM fleet_aircraft`)).toEqual({status:'DIVERTED',location_icao:'ALTN'});
  expect(await one(`SELECT stock_gal::float fuel FROM airport_fuel_pools WHERE airport_icao='ALTN'`)).toEqual({fuel:100});
 });
 it('does not accept forged client coverage counters',async()=>{
  await seed(0,10);await safely(`SELECT acars_position('test','{"lat":0,"lon":0,"fuel_gal":28,"phase":"CRUISE","tracked_distance_nm":1000,"gps_tracking_started":false}')`);
  expect((await state())?.['telemetry']).toMatchObject({tracked_distance_nm:10,gps_tracking_started:true});
 });
 it('revokes helper execution from authenticated and anonymous callers',async()=>{
  expect(await one(`SELECT has_function_privilege('anon','acars_invalidate(flights,text,jsonb)','EXECUTE') anon,has_function_privilege('authenticated','acars_invalidate(flights,text,jsonb)','EXECUTE') authenticated`)).toEqual({anon:false,authenticated:false});
 });
 it('catches acceleration across frequent sub-10-second packets',async()=>{
  await seed(); await position(0.01,3);
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{gps_speed_anchor_at}',to_jsonb(now()-interval '12 seconds'))`);
  const r=(await position(0.02,3)).rows[0] as {q:{reason:string}}|undefined;
  expect(r?.q.reason).toBe('TIME_ACCELERATION_DETECTED');expect((await state())?.['status']).toBe('CANCELLED');
 });
 it('exempts rollout-era airborne flights from coverage but not speed checks',async()=>{
  await db.exec(`UPDATE flights SET acars_tracking_required=false`);await pirep('DEST',0);
  expect((await state())?.['status']).toBe('COMPLETED');
 });
 it('new continuation re-enables coverage even for rollout-era flights',async()=>{
  await db.exec(`UPDATE flights SET acars_tracking_required=false`);await divert();await call('continue');
  expect(await one('SELECT acars_tracking_required FROM flights')).toEqual({acars_tracking_required:true});
 });
 it('connects, tracks takeoff and continuous route, lands and reads back settlement',async()=>{
  await db.exec(`UPDATE flights SET status='DISPATCHED',execution_source='WEB_MANUAL',departed_at=NULL,telemetry=NULL`);
  await safely(`SELECT acars_connect('test')`);await position(0,60,'PREFLIGHT');await position(0,60,'TAKEOFF');
  for(let i=1;i<=20;i++){
   // Advance persisted server timestamps to simulate one real minute per packet.
   await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{gps_speed_anchor_at}',to_jsonb(now()-interval '60 seconds'))`);
   await position(i/20,60,i===20?'PARKED':'CRUISE');
  }
  await db.exec(`UPDATE flights SET departed_at=now()-interval '20 minutes',telemetry=jsonb_set(jsonb_set(telemetry,'{live,ground_speed_kt}','0'),'{gps_airborne_at}',to_jsonb(now()-interval '20 minutes'))`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.3}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBeGreaterThanOrEqual(2);expect((await state())?.['status']).toBe('COMPLETED');
  expect(await one(`SELECT location_icao FROM fleet_aircraft`)).toEqual({location_icao:'DEST'});
  expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:1});
  await expect(safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.3}')`)).rejects.toThrow('PIREP already received');
 });
 describe('aircraft fuel plausibility',()=>{
  async function departure(fuel:number,phase='TAXI'){
   await db.exec(`UPDATE profiles SET last_position_at=NULL; UPDATE flights SET execution_source='ACARS_AGENT',departed_at=now(),telemetry=NULL,estimate=jsonb_set(estimate,'{weight_budget,min_safe_fuel_gal}','40')`);
   return safely(`SELECT acars_position('test',$1::jsonb) q`,[JSON.stringify({lat:0,lon:0,fuel_gal:fuel,phase,ground_speed_kt:0})]);
  }
  async function landing(used:number,hours:number,cumulative=0,icao='DEST'){
   await seed(icao==='DEST'?1:0.5,60);
   await db.query(`UPDATE flights SET cumulative_fuel_used_gal=$1,telemetry=jsonb_set(jsonb_set(telemetry,'{live,phase}','"PARKED"'),'{live,ground_speed_kt}','0')`,[cumulative]);
   return safely(`SELECT acars_pirep('test',$1::jsonb) q`,[JSON.stringify({fuel_used_gal:used,flight_time_hours:hours})]);
  }
  it.each(['TAXI','TAXI_OUT','TAKEOFF','CLIMB','CRUISE'])('rejects departure below 70% minimum safe in %s',async phase=>{
   const r=(await departure(27.999,phase)).rows[0] as {q:{reason:string}}|undefined;
   expect(r?.q.reason).toBe('INSUFFICIENT_DEPARTURE_FUEL');expect((await state())?.['status']).toBe('CANCELLED');
   expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:0});
  });
  it('accepts exactly 70% of minimum safe fuel',async()=>{
   await departure(28);expect((await state())?.['status']).toBe('EN_ROUTE');expect((await state())?.['telemetry']).toMatchObject({departure_fuel_checked:true});
  });
  it('allows initial PREFLIGHT menu changes before departure',async()=>{
   await departure(1,'PREFLIGHT');expect((await state())?.['status']).toBe('EN_ROUTE');expect((await state())?.['telemetry']).not.toHaveProperty('departure_fuel_checked');
  });
  it('does not allow an initial PARKED packet to bypass the departure check',async()=>{
   await departure(1,'PARKED');await db.exec(`UPDATE profiles SET last_position_at=NULL`);
   const r=(await safely(`SELECT acars_position('test','{"lat":0,"lon":0,"fuel_gal":1,"phase":"TAKEOFF"}') q`)).rows[0] as {q:{reason:string}}|undefined;
   expect(r?.q.reason).toBe('INSUFFICIENT_DEPARTURE_FUEL');
  });
  it('does not recheck departure minimum on airborne reconnect with low remaining fuel',async()=>{
   await seed();await db.exec(`UPDATE flights SET fuel_tracking_started=true,last_observed_fuel_gal=2,cumulative_fuel_used_gal=26`);
   await safely(`SELECT acars_connect('test')`);
   await safely(`SELECT acars_position('test','{"lat":0,"lon":0,"fuel_gal":2,"phase":"CRUISE"}')`);
   expect((await state())?.['status']).toBe('EN_ROUTE');expect(await one('SELECT cumulative_fuel_used_gal::float burn FROM flights')).toEqual({burn:26});
  });
  it('legacy quotes without minimum safe fuel retain existing checks',async()=>{
   await db.exec(`UPDATE flights SET estimate=estimate #- '{weight_budget,min_safe_fuel_gal}'`);
   await position(0,60,'TAXI');expect((await state())?.['status']).toBe('EN_ROUTE');
  });
  it('rejects raw burn below 35% at exactly 0.6 hours before billing floor and payout',async()=>{
   const r=(await landing(1.7849,0.6)).rows[0] as {q:{reason:string}}|undefined;
   expect(r?.q.reason).toBe('IMPLAUSIBLE_LOW_FUEL_BURN');expect((await state())?.['status']).toBe('CANCELLED');
   expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:0});
  });
  it('accepts exactly 35% nominal burn at 0.6 hours',async()=>{
   await landing(1.785,0.6);expect((await state())?.['status']).toBe('COMPLETED');
  });
  it('does not apply low-burn check below 0.6 hours',async()=>{
   await landing(0.1,0.5999);expect((await state())?.['status']).toBe('COMPLETED');
  });
  it('uses cumulative server burn rather than a reset PIREP after reconnect',async()=>{
   await landing(0.1,1,3);expect((await state())?.['status']).toBe('COMPLETED');
  });
  it('client-supplied cumulative burn cannot defeat low-burn guard',async()=>{
   await seed(1,60);await db.exec(`UPDATE flights SET telemetry=jsonb_set(jsonb_set(telemetry,'{live,phase}','"PARKED"'),'{live,ground_speed_kt}','0')`);
   const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":0.1,"flight_time_hours":1,"cumulative_fuel_used_gal":9999}') q`)).rows[0] as {q:{reason:string}}|undefined;
   expect(r?.q.reason).toBe('IMPLAUSIBLE_LOW_FUEL_BURN');
  });
  it('refunds departure uplift once on low-burn rejection',async()=>{
   await db.exec(`INSERT INTO airport_fuel_pools VALUES('ORIG','100LL',90,now()); UPDATE flights SET estimate=estimate||'{"fuel_reserved_gal":10,"fuel_uplift_gal":10,"fuel_uplift_cost":82}'`);
   await db.query(`SELECT company_post('${company}','FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-82,'Uplift','${flight}','test:MISMATCH_UPLIFT')`);
   await landing(0.1,1);
   expect(await one(`SELECT stock_gal::float fuel FROM airport_fuel_pools WHERE airport_icao='ORIG'`)).toEqual({fuel:100});
   expect(await one(`SELECT sum(company_delta)::float delta,count(*) FILTER(WHERE entry_type='FUEL_REFUND')::int refunds FROM company_ledger`)).toEqual({delta:0,refunds:1});
   await expect(landing(0.1,1)).rejects.toThrow('PIREP already received');
   expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='FUEL_REFUND'`)).toEqual({n:1});
  });
  it('validates raw burn at a divert without paying original tickets',async()=>{
   await landing(0.1,1,3,'ALTN');expect((await state())?.['status']).toBe('DIVERTED');
   expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:0});
  });
  it('new continuation checks its own departure fuel and refunds only that uplift',async()=>{
   await divert();await call('continue',30);
   await db.exec(`UPDATE flights SET estimate=jsonb_set(estimate,'{weight_budget,min_safe_fuel_gal}','40'); UPDATE profiles SET last_position_at=NULL`);
   const r=(await safely(`SELECT acars_position('test','{"lat":0.5,"lon":0,"fuel_gal":1,"phase":"TAXI"}') q`)).rows[0] as {q:{reason:string}}|undefined;
   expect(r?.q.reason).toBe('INSUFFICIENT_DEPARTURE_FUEL');expect((await state())?.['status']).toBe('DIVERTED');
   expect(await one(`SELECT location_icao,status FROM fleet_aircraft`)).toEqual({location_icao:'ALTN',status:'DIVERTED'});
   expect(await one(`SELECT stock_gal::float fuel FROM airport_fuel_pools WHERE airport_icao='ALTN'`)).toEqual({fuel:100});
  });
  it('keeps the existing 105% tank capacity guard',async()=>{
   await expect(departure(58.801,'PREFLIGHT')).rejects.toThrow('exceeds aircraft tank capacity');
  });
 });
});
