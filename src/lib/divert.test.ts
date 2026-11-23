// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
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
describe('Divert contract and tanks',()=>{
 it('lands at C, burns only A–C fuel, charges landing but no ticket revenue',async()=>{
  await divert();
  expect(await one(`SELECT status,location_icao,current_fuel_gal::float FROM fleet_aircraft`)).toMatchObject({status:'DIVERTED',location_icao:'ALTN'});
  const f=(await db.query<{divert_state:{legs:{fuel_used_gal:number}[]}}>('SELECT divert_state FROM flights')).rows[0];
  expect(f?.divert_state.legs[0]?.fuel_used_gal).toBeCloseTo(60.04046073261873*0.5/122*8.5,4);
  expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:0});
  expect(await one('SELECT count(*)::int n FROM company_ledger')).toEqual({n:1});
 });
 it('rejects duplicate divert without double charging',async()=>{await divert();await expect(divert()).rejects.toThrow();expect(await one('SELECT count(*)::int n FROM company_ledger')).toEqual({n:1});});
 it('keeps all 3 passengers and original revenue when continuing from C',async()=>{
  const before=await one(`SELECT estimate->'revenue' revenue FROM flights`);await divert();await call('continue');
  expect(await one(`SELECT status,origin_icao,destination_icao,passengers,estimate->'revenue' revenue FROM flights`)).toEqual({status:'DISPATCHED',origin_icao:'ALTN',destination_icao:'DEST',passengers:3,revenue:before?.['revenue']});
 });
 it('does not drain existing tanks to make room: min target equals fuel aboard',async()=>{
  await divert();const r=(await call('quote',0)).rows[0] as {q:{tank:{current_fuel_gal:number;min_target_gal:number;added_fuel_gal:number}}}|undefined;
  expect(r?.q.tank.min_target_gal).toBe(r?.q.tank.current_fuel_gal);expect(r?.q.tank.added_fuel_gal).toBe(0);
 });
 it('refuses continuation instead of silently removing locked payload at MTOW',async()=>{await divert();await db.exec(`UPDATE aircraft_types SET mtow_kg=1000 WHERE id='C172'`);await expect(call('continue')).rejects.toThrow('Locked payload');});
 it('requires sufficient C fuel stock for uplift',async()=>{await divert();await db.exec(`UPDATE airport_fuel_pools SET stock_gal=0`);await expect(call('continue',30)).rejects.toThrow('fuel stock');});
 it('cancellation refunds only new uplift and keeps contract at C',async()=>{
  await divert();await call('continue',30);await db.query(`SELECT cancel_test_flight('${flight}')`);
  expect(await one(`SELECT status FROM flights`)).toEqual({status:'DIVERTED'});expect(await one('SELECT stock_gal::float stock FROM airport_fuel_pools')).toEqual({stock:100});
  expect(await one(`SELECT sum(company_delta)::float delta FROM company_ledger WHERE entry_type IN ('FUEL_EXPENSE','FUEL_REFUND')`)).toEqual({delta:0});
 });
 it('allows repeated cancellation/refuelling without double refunds or fuel creation',async()=>{await divert();for(let i=0;i<2;i++){await call('continue',30);await db.query(`SELECT cancel_test_flight('${flight}')`);}expect(await one('SELECT stock_gal::float stock FROM airport_fuel_pools')).toEqual({stock:100});});
 it('abandon forfeits revenue and releases aircraft at C idempotently',async()=>{await divert();await call('abandon');await call('abandon');expect(await one(`SELECT status,location_icao FROM fleet_aircraft`)).toEqual({status:'AVAILABLE',location_icao:'ALTN'});expect(await one(`SELECT status,settlement->'revenue' revenue FROM flights`)).toEqual({status:'ABANDONED',revenue:0});});
 it('rental remains held after divert, pays burn and retires only on abandon',async()=>{await db.exec(`UPDATE fleet_aircraft SET ownership='RENTAL'`);await divert();expect(await one(`SELECT status,returned_at FROM fleet_aircraft`)).toEqual({status:'DIVERTED',returned_at:null});expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='FUEL_EXPENSE'`)).toEqual({n:1});await call('abandon');expect(await one(`SELECT status FROM fleet_aircraft`)).toEqual({status:'RETURNED'});});
 it.each([null,100])('rejects alternate with unknown/short runway %s',async runway=>{await db.query(`UPDATE airports SET longest_runway_ft=$1 WHERE icao='ALTN'`,[runway]);await db.exec(`UPDATE aircraft_types SET minimum_runway_ft=1500 WHERE id='C172'`);await expect(divert()).rejects.toThrow('runway');});
 it('denies another account and anonymous access',async()=>{await divert();await db.exec(`SELECT set_config('request.jwt.claims','{"sub":"${aircraft}"}',true)`);await expect(call('abandon')).rejects.toThrow('Flight not found');});
 it('revokes internal helpers and public mutation entry points from anonymous',async()=>{expect(await one(`SELECT has_function_privilege('authenticated','record_divert(flights,text,jsonb)','EXECUTE') helper,has_function_privilege('anon','divert_action(uuid,text,numeric)','EXECUTE') anon`)).toEqual({helper:false,anon:false});});
 it.each([false,true])('mission deadline keeps ticking; late=%s pays normal 50 percent cut only at B',async late=>{
  await db.exec(`INSERT INTO special_missions(id,flight_id,status,deadline_at) VALUES('${flight}','${flight}','ACCEPTED',now()+interval '${late?'-1':'1'} hours')`);
  const before=await one('SELECT deadline_at FROM special_missions');await divert();await call('continue');expect(await one('SELECT deadline_at FROM special_missions')).toEqual(before);expect(await one('SELECT status FROM special_missions')).toEqual({status:'ACCEPTED'});
  await db.exec(`UPDATE flights SET status='EN_ROUTE',departed_at=now()-interval '2 hours'`);await db.query(`SELECT settle_flight('${flight}')`);
  expect(await one(`SELECT delivered_late,final_payout::float=(SELECT (divert_state->'contract'->>'revenue')::numeric*${late?'0.5':'1'} FROM flights) correct FROM special_missions`)).toEqual({delivered_late:late,correct:true});
  expect(await one(`SELECT count(*)::int n FROM company_ledger WHERE entry_type='TICKET_REVENUE'`)).toEqual({n:1});
 });
 it('ACARS uses existing parked GPS report for divert without new PIREP fields',async()=>{
  await db.exec(`UPDATE flights SET execution_source='ACARS_AGENT',telemetry=jsonb_build_object('live',jsonb_build_object('lat',0.5,'lon',0,'phase','PARKED','ground_speed_kt',0,'received_at',now()))`);
  await db.query(`SELECT acars_pirep('test','{"fuel_used_gal":4,"flight_time_hours":0.5}')`);expect(await one('SELECT status FROM flights')).toEqual({status:'DIVERTED'});
 });
 it('ACARS rejects airborne or stale landing evidence',async()=>{await db.exec(`UPDATE flights SET execution_source='ACARS_AGENT',telemetry=jsonb_build_object('live',jsonb_build_object('lat',0.5,'lon',0,'phase','CRUISE','ground_speed_kt',120,'received_at',now()))`);await expect(db.query(`SELECT acars_pirep('test','{"fuel_used_gal":4,"flight_time_hours":0.5}')`)).rejects.toThrow('Fresh landing');});
 it('uses rules_snapshot when real dispatched estimate omits rules',async()=>{
  await db.exec(`UPDATE flights SET rules_snapshot=rules_snapshot||(estimate->'rules'),estimate=estimate-'rules'`);await divert();await call('continue');
  expect(await one(`SELECT status FROM flights`)).toEqual({status:'DISPATCHED'});
 });
 it('ACARS illegal refuel on continuation refunds uplift and returns to held C, not A',async()=>{
  await divert();await call('continue',30);
  await db.exec(`UPDATE flights SET execution_source='ACARS_AGENT',status='EN_ROUTE',fuel_tracking_started=true,last_observed_fuel_gal=20,departed_at=now()-interval '1 minute',telemetry=jsonb_build_object('live',jsonb_build_object('lat',0.5,'lon',0,'fuel_gal',20,'phase','CLIMB','received_at',now()-interval '10 seconds'))`);
  await db.query(`SELECT acars_position('test','{"lat":0.5,"lon":0,"fuel_gal":30,"phase":"CRUISE"}')`);
  expect(await one('SELECT status FROM flights')).toEqual({status:'DIVERTED'});
  expect(await one('SELECT status,location_icao FROM fleet_aircraft')).toEqual({status:'DIVERTED',location_icao:'ALTN'});
  expect(await one('SELECT stock_gal::float stock FROM airport_fuel_pools')).toEqual({stock:100});
  expect(await one(`SELECT sum(company_delta)::float delta FROM company_ledger WHERE entry_type IN ('FUEL_EXPENSE','FUEL_REFUND')`)).toEqual({delta:0});
 });
 it('counts each landed leg once in airframe hours after final settlement retry',async()=>{
  await divert();await call('continue');await db.exec(`UPDATE flights SET status='EN_ROUTE',departed_at=now()-interval '2 hours'`);
  await db.query(`SELECT settle_flight('${flight}')`);await db.query(`SELECT settle_flight('${flight}')`);
  expect(await one(`SELECT round(airframe_hours*60,2)::float minutes FROM fleet_aircraft`)).toEqual(await one(`SELECT round((settlement->>'minutes')::numeric,2)::float minutes FROM flights`));
 });
 it('expired lease cannot be returned with a diverted contract, but renewal preserves its lock',async()=>{
  await divert();
  await db.exec(`ALTER TABLE fleet_aircraft ADD COLUMN lease_deposit numeric DEFAULT 3000,ADD COLUMN weekly_rate numeric,ADD COLUMN next_payment_due timestamptz;
   ALTER TABLE lease_contracts ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN company_id uuid,ADD COLUMN term_weeks int,ADD COLUMN base_weekly_rate numeric,ADD COLUMN weekly_rate numeric,ADD COLUMN renewal boolean;
   ALTER TABLE aircraft_types ADD COLUMN weekly_rate numeric DEFAULT 950;
   ALTER TABLE operating_rules ADD COLUMN renewal_discount numeric DEFAULT 0.05;
   CREATE FUNCTION process_due_obligations() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
   CREATE FUNCTION assert_company_investment() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
   UPDATE fleet_aircraft SET ownership='LEASED';
   INSERT INTO lease_contracts(aircraft_id,starts_at,ends_at) VALUES('${aircraft}',now()-interval '8 days',now()-interval '1 day');`);
  await expect(safely(`SELECT manage_lease('${aircraft}','return',4)`)).rejects.toThrow('active flight');
  await db.query(`SELECT manage_lease('${aircraft}','renew',4)`);
  expect(await one('SELECT status,location_icao FROM fleet_aircraft')).toEqual({status:'DIVERTED',location_icao:'ALTN'});
  await call('continue');expect(await one('SELECT status FROM flights')).toEqual({status:'DISPATCHED'});
 });
});

describe('Persistent ACARS fuel across reconnects',()=>{
 beforeEach(()=>db.exec(`UPDATE flights SET departed_at=now()-interval '10 minutes'`));
 const position=async(fuel:number,phase:string)=>{
  await db.exec(`UPDATE profiles SET last_position_at=NULL; UPDATE flights SET execution_source='ACARS_AGENT'`);
  return safely(`SELECT acars_position('test',$1::jsonb) q`,[JSON.stringify({lat:0,lon:0,fuel_gal:fuel,phase,ground_speed_kt:0})]);
 };
 const fuelState=()=>one(`SELECT cumulative_fuel_used_gal::float burn,last_observed_fuel_gal::float observed,fuel_tracking_started started FROM flights`);
 it('does not count 40→28 gal simulator-menu reduction during PREFLIGHT',async()=>{
  // Avoid ramp uplift in this test: only test observation, not fuel purchasing.
  await db.exec(`UPDATE flights SET estimate=estimate-'fuel_uplift_gal'`);
  await position(40,'PREFLIGHT');await position(28,'PREFLIGHT');
  expect(await fuelState()).toEqual({burn:0,observed:28,started:false});
  await position(27,'TAXI');expect(await fuelState()).toEqual({burn:1,observed:27,started:true});
 });
 it('keeps full pre-restart consumption when PIREP reports only the last session',async()=>{
  await position(28,'PREFLIGHT');await position(27,'TAXI');await position(20,'CRUISE');
  await safely(`SELECT acars_connect('test')`);
  expect(await fuelState()).toEqual({burn:8,observed:20,started:true});
  // First report after reconnect; the server counter survives the client restart.
  await position(18,'CRUISE');await position(16,'PARKED');
  expect(await fuelState()).toEqual({burn:12,observed:16,started:true});
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1');`);
  const result=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1}') q`)).rows[0] as {q:Quote}|undefined;
  expect(result?.q.billed_fuel_gal).toBe(12);
  expect(await one(`SELECT current_fuel_gal::float fuel,location_icao FROM fleet_aircraft`)).toEqual({fuel:16,location_icao:'DEST'});
 });
 it('does not reset burn when a reconnect claims PREFLIGHT',async()=>{
  await position(28,'PREFLIGHT');await position(20,'CRUISE');await position(19,'PREFLIGHT');
  expect(await fuelState()).toEqual({burn:9,observed:19,started:true});
 });
 it.each(['PREFLIGHT','PARKED','TAXI','CRUISE'])('rejects >2.0 gal refuel after tracking starts, including phase %s',async phase=>{
  await position(28,'PREFLIGHT');await position(20,'CRUISE');
  const r=(await position(22.01,phase)).rows[0] as {q:{reason:string;status:string}}|undefined;
  expect(r?.q.reason).toBe('ILLEGAL_REFUEL_IN_FLIGHT');expect(r?.q.status).toBe('CANCELLED');
  expect(await fuelState()).toEqual({burn:8,observed:20,started:true});
 });
 it('accepts exactly 2.0 gal tolerance without reducing accumulated consumption',async()=>{
  await position(28,'PREFLIGHT');await position(20,'CRUISE');await position(22,'CRUISE');
  expect(await fuelState()).toEqual({burn:8,observed:22,started:true});
 });
 it('reconciles target minus final even without a departure observation',async()=>{
  await position(16,'PARKED');await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1')`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBe(12);expect(await one('SELECT current_fuel_gal::float fuel FROM fleet_aircraft')).toEqual({fuel:16});
 });
 it('retains the frozen 80% floor and the larger client report',async()=>{
  const q={weight_budget:{trip_fuel_gal:100,fuel_billing_floor_pct:0.8,planned_fuel_gal:150},fuel_price_per_gal:2,fuel_cost:200,net:800};
  for(const [reported,expected] of [[2,80],[110,110]] as const){
   const r=(await db.query<{q:Quote}>(`SELECT flight_fuel_billing($1::jsonb,'ACARS_AGENT',$2::jsonb) q`,[JSON.stringify(q),JSON.stringify({fuel_used_gal:reported,cumulative_fuel_used_gal:40,final_fuel_gal:100})])).rows[0];
   expect(r?.q.billed_fuel_gal).toBe(expected);
  }
 });
 it('ignores forged client cumulative/final fields at verified settlement',async()=>{
  await position(28,'PREFLIGHT');await position(16,'PARKED');await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1')`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1,"cumulative_fuel_used_gal":0,"final_fuel_gal":28}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBe(12);
 });
 it('reconciles the reported 362→106.3 gal case despite a restarted 25.7 gal PIREP',async()=>{
  await db.exec(`UPDATE fleet_aircraft SET aircraft_type_id='B350'; UPDATE flights SET estimate=estimate||'{"target_fuel_gal":362}'`);
  await position(362,'PREFLIGHT');await position(150,'CRUISE');await safely(`SELECT acars_connect('test')`);await position(106.3,'PARKED');
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1')`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":25.7,"flight_time_hours":0.1}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBeCloseTo(255.7,4);expect(await one('SELECT current_fuel_gal::float fuel FROM fleet_aircraft')).toEqual({fuel:106.3});
 });
 it('rental charges full observed burn after reconnect and retires the aircraft',async()=>{
  await db.exec(`UPDATE fleet_aircraft SET ownership='RENTAL'; UPDATE flights SET estimate=estimate-'fuel_uplift_gal'`);
  await position(28,'PREFLIGHT');await position(20,'CRUISE');await safely(`SELECT acars_connect('test')`);await position(16,'PARKED');
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1')`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":2,"flight_time_hours":0.1}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBe(12);expect(await one('SELECT status,current_fuel_gal::float fuel FROM fleet_aircraft')).toEqual({status:'RETURNED',fuel:0});
  expect(await one(`SELECT sum(amount)::float cost FROM company_ledger WHERE entry_type='FUEL_EXPENSE'`)).toEqual({cost:98.4});
 });
 it.each(['manual','guard'])('refunds paid uplift exactly once after %s cancellation',async mode=>{
  await db.exec(`INSERT INTO airport_fuel_pools VALUES('ORIG','100LL',90,now()); UPDATE flights SET estimate=estimate||'{"fuel_reserved_gal":10,"fuel_uplift_gal":10,"fuel_uplift_cost":82}'`);
  await db.query(`SELECT company_post('${company}','FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-82,'Uplift','${flight}','test:UPLIFT')`);
  await position(28,'PREFLIGHT');await position(20,'CRUISE');
  if(mode==='manual') await safely(`SELECT cancel_test_flight('${flight}')`);else await position(23,'PREFLIGHT');
  expect(await one(`SELECT stock_gal::float fuel FROM airport_fuel_pools WHERE airport_icao='ORIG'`)).toEqual({fuel:100});
  expect(await one(`SELECT sum(company_delta)::float delta,count(*) FILTER(WHERE entry_type='FUEL_REFUND')::int refunds FROM company_ledger WHERE entry_type IN ('FUEL_EXPENSE','FUEL_REFUND')`)).toEqual({delta:0,refunds:1});
  await db.exec(`UPDATE flights SET status='CANCELLED'`);
  expect(await one(`SELECT count(*)::int refunds FROM company_ledger WHERE entry_type='FUEL_REFUND'`)).toEqual({refunds:1});
 });
 it('settles a diverted leg once and starts a fresh counter only for its continuation',async()=>{
  await position(28,'PREFLIGHT');await position(24,'PARKED');
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','0.5')`);
  await safely(`SELECT acars_pirep('test','{"fuel_used_gal":1,"flight_time_hours":0.1}')`);
  expect(await one('SELECT current_fuel_gal::float fuel FROM fleet_aircraft')).toEqual({fuel:24});
  await call('continue');expect(await fuelState()).toEqual({burn:0,observed:null,started:false});
  await position(24,'PREFLIGHT');await position(21,'PARKED');
  await db.exec(`UPDATE flights SET telemetry=jsonb_set(telemetry,'{live,lat}','1'),departed_at=now()-interval '1 hour'`);
  const r=(await safely(`SELECT acars_pirep('test','{"fuel_used_gal":1,"flight_time_hours":0.5}') q`)).rows[0] as {q:Quote}|undefined;
  expect(r?.q.billed_fuel_gal).toBe(3);expect(await one('SELECT current_fuel_gal::float fuel FROM fleet_aircraft')).toEqual({fuel:21});
 });
 it.each([-1,null,'NaN'])('rejects invalid observation %s',async fuel=>{
  await db.exec('SAVEPOINT invalid');
  await expect(db.query(`SELECT acars_position('test',$1::jsonb)`,[JSON.stringify({lat:0,lon:0,fuel_gal:fuel,phase:'CRUISE'})])).rejects.toThrow();
  await db.exec('ROLLBACK TO SAVEPOINT invalid');expect(await fuelState()).toEqual({burn:0,observed:null,started:false});
 });
});
