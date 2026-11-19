CREATE INDEX IF NOT EXISTS flights_radar_created ON public.flights(created_at,origin_icao) WHERE status<>'CANCELLED';
CREATE INDEX IF NOT EXISTS flights_radar_completed ON public.flights(completed_at,destination_icao) WHERE status='COMPLETED';
CREATE OR REPLACE FUNCTION public.radar_airport_metrics() RETURNS TABLE(icao text,pax_capacity numeric,pax_stock numeric,avgas_capacity numeric,avgas_stock numeric,jeta_capacity numeric,jeta_stock numeric,operations_7d bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH settings AS MATERIALIZED (SELECT jsonb_object_agg(key,value) r FROM public.economy_config),
activity AS (SELECT port,count(*) total FROM (SELECT origin_icao port FROM public.flights WHERE created_at>=now()-interval '7 days' AND status<>'CANCELLED' UNION ALL SELECT destination_icao FROM public.flights WHERE completed_at>=now()-interval '7 days' AND status='COMPLETED') x GROUP BY port),
base AS (
 SELECT a.icao,s.r,p.stock,p.updated_at,p.last_departure_at,
 (s.r->'airport_capacities'->>(a.size-1))::numeric*(1+0.1*(greatest(a.development_level,1)-1)) pc,
 ar.capacity_gal*(1+ar.development_multiplier*greatest(0,a.development_level-1)) ac,
 jr.capacity_gal*(1+jr.development_multiplier*greatest(0,a.development_level-1)) jc,
 ar.refill_per_hour avgas_rate,jr.refill_per_hour jeta_rate,
 ap.stock_gal avgas_raw,ap.updated_at avgas_time,jp.stock_gal jeta_raw,jp.updated_at jeta_time,
 coalesce(activity.total,0) ops
 FROM public.airports a CROSS JOIN settings s
 LEFT JOIN public.airport_passenger_pools p ON p.airport_icao=a.icao
 LEFT JOIN public.airport_fuel_rules ar ON ar.size=a.size AND ar.fuel_type='100LL'
 LEFT JOIN public.airport_fuel_rules jr ON jr.size=a.size AND jr.fuel_type='Jet-A'
 LEFT JOIN public.airport_fuel_pools ap ON ap.airport_icao=a.icao AND ap.fuel_type='100LL'
 LEFT JOIN public.airport_fuel_pools jp ON jp.airport_icao=a.icao AND jp.fuel_type='Jet-A'
 LEFT JOIN activity ON activity.port=a.icao
 WHERE (SELECT auth.uid()) IS NOT NULL
)
SELECT b.icao,pc,
 CASE WHEN updated_at IS NULL THEN pc*(r->>'initial_stock')::numeric
 WHEN stock<pc*(r->>'natural_cap')::numeric THEN least(pc*(r->>'natural_cap')::numeric,stock+pc*(r->>'hourly_rate')::numeric*greatest(0,extract(epoch FROM now()-updated_at)/3600))
 ELSE least(pc*(r->>'transit_cap')::numeric,greatest(pc*(r->>'natural_cap')::numeric,stock-pc*(r->>'hourly_rate')::numeric*greatest(0,extract(epoch FROM now()-greatest(updated_at,last_departure_at+make_interval(hours=>(r->>'burnout_idle_hours')::integer)))/3600))) END,
 ac,greatest(0,least(ac,coalesce(avgas_raw,ac)+greatest(0,extract(epoch FROM now()-coalesce(avgas_time,now()))/3600)*ac*avgas_rate)),
 jc,greatest(0,least(jc,coalesce(jeta_raw,jc)+greatest(0,extract(epoch FROM now()-coalesce(jeta_time,now()))/3600)*jc*jeta_rate)),ops
 FROM base b ORDER BY b.icao
$$;