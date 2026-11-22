// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=id(1), owner=id(2), pilot=id(3), company=id(10), other=id(11), personal=id(12), aircraft=id(20), otherAircraft=id(21), flight=id(30);
const one = async (sql:string) => (await db.query(sql)).rows[0];
const asUser = (user:string) => db.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:user})]);
beforeAll(async()=>{
  await db.exec(readFileSync('src/test/fixtures/admin-cleanup.sql','utf8'));
  const fuel=readFileSync('drizzle/migrations/0057_persistent_fuel_tanks.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.return_cancelled_fuel\(\)[\s\S]*?END \$function\$;/)?.[0];
  if (!fuel) throw new Error('Production fuel cancellation function missing');
  await db.exec(fuel+` CREATE TRIGGER return_fuel_after_cancel AFTER UPDATE OF status ON flights FOR EACH ROW EXECUTE FUNCTION return_cancelled_fuel();`);
  await db.exec(readFileSync('drizzle/migrations/0060_admin_account_cleanup.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0061_admin_cleanup_cancellation_integrity.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0062_admin_cleanup_ledger_guard.sql','utf8'));
},30000);
beforeEach(async()=>{
  await db.exec(`BEGIN;
  INSERT INTO auth.users(id,email) VALUES('${admin}','admin@test.invalid'),('${owner}','owner@test.invalid'),('${pilot}','pilot@test.invalid');
  INSERT INTO user_roles VALUES('${admin}','admin'),('${owner}','user');
  INSERT INTO economy_config VALUES('starting_capital','30000');
  INSERT INTO companies(id,user_id,name,icao_code,home_base_icao) VALUES('${company}','${owner}','Test airline','TST','ORIG'),('${other}','${admin}','Other airline','OTH','ORIG');
  INSERT INTO profiles(id,roster_company_id,roster_joined_at) VALUES('${admin}',NULL,NULL),('${owner}',NULL,NULL),('${pilot}','${company}',now());
  INSERT INTO fleet_aircraft(id,company_id,status,location_icao) VALUES('${aircraft}','${company}','EN_ROUTE','ORIG'),('${otherAircraft}','${other}','AVAILABLE','ORIG');
  INSERT INTO flights(id,company_id,aircraft_id,status,pilot_id,passengers,origin_icao,flight_number,estimate) VALUES('${flight}','${company}','${aircraft}','EN_ROUTE','${pilot}',3,'ORIG','TST101','{"fuel_type":"Jet-A","fuel_reserved_gal":20,"fuel_uplift_gal":20,"fuel_uplift_cost":100}');
  INSERT INTO special_missions VALUES('${id(40)}','${flight}','${company}','ACCEPTED');
  INSERT INTO used_aircraft_listings VALUES('${id(41)}','${company}','${other}','${aircraft}');
  INSERT INTO lease_contracts VALUES('${id(42)}','${company}','${aircraft}');
  INSERT INTO company_fobs VALUES('${id(43)}','${company}');
  INSERT INTO company_stakes VALUES('${id(44)}','${company}','${pilot}');
  INSERT INTO leaderboard_weekly_snapshots VALUES('${company}');
  INSERT INTO company_ledger(company_id,entry_type,balance_after,idempotency_key) VALUES('${company}','INITIAL_GRANT',-500,'old'),('${other}','INITIAL_GRANT',1234,'other');
  INSERT INTO pilot_ledger(user_id,amount) VALUES('${owner}',50),('${pilot}',90);
  INSERT INTO airport_fuel_pools VALUES('ORIG','Jet-A',100,now());
  INSERT INTO airport_passenger_pools VALUES('ORIG',10,now());`);
  await asUser(admin);
});
afterEach(()=>db.exec('ROLLBACK'));
afterAll(()=>db.close());
describe('applied administrative cleanup SQL',()=>{
  it('resets indebted company to exactly 30000 SC with one opening entry and unchanged identity',async()=>{
    await db.query(`SELECT admin_reset_company('${company}')`);
    expect(await one(`SELECT count(*)::int n,min(balance_after)::float balance,min(entry_type) entry FROM company_ledger WHERE company_id='${company}'`)).toEqual({n:1,balance:30000,entry:'INITIAL_GRANT'});
    expect(await one(`SELECT name,icao_code,home_base_icao,next_flight_sequence::int FROM companies WHERE id='${company}'`)).toEqual({name:'Test airline',icao_code:'TST',home_base_icao:'ORIG',next_flight_sequence:101});
  });
  it('clears every company asset in foreign-key-safe order and detaches roster pilots',async()=>{
    await db.query(`SELECT admin_reset_company('${company}')`);
    for(const table of ['flights','special_missions','used_aircraft_listings','lease_contracts','company_fobs','company_stakes','leaderboard_weekly_snapshots']) expect(await one(`SELECT count(*)::int n FROM ${table}`)).toEqual({n:0});
    expect(await one(`SELECT count(*)::int n FROM fleet_aircraft WHERE company_id='${company}'`)).toEqual({n:0});
    expect(await one(`SELECT roster_company_id,roster_joined_at FROM profiles WHERE id='${pilot}'`)).toEqual({roster_company_id:null,roster_joined_at:null});
  });
  it('returns 20 gallons and three passengers exactly once during reset',async()=>{
    await db.query(`SELECT admin_reset_company('${company}')`);
    await db.query(`SELECT admin_reset_company('${company}')`);
    expect(await one('SELECT stock_gal::float fuel FROM airport_fuel_pools')).toEqual({fuel:120});
    expect(await one('SELECT stock::int passengers FROM airport_passenger_pools')).toEqual({passengers:13});
  });
  it('uses changed starting capital instead of a hardcoded reset balance',async()=>{
    await db.exec(`UPDATE economy_config SET value='45000' WHERE key='starting_capital'`);
    await db.query(`SELECT admin_reset_company('${company}')`);
    expect(await one(`SELECT balance_after::float balance FROM company_ledger WHERE company_id='${company}'`)).toEqual({balance:45000});
  });
  it('denies resetting the administrator own company',async()=>{
    await expect(db.query(`SELECT admin_reset_company('${other}')`)).rejects.toThrow('own account');
  });
  it('denies deleting the administrator own account',async()=>{
    await expect(db.query(`SELECT admin_delete_user_and_company('${admin}')`)).rejects.toThrow('own account');
  });
  it('denies reset without the administrator role',async()=>{
    await asUser(owner);
    await expect(db.query(`SELECT admin_reset_company('${company}')`)).rejects.toThrow('Administrator access');
  });
  it('denies account cleanup without the administrator role',async()=>{
    await asUser(owner);
    await expect(db.query(`SELECT admin_delete_user_and_company('${pilot}')`)).rejects.toThrow('Administrator access');
  });
  it('denies unauthenticated reset requests',async()=>{
    await db.query(`SELECT set_config('request.jwt.claims','{}',true)`);
    await expect(db.query(`SELECT admin_reset_company('${company}')`)).rejects.toThrow('Administrator access');
  });
  it('does not permit an authenticated caller to forge the ledger cleanup scope',async()=>{
    await db.exec(`GRANT SELECT,DELETE ON company_ledger TO authenticated; GRANT EXECUTE ON FUNCTION is_admin() TO authenticated; SELECT set_config('smoothsky.cleanup_company','${company}',true); SET LOCAL ROLE authenticated;`);
    await expect(db.query(`DELETE FROM company_ledger WHERE company_id='${company}'`)).rejects.toThrow('immutable');
  });
  it('does not expose internal destructive helpers to authenticated users',async()=>{
    expect(await one(`SELECT has_function_privilege('authenticated','admin_cleanup_company(uuid)','EXECUTE') company,has_function_privilege('authenticated','admin_cancel_cleanup_flights(uuid[])','EXECUTE') flights,has_function_privilege('anon','admin_reset_company(uuid)','EXECUTE') anon`)).toEqual({company:false,flights:false,anon:false});
  });
  it('still forbids ordinary ledger edits',async()=>{
    await expect(db.query(`UPDATE company_ledger SET balance_after=999999 WHERE company_id='${company}'`)).rejects.toThrow('immutable');
  });
  it('restores the ledger delete guard after reset',async()=>{
    await db.query(`SELECT admin_reset_company('${company}')`);
    await expect(db.query(`DELETE FROM company_ledger WHERE company_id='${company}'`)).rejects.toThrow('immutable');
  });
  it('deletes commercial and personal resources and pilot data, not the managed Auth identity',async()=>{
    await db.exec(`INSERT INTO companies(id,user_id,is_personal) VALUES('${personal}','${owner}',true); INSERT INTO fleet_aircraft(id,company_id) VALUES('${id(22)}','${personal}');`);
    await db.query(`SELECT admin_delete_user_and_company('${owner}')`);
    expect(await one(`SELECT count(*)::int n FROM companies WHERE user_id='${owner}'`)).toEqual({n:0});
    expect(await one(`SELECT count(*)::int n FROM profiles WHERE id='${owner}'`)).toEqual({n:0});
    expect(await one(`SELECT count(*)::int n FROM pilot_ledger WHERE user_id='${owner}'`)).toEqual({n:0});
    expect(await one(`SELECT count(*)::int n FROM auth.users WHERE id='${owner}'`)).toEqual({n:1});
    expect(await one(`SELECT balance_after::float balance FROM company_ledger WHERE company_id='${other}'`)).toEqual({balance:1234});
  });
  it('deletes a no-company pilot, cancels their foreign flight and credits its owner correctly',async()=>{
    await db.query(`SELECT admin_delete_user_and_company('${pilot}')`);
    expect(await one(`SELECT status,pilot_id FROM flights WHERE id='${flight}'`)).toEqual({status:'CANCELLED',pilot_id:null});
    expect(await one(`SELECT status FROM fleet_aircraft WHERE id='${aircraft}'`)).toEqual({status:'AVAILABLE'});
    expect(await one(`SELECT balance_after::float balance FROM company_ledger WHERE company_id='${company}' ORDER BY id DESC LIMIT 1`)).toEqual({balance:-400});
    expect(await one(`SELECT count(*)::int n FROM company_stakes WHERE holder_id='${pilot}'`)).toEqual({n:0});
  });
  it('returns a foreign spot rental instead of making it reusable',async()=>{
    await db.exec(`UPDATE fleet_aircraft SET ownership='RENTAL' WHERE id='${aircraft}'`);
    await db.query(`SELECT admin_delete_user_and_company('${pilot}')`);
    expect(await one(`SELECT status,returned_at IS NOT NULL returned FROM fleet_aircraft WHERE id='${aircraft}'`)).toEqual({status:'RETURNED',returned:true});
  });
  it('never grants starting capital to a personal hangar',async()=>{
    await db.exec(`UPDATE companies SET is_personal=true WHERE id='${company}'`);
    await expect(db.query(`SELECT admin_reset_company('${company}')`)).rejects.toThrow('Personal hangars');
  });
});