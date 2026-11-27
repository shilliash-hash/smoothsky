-- CR-04 / Stage 4A. MANUAL PRODUCTION MIGRATION; not applied by the app.
-- Requires migrations through 0083. Run this entire file as one transaction.
-- Existing flight estimates/settlements, RPC signatures and JSON keys are preserved.
-- Index creation is transactional (not CONCURRENTLY); run during low traffic.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_flights_route_saturation
ON public.flights (origin_icao, destination_icao, created_at DESC)
INCLUDE (passengers)
WHERE status IN ('DISPATCHED', 'EN_ROUTE', 'COMPLETED')
  AND coalesce((estimate->>'ferry')::boolean, false) = false;

-- Only landed inbound traffic supplies feeder credit. Reservations cannot create it.
CREATE INDEX IF NOT EXISTS idx_flights_inbound_saturation
ON public.flights (destination_icao, created_at DESC)
INCLUDE (origin_icao, passengers)
WHERE status = 'COMPLETED'
  AND coalesce((estimate->>'ferry')::boolean, false) = false;

INSERT INTO public.economy_config (key, value, description) VALUES
 ('route_saturation_window_hours', '36', 'Global directional corridor rolling window in hours.'),
 ('route_saturation_decay_lambda', '0.45', 'PAX exponential decay per selected aircraft seat capacity; zero disables PAX saturation.'),
 ('route_saturation_cargo_decay_lambda', '0.45', 'Cargo exponential decay per selected aircraft catalogue cargo capacity; zero disables cargo saturation.'),
 ('route_saturation_feeder_credit_ratio', '0.50', 'Credit from completed X to origin arrivals, excluding the reverse corridor.'),
 ('route_saturation_pax_floor_pct', '0.25', 'Minimum PAX demand multiplier; does not create physical stock.'),
 ('route_saturation_cargo_floor_pct', '0.30', 'Minimum cargo demand multiplier; does not create physical stock.')
ON CONFLICT (key) DO NOTHING;

-- Validate tuning in SQL as well as the future Admin form. No changes to old keys.
DO $bounds$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.economy_config'::regclass AND conname='route_saturation_config_bounds') THEN
  ALTER TABLE public.economy_config ADD CONSTRAINT route_saturation_config_bounds CHECK (
   CASE WHEN key IN ('route_saturation_window_hours', 'route_saturation_decay_lambda',
     'route_saturation_cargo_decay_lambda', 'route_saturation_feeder_credit_ratio',
     'route_saturation_pax_floor_pct', 'route_saturation_cargo_floor_pct') THEN
    CASE WHEN jsonb_typeof(value)='number' THEN
     CASE WHEN key='route_saturation_window_hours' THEN
       (value #>> '{}')::numeric BETWEEN 1 AND 168 AND mod((value #>> '{}')::numeric,1)=0
      WHEN key IN ('route_saturation_decay_lambda','route_saturation_cargo_decay_lambda') THEN
       (value #>> '{}')::numeric BETWEEN 0 AND 5
      ELSE (value #>> '{}')::numeric BETWEEN 0 AND 1 END
    ELSE false END
   ELSE true END
  );
 END IF;
END $bounds$;

-- Internal aggregate only: no public route to worldwide private flight rows.
-- VOLATILE is intentional: after dispatch waits on FOR UPDATE, the aggregate must
-- use a fresh READ COMMITTED snapshot, including the prior dispatch's committed row.
CREATE OR REPLACE FUNCTION public.route_saturation(
 p_origin text, p_destination text, p_seats integer, p_cargo_capacity numeric,
 p_rules jsonb, p_apply boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
 window_hours numeric := coalesce((p_rules->>'route_saturation_window_hours')::numeric,36);
 pax_lambda numeric := coalesce((p_rules->>'route_saturation_decay_lambda')::numeric,0.45);
 cargo_lambda numeric := coalesce((p_rules->>'route_saturation_cargo_decay_lambda')::numeric,0.45);
 credit_ratio numeric := coalesce((p_rules->>'route_saturation_feeder_credit_ratio')::numeric,0.50);
 pax_floor numeric := coalesce((p_rules->>'route_saturation_pax_floor_pct')::numeric,0.25);
 cargo_floor numeric := coalesce((p_rules->>'route_saturation_cargo_floor_pct')::numeric,0.30);
 cutoff timestamptz;
 corridor_pax numeric := 0; corridor_cargo numeric := 0;
 inbound_pax numeric := 0; inbound_cargo numeric := 0;
 credit_pax numeric := 0; credit_cargo numeric := 0;
 excess_pax numeric := 0; excess_cargo numeric := 0;
 pax_factor numeric := 1; cargo_factor numeric := 1;
BEGIN
 cutoff := now()-make_interval(secs => (window_hours*3600)::double precision);
 IF p_apply THEN
  SELECT coalesce(sum(f.passengers),0), coalesce(sum(coalesce((f.estimate->>'cargo_kg')::numeric,0)),0)
  INTO corridor_pax,corridor_cargo
  FROM public.flights f
  WHERE f.origin_icao=p_origin AND f.destination_icao=p_destination
    AND f.status IN ('DISPATCHED','EN_ROUTE','COMPLETED') AND f.created_at>=cutoff
    AND coalesce((f.estimate->>'ferry')::boolean,false)=false;

  SELECT coalesce(sum(f.passengers),0), coalesce(sum(coalesce((f.estimate->>'cargo_kg')::numeric,0)),0)
  INTO inbound_pax,inbound_cargo
  FROM public.flights f
  WHERE f.destination_icao=p_origin AND f.origin_icao<>p_destination
    AND f.status='COMPLETED' AND f.created_at>=cutoff
    AND coalesce((f.estimate->>'ferry')::boolean,false)=false;

  credit_pax := inbound_pax*credit_ratio;
  credit_cargo := inbound_cargo*credit_ratio;
  -- Zero free allowance: an empty corridor has factor 1, one full prior load
  -- gives exp(-0.45)=0.637628..., two full prior loads exp(-0.90)=0.406570....
  excess_pax := greatest(0,corridor_pax-credit_pax);
  excess_cargo := greatest(0,corridor_cargo-credit_cargo);
  pax_factor := greatest(pax_floor,exp(-pax_lambda*excess_pax/greatest(1,p_seats)));
  cargo_factor := greatest(cargo_floor,exp(-cargo_lambda*excess_cargo/greatest(1,p_cargo_capacity)));
 END IF;
 RETURN jsonb_build_object('version',1,'applied',p_apply,'window_hours',window_hours,
  'pax',jsonb_build_object('factor',pax_factor,'corridor_flown',corridor_pax,
   'feeder_credit',credit_pax,'free_allowance',0,'effective_excess',excess_pax,
   'normalization_capacity',greatest(1,p_seats),'decay_lambda',pax_lambda,'floor_pct',pax_floor,
   'floor_reached',p_apply AND pax_factor<=pax_floor),
  'cargo',jsonb_build_object('factor',cargo_factor,'corridor_flown_kg',corridor_cargo,
   'feeder_credit_kg',credit_cargo,'free_allowance_kg',0,'effective_excess_kg',excess_cargo,
   'normalization_capacity_kg',greatest(1,p_cargo_capacity),'decay_lambda',cargo_lambda,'floor_pct',cargo_floor,
   'floor_reached',p_apply AND cargo_factor<=cargo_floor));
END $function$;
REVOKE ALL ON FUNCTION public.route_saturation(text,text,integer,numeric,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.route_saturation(text,text,integer,numeric,jsonb,boolean) TO service_role;

-- Surgical, fail-fast edits preserve all existing fuel/MTOW/FBO/custom rules.
-- Re-running this migration does not multiply saturation twice.
DO $patch$
DECLARE src text; anchor text;
BEGIN
 src:=pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
 IF position('public.route_saturation(' IN src)=0 THEN
  anchor:='raw_pax:=pax;';
  IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'CR04: passenger demand anchor missing'; END IF;
  src:=replace(src,anchor,$new$
  rules:=rules || jsonb_build_object('saturation',public.route_saturation(a.icao,b.icao,t.pax,t.cargo_kg,rules,
   NOT (coalesce(nullif(current_setting('smoothsky.cargo',true),'')::jsonb->>'all_cargo','false')::boolean
    AND coalesce((nullif(current_setting('smoothsky.cargo',true),'')::jsonb->>'cargo_kg')::numeric,0)=0)
   AND nullif(current_setting('smoothsky.cargo',true),'')::jsonb->>'mission' IS NULL));
  raw_pax:=pax;$new$);
  anchor:='pax:=round(raw_pax*dfac)::int;';
  IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'CR04: passenger multiplier anchor missing'; END IF;
  src:=replace(src,anchor,'pax:=round(raw_pax*dfac*(rules->''saturation''->''pax''->>''factor'')::numeric)::int;');
  anchor:='RETURN jsonb_build_object(';
  IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'CR04: baseline JSON anchor missing'; END IF;
  src:=replace(src,anchor,'RETURN jsonb_build_object(''saturation'',rules->''saturation'',');
  EXECUTE src;
 END IF;

 -- Cargo limits available supply, not the pilot's requested load. A request below
 -- the reduced cap remains exact; MTOW and physical stock still constrain it.
 src:=pg_get_functiondef('public.flight_quote_cargo(uuid,text)'::regprocedure);
 IF position('''saturation''->''cargo''' IN src)=0 THEN
  anchor:='kg := floor(least(want, cap, cargo_stock(f.location_icao),';
  IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'CR04: cargo/MTOW anchor missing'; END IF;
  src:=replace(src,anchor,'kg := floor(least(want, least(cap,cargo_stock(f.location_icao))*(q->''saturation''->''cargo''->>''factor'')::numeric,');
  EXECUTE src;
 END IF;

 -- Existing frontend optimizes locally from payload_limits: keep those limits
 -- authoritative too, otherwise auto-load/sliders would promise unavailable cargo.
 src:=pg_get_functiondef('public.flight_quote_loaded(uuid,text,integer,boolean,uuid,numeric,integer)'::regprocedure);
 IF position('''saturation''->''cargo''' IN src)=0 THEN
  anchor:='''max_cargo_kg'',floor(least(t.cargo_kg*CASE WHEN p_all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END,public.cargo_stock(f.location_icao)))';
  IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'CR04: cargo preview limit anchor missing'; END IF;
  src:=replace(src,anchor,
   '''max_cargo_kg'',floor(least(t.cargo_kg*CASE WHEN p_all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END,public.cargo_stock(f.location_icao))*(q->''saturation''->''cargo''->>''factor'')::numeric)');
  EXECUTE src;
 END IF;

 -- The final quote must remain after the ordered endpoint row locks. Do not add
 -- another lock with a different ordering (cargo wrapper already locks origin).
 src:=pg_get_functiondef('public.dispatch_flight(uuid,text)'::regprocedure);
 anchor:='PERFORM 1 FROM airport_passenger_pools WHERE airport_icao IN(f.location_icao,p_destination) ORDER BY airport_icao FOR UPDATE;';
 IF position(anchor IN src)=0 OR position('q:=flight_quote_cargo(p_aircraft,p_destination);' IN src)<position(anchor IN src) THEN
  RAISE EXCEPTION 'CR04: dispatch must lock endpoint pools before final quote';
 END IF;
END $patch$;

-- Best Deals / Alternatives already use the same full quote -> net path.
-- No new signature, public grants, settlement rewrite or historical backfill.
COMMIT;