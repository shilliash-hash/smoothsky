-- Do not retroactively require GPS samples that were never collected on in-progress flights.
ALTER TABLE public.flights ADD COLUMN acars_tracking_required boolean NOT NULL DEFAULT true;
UPDATE public.flights SET acars_tracking_required=false WHERE status='EN_ROUTE' AND execution_source='ACARS_AGENT';
COMMENT ON COLUMN public.flights.acars_tracking_required IS 'Continuous GPS coverage applies to new flights and continuation legs; already airborne flights at rollout are exempt from coverage only.';
-- Server-owned GPS evidence stays in telemetry; client fields never overwrite it.
CREATE OR REPLACE FUNCTION public.acars_invalidate(f public.flights, reason text, evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_claims text; result_status text;
BEGIN
 IF f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RAISE EXCEPTION 'Flight is not active'; END IF;
 old_claims:=act_as((SELECT user_id FROM companies WHERE id=f.company_id));
 IF f.divert_state IS NOT NULL THEN
  PERFORM cancel_continuation(f); result_status:='DIVERTED';
 ELSE
  UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;
  IF coalesce((f.estimate->>'cargo_kg')::numeric,0)>0 AND NOT EXISTS(SELECT 1 FROM special_missions WHERE flight_id=f.id) THEN
   INSERT INTO airport_cargo_pools(airport_icao,cargo_pool_kg) VALUES(f.origin_icao,cargo_stock(f.origin_icao)) ON CONFLICT DO NOTHING;
   UPDATE airport_cargo_pools SET cargo_pool_kg=cargo_stock(airport_icao)+(f.estimate->>'cargo_kg')::numeric,updated_at=now() WHERE airport_icao=f.origin_icao;
  END IF;
  UPDATE flights SET status='CANCELLED' WHERE id=f.id;
  UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;
  result_status:='CANCELLED';
 END IF;
 UPDATE flights SET telemetry=coalesce(telemetry,'{}')||jsonb_build_object('cancellation_reason',reason,'cancelled_at',now(),'tracking_evidence',evidence) WHERE id=f.id;
 PERFORM set_config('request.jwt.claims',old_claims,true);
 RETURN jsonb_build_object('ok',false,'status',result_status,'reason',reason,'flight_id',f.id,'flight_number',f.flight_number);
END $$;
REVOKE ALL ON FUNCTION public.acars_invalidate(public.flights,text,jsonb) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.acars_connect(text)'::regprocedure);
 n:=replace(d,'''30 minutes''','''20 minutes''');
 IF n=d THEN RAISE EXCEPTION 'Connect resume patch missing'; END IF;
 -- Connecting never resets clocks/counters, but the next displacement is offline.
 n:=replace(n,'RETURN jsonb_build_object(''flight'',acars_flight_json(f)',
 'IF f.status=''EN_ROUTE'' AND f.execution_source=''ACARS_AGENT'' THEN UPDATE flights SET telemetry=coalesce(telemetry,''{}'')||jsonb_build_object(''gps_reconnect_pending'',true) WHERE id=f.id; END IF; RETURN jsonb_build_object(''flight'',acars_flight_json(f)');
 IF position('gps_reconnect_pending' IN n)=0 THEN RAISE EXCEPTION 'Connect continuity patch missing'; END IF;
 EXECUTE n;
 d:=pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure);
 n:=replace(d,'tracking boolean;','tracking boolean; gps_started boolean; cruise numeric; segment_limit numeric; tracked numeric; airborne_at timestamptz; speed_anchor timestamptz; speed_distance numeric; speed_secs numeric;');
 IF n=d THEN RAISE EXCEPTION 'GPS declarations missing'; END IF; d:=n;
 d:=replace(d,'''30 minutes''','''20 minutes''');
 n:=replace(d,'SELECT t.fuel_capacity_gal INTO cap','SELECT t.fuel_capacity_gal,t.cruise_kts INTO cap,cruise');
 IF n=d THEN RAISE EXCEPTION 'Cruise lookup missing'; END IF; d:=n;
 n:=replace(d,'IF (p->>''fuel_gal'')::numeric > cap*1.05 THEN',
 $patch$IF jsonb_typeof(p->'lat') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'lon') IS DISTINCT FROM 'number' OR abs((p->>'lat')::numeric)>90 OR abs((p->>'lon')::numeric)>180 THEN RAISE EXCEPTION 'Invalid GPS position' USING ERRCODE='P0422'; END IF;
 gps_started:=coalesce((f.telemetry->>'gps_tracking_started')::boolean,false);
 tracked:=coalesce((f.telemetry->>'tracked_distance_nm')::numeric,0);
 airborne_at:=(f.telemetry->>'gps_airborne_at')::timestamptz;
 speed_anchor:=(f.telemetry->>'gps_speed_anchor_at')::timestamptz;
 speed_distance:=coalesce((f.telemetry->>'gps_speed_distance_nm')::numeric,0);
 segment_limit:=least(740,greatest(220,cruise*1.60));
 IF (p->>'fuel_gal')::numeric > cap*1.05 THEN$patch$);
 IF n=d THEN RAISE EXCEPTION 'GPS initialization missing'; END IF; d:=n;
 n:=replace(d,'nm := 3440.065*2*asin(sqrt(power(sin(radians(((p->>''lat'')::numeric-(prev->>''lat'')::numeric)/2)),2)+cos(radians((prev->>''lat'')::numeric))*cos(radians((p->>''lat'')::numeric))*power(sin(radians(((p->>''lon'')::numeric-(prev->>''lon'')::numeric)/2)),2)));',
 'nm := airport_distance_nm((prev->>''lat'')::double precision,(prev->>''lon'')::double precision,(p->>''lat'')::double precision,(p->>''lon'')::double precision);');
 IF n=d THEN RAISE EXCEPTION 'Geodesic patch missing'; END IF; d:=n;
 n:=replace(d,'IF nm/(secs/3600.0) > 800 AND nm > 5 THEN RAISE EXCEPTION ''Implausible position jump'' USING ERRCODE=''P0422''; END IF;',
 $patch$IF gps_started THEN
  IF nm>greatest(80,coalesce(f.distance_nm,(f.estimate->>'distance_nm')::numeric,0)*0.35) THEN
   RETURN acars_invalidate(f,'TELEMETRY_GAP_EXCEEDED',jsonb_build_object('delta_nm',nm,'elapsed_seconds',secs));
  END IF;
  IF secs>=10 AND nm/(secs/3600.0)>segment_limit THEN
   RETURN acars_invalidate(f,'TIME_ACCELERATION_DETECTED',jsonb_build_object('delta_nm',nm,'elapsed_seconds',secs,'speed_kt',nm/(secs/3600.0),'limit_kt',segment_limit));
  END IF;
  -- Packets may arrive every 3 seconds: aggregate a >=10s server-time window,
  -- rather than accidentally exempting the normal fast reporting cadence.
  speed_anchor:=coalesce(speed_anchor,(prev->>'received_at')::timestamptz);
  speed_distance:=speed_distance+coalesce(nm,0);
  speed_secs:=extract(epoch FROM now()-speed_anchor);
  IF speed_secs>=10 THEN
   IF speed_distance/(speed_secs/3600.0)>segment_limit THEN
    RETURN acars_invalidate(f,'TIME_ACCELERATION_DETECTED',jsonb_build_object('delta_nm',speed_distance,'elapsed_seconds',speed_secs,'limit_kt',segment_limit));
   END IF;
   speed_anchor:=now(); speed_distance:=0;
  END IF;
  IF secs<=120 AND nm<=20 AND NOT coalesce((f.telemetry->>'gps_reconnect_pending')::boolean,false) THEN tracked:=tracked+coalesce(nm,0); END IF;
 END IF;$patch$);
 IF n=d THEN RAISE EXCEPTION 'GPS guard patch missing'; END IF; d:=n;
 n:=replace(d,'tracking:=f.fuel_tracking_started OR',
 $patch$IF NOT gps_started AND upper(coalesce(p->>'phase','')) IN ('TAKEOFF','CLIMB','CRUISE','EN_ROUTE','DESCENT','APPROACH','LANDING') THEN gps_started:=true; airborne_at:=now(); speed_anchor:=now(); speed_distance:=0; END IF;
 tracking:=f.fuel_tracking_started OR$patch$);
 IF n=d THEN RAISE EXCEPTION 'Takeoff latch patch missing'; END IF; d:=n;
 n:=replace(d,'jsonb_build_object(''schema_version'',1,''source'',''ACARS_AGENT'',''live'',p||jsonb_build_object(''received_at'',now()))',
 'jsonb_build_object(''schema_version'',1,''source'',''ACARS_AGENT'',''tracked_distance_nm'',tracked,''gps_tracking_started'',gps_started,''gps_airborne_at'',airborne_at,''gps_reconnect_pending'',false,''gps_speed_anchor_at'',speed_anchor,''gps_speed_distance_nm'',speed_distance,''live'',p||jsonb_build_object(''received_at'',now()))');
 IF n=d THEN RAISE EXCEPTION 'GPS telemetry patch missing'; END IF;
 EXECUTE n;
 d:=pg_get_functiondef('public.acars_pirep(text,jsonb)'::regprocedure);
 n:=replace(d,'used numeric;','used numeric; cruise numeric; base_distance numeric; real_hours numeric; mean_limit numeric; o airports;');
 IF n=d THEN RAISE EXCEPTION 'PIREP declarations missing'; END IF; d:=n;
 n:=replace(d,'SELECT t.fuel_burn_gph,t.fuel_capacity_gal INTO burn,cap','SELECT t.fuel_burn_gph,t.fuel_capacity_gal,t.cruise_kts INTO burn,cap,cruise');
 IF n=d THEN RAISE EXCEPTION 'PIREP cruise lookup missing'; END IF; d:=n;
 n:=replace(d,'landed:=b.icao;',
 $patch$landed:=b.icao;
 SELECT * INTO o FROM airports WHERE icao=f.origin_icao;
 base_distance:=airport_distance_nm(o.lat,o.lon,b.lat,b.lon);
 IF base_distance IS NULL THEN RAISE EXCEPTION 'Invalid route reference'; END IF;
 real_hours:=extract(epoch FROM now()-coalesce((f.telemetry->>'gps_airborne_at')::timestamptz,f.departed_at))/3600;
 mean_limit:=least(720,greatest(200,cruise*1.50));
 IF real_hours IS NULL OR real_hours<=0 OR base_distance/real_hours>mean_limit THEN
  RETURN acars_invalidate(f,'TIME_ACCELERATION_DETECTED',jsonb_build_object('distance_nm',base_distance,'real_hours',real_hours,'limit_kt',mean_limit));
 END IF;
 IF f.acars_tracking_required AND base_distance>30 AND coalesce((f.telemetry->>'tracked_distance_nm')::numeric,0)+0.000001<base_distance*0.80 THEN
  RAISE EXCEPTION 'Flight rejected: insufficient continuous ACARS tracking coverage' USING ERRCODE='P0422';
 END IF;$patch$);
 IF n=d THEN RAISE EXCEPTION 'PIREP coverage patch missing'; END IF;
 EXECUTE n;
 d:=pg_get_functiondef('public.divert_action(uuid,text,numeric)'::regprocedure);
 n:=replace(d,'cumulative_fuel_used_gal=0,','acars_tracking_required=true,cumulative_fuel_used_gal=0,');
 IF n=d THEN RAISE EXCEPTION 'Continuation tracking reset missing'; END IF;
 EXECUTE n;
END $$;