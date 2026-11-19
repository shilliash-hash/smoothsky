import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
export const getOperations = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const db=context.supabase;
 const {data:company,error:ce}=await db.from('companies').select('*').maybeSingle();if(ce)throw ce;
 const airports=[];
 for(let offset=0;;offset+=1000){const {data,error}=await db.from('airports').select('*').order('icao').range(offset,offset+999);if(error)throw error;airports.push(...data);if(data.length<1000)break;}
 const [r,p,f,l,t]=await Promise.all([db.from('economy_config').select('*'),db.from('airport_passenger_pools').select('*').limit(10000),db.from('flights').select('*').order('created_at',{ascending:false}).limit(100),db.from('fleet_aircraft').select('*, type:aircraft_types(*)'),db.from('company_ledger').select('*').order('id',{ascending:false}).limit(1)]);
 for(const result of [r,p,f,l,t])if(result.error)throw result.error;
 return {company,airports,rules:Object.fromEntries((r.data??[]).map(x=>[x.key,x.value])),pools:p.data??[],flights:f.data??[],fleet:l.data??[],balance:Number(t.data?.[0]?.balance_after??0),serverTime:Date.now()};
});
export const flightAction = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({action:z.enum(['quote','dispatch','start','settle','cancel']),aircraft:z.string().uuid().optional(),destination:z.string().optional(),flight:z.string().uuid().optional()})).handler(async({data,context})=>{
 const db=context.supabase;
 if(data.action==='quote'||data.action==='dispatch'){
  if(!data.aircraft||!data.destination)throw new Error('Aircraft and destination required');
  const {data:result,error}=await db.rpc(data.action==='quote'?'flight_quote':'dispatch_flight',{p_aircraft:data.aircraft,p_destination:data.destination});if(error)throw new Error(error.message);return result;
 }
 if(!data.flight)throw new Error('Flight required');
 const {data:result,error}=await db.rpc(data.action==='start'?'start_test_flight':data.action==='cancel'?'cancel_test_flight':'settle_flight',{p_flight:data.flight});if(error)throw new Error(error.message);return result;
});
