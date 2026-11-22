CREATE OR REPLACE FUNCTION public.dispatch_usable_range_pct() RETURNS double precision LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
SELECT CASE WHEN coalesce(current_setting('smoothsky.ferry',true),'')='1' THEN 1.0::double precision
 ELSE coalesce((SELECT (value #>> '{}')::double precision FROM public.economy_config WHERE key='dispatch_usable_range_pct'),0.75) END $f$;

DO $do$
DECLARE fn text; def text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean)','public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean)'] LOOP
  def := pg_get_functiondef(fn::regprocedure);
  IF position('smoothsky.ferry' in def)=0 THEN
   def := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n PERFORM set_config(''smoothsky.ferry'', CASE WHEN coalesce(p_all_cargo,false) AND coalesce(p_cargo_kg,0)=0 THEN ''1'' ELSE '''' END, true);\n');
   EXECUTE def;
  END IF;
 END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.dispatch_flight(p_aircraft uuid, p_destination text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f fleet_aircraft%ROWTYPE; q jsonb; fid uuid; cfg jsonb; ferry boolean; rng numeric; lim numeric; BEGIN
 SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF;
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 cfg := nullif(current_setting('smoothsky.cargo',true),'')::jsonb;
 ferry := coalesce((cfg->>'all_cargo')::boolean,false) AND coalesce((cfg->>'cargo_kg')::numeric,0)=0 AND cfg->>'mission' IS NULL;
 INSERT INTO airport_passenger_pools(airport_icao,stock) SELECT icao,passenger_stock(icao) FROM airports WHERE icao IN(f.location_icao,p_destination) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM airport_passenger_pools WHERE airport_icao IN(f.location_icao,p_destination) ORDER BY airport_icao FOR UPDATE;
 q:=flight_quote_cargo(p_aircraft,p_destination);
 SELECT range_nm INTO rng FROM aircraft_types WHERE id=f.aircraft_type_id;
 IF ferry THEN
  IF (q->>'distance_nm')::numeric > rng THEN RAISE EXCEPTION 'Ferry flight exceeds aircraft range (% NM)', round(rng); END IF;
  q := q || jsonb_build_object('ferry',true,'passengers',0,'cargo_kg',0);
 ELSE
  IF (q->>'passengers')::int<=0 AND coalesce((q->>'cargo_kg')::numeric,0)<=0 THEN RAISE EXCEPTION 'No passengers or cargo available for this route'; END IF;
  lim := floor(rng * public.dispatch_usable_range_pct());
  IF (q->>'distance_nm')::numeric > lim THEN RAISE EXCEPTION 'Route exceeds usable payload range (% NM). Use an empty ferry flight for longer repositioning.', lim; END IF;
 END IF;
 IF company_balance(c.id)<(q->>'fuel_cost')::numeric+(q->>'landing_fee')::numeric+(q->>'handling_fee')::numeric+(q->>'maintenance')::numeric THEN RAISE EXCEPTION 'Insufficient operating reserve'; END IF;
 UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)-(q->>'passengers')::integer,updated_at=now(),last_departure_at=now() WHERE airport_icao=f.location_icao;
 INSERT INTO flights(company_id,aircraft_id,origin_icao,destination_icao,passengers,distance_nm,estimated_minutes,estimate,rules_snapshot) VALUES(c.id,f.id,f.location_icao,p_destination,(q->>'passengers')::int,(q->>'distance_nm')::numeric,(q->>'minutes')::numeric,q-'rules',q->'rules') RETURNING id INTO fid;
 IF NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN UPDATE flights SET execution_source='ACARS_AGENT' WHERE id=fid; END IF;
 UPDATE fleet_aircraft SET status='DISPATCHED' WHERE id=f.id; RETURN fid; END $function$;