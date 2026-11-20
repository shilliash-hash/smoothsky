CREATE OR REPLACE FUNCTION public.acars_connect(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid:=acars_pilot(p_key); f flights; n int; last_seen timestamptz;
BEGIN
SELECT count(*) INTO n FROM flights x JOIN companies c ON c.id=x.company_id WHERE (c.user_id=uid OR x.pilot_id=uid) AND x.status IN('DISPATCHED','EN_ROUTE');
SELECT x.* INTO f FROM flights x JOIN companies c ON c.id=x.company_id WHERE (c.user_id=uid OR x.pilot_id=uid) AND x.status IN('DISPATCHED','EN_ROUTE') ORDER BY (x.execution_source='ACARS_AGENT') DESC,x.created_at LIMIT 1;
IF NOT FOUND THEN RETURN jsonb_build_object('flight',NULL,'active_flights',0); END IF;
IF f.status='EN_ROUTE' AND f.execution_source='ACARS_AGENT' THEN
 last_seen:=coalesce((f.telemetry->'live'->>'received_at')::timestamptz,f.departed_at,f.created_at);
 IF now()>=last_seen+interval '30 minutes' THEN RAISE EXCEPTION 'ACARS resume window expired — use Cancel flight' USING ERRCODE='P0409'; END IF;
END IF;
RETURN jsonb_build_object('flight',acars_flight_json(f)||jsonb_build_object('telemetry',f.telemetry,'departed_at',f.departed_at,'resume_until',CASE WHEN f.status='EN_ROUTE' AND f.execution_source='ACARS_AGENT' THEN last_seen+interval '30 minutes' END),'active_flights',n);
END $function$;
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure) INTO definition;
 IF position('ACARS resume window expired' IN definition)=0 THEN
  definition:=replace(definition,'SELECT t.fuel_capacity_gal INTO cap', 'IF f.status=''EN_ROUTE'' AND f.execution_source=''ACARS_AGENT'' AND now()>=coalesce((f.telemetry->''live''->>''received_at'')::timestamptz,f.departed_at,f.created_at)+interval ''30 minutes'' THEN RAISE EXCEPTION ''ACARS resume window expired — use Cancel flight'' USING ERRCODE=''P0409''; END IF; SELECT t.fuel_capacity_gal INTO cap');
  EXECUTE definition;
 END IF;
END $guard$;