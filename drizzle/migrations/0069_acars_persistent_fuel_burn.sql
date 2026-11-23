ALTER TABLE public.flights ADD COLUMN cumulative_fuel_used_gal numeric NOT NULL DEFAULT 0 CHECK (cumulative_fuel_used_gal >= 0), ADD COLUMN last_observed_fuel_gal numeric CHECK (last_observed_fuel_gal >= 0), ADD COLUMN fuel_tracking_started boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.flights.cumulative_fuel_used_gal IS 'Server-observed consumption for the current leg; reconnect never resets it.';
COMMENT ON COLUMN public.flights.fuel_tracking_started IS 'Latched after initial PREFLIGHT; reset only when dispatching a new continuation leg.';
-- Preserve the last trustworthy observation for flights already in progress.
UPDATE public.flights SET last_observed_fuel_gal=(telemetry->'live'->>'fuel_gal')::numeric,
 fuel_tracking_started=upper(coalesce(telemetry->'live'->>'phase',''))<>'PREFLIGHT',
 cumulative_fuel_used_gal=CASE WHEN upper(coalesce(telemetry->'live'->>'phase',''))<>'PREFLIGHT' THEN greatest(0,coalesce((estimate->>'target_fuel_gal')::numeric,(estimate->'weight_budget'->>'planned_fuel_gal')::numeric,0)-(telemetry->'live'->>'fuel_gal')::numeric) ELSE 0 END
WHERE status='EN_ROUTE' AND execution_source='ACARS_AGENT' AND jsonb_typeof(telemetry->'live'->'fuel_gal')='number' AND (telemetry->'live'->>'fuel_gal')::numeric>=0;

DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure);
 n:=replace(d,'cap numeric; BEGIN','cap numeric; cur_fuel numeric; tracking boolean; BEGIN');
 IF n=d THEN RAISE EXCEPTION 'acars_position declaration patch missing'; END IF; d:=n;
 n:=replace(d,'PERFORM public.ramp_fuel_adjust(f.id,p);', $p$
 IF jsonb_typeof(p->'fuel_gal') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Valid fuel observation required' USING ERRCODE='P0422'; END IF;
 cur_fuel:=(p->>'fuel_gal')::numeric;
 IF cur_fuel<0 OR cur_fuel::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid fuel observation' USING ERRCODE='P0422'; END IF;
 -- Before taxi the simulator menu is not a consumption meter. Once started,
 -- even a reconnect claiming PREFLIGHT/PARKED cannot reopen that exemption.
 IF NOT f.fuel_tracking_started THEN PERFORM public.ramp_fuel_adjust(f.id,p); END IF;
 $p$);
 IF n=d THEN RAISE EXCEPTION 'acars_position ramp gate patch missing'; END IF; d:=n;
 n:=replace(d,'IF prev IS NOT NULL AND prev ? ''received_at'' THEN', 'IF (prev IS NOT NULL AND prev ? ''received_at'') OR f.last_observed_fuel_gal IS NOT NULL THEN');
 IF n=d THEN RAISE EXCEPTION 'acars_position observation guard patch missing'; END IF; d:=n;
 n:=replace(d,$p$IF upper(coalesce(p->>'phase',''))<>ALL(ARRAY['PREFLIGHT','PARKED']) AND (p->>'fuel_gal')::numeric > (prev->>'fuel_gal')::numeric + greatest(2,cap*0.01) THEN$p$,
 $p$IF f.fuel_tracking_started AND cur_fuel > coalesce(f.last_observed_fuel_gal,(prev->>'fuel_gal')::numeric) + 2.0 THEN$p$);
 IF n=d THEN RAISE EXCEPTION 'acars_position refuel guard patch missing'; END IF; d:=n;
 d:=replace(d,$p$'tolerance_gal',greatest(2,cap*0.01)$p$,$p$'tolerance_gal',2.0$p$);
 d:=replace(d,$p$'previous_fuel_gal',(prev->>'fuel_gal')::numeric$p$,$p$'previous_fuel_gal',coalesce(f.last_observed_fuel_gal,(prev->>'fuel_gal')::numeric)$p$);
 n:=replace(d,$p$UPDATE flights SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','live',p||jsonb_build_object('received_at',now())) WHERE id=f.id;$p$,
 $p$tracking:=f.fuel_tracking_started OR upper(coalesce(p->>'phase',''))<>'PREFLIGHT';
 UPDATE flights SET cumulative_fuel_used_gal=f.cumulative_fuel_used_gal + CASE WHEN tracking THEN greatest(0,coalesce(f.last_observed_fuel_gal,cur_fuel)-cur_fuel) ELSE 0 END,
 last_observed_fuel_gal=cur_fuel,fuel_tracking_started=tracking,
 telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','live',p||jsonb_build_object('received_at',now())) WHERE id=f.id;$p$);
 IF n=d THEN RAISE EXCEPTION 'acars_position accumulation patch missing'; END IF; EXECUTE n;
 -- Settlement uses persisted observations, never caller-supplied accumulators.
 d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 n:=replace(d,$p$IF p_telemetry->>'landing_icao' IS NOT NULL$p$,$p$
 IF f.execution_source='ACARS_AGENT' THEN
 p_telemetry:=coalesce(p_telemetry,'{}'::jsonb)||jsonb_build_object('cumulative_fuel_used_gal',f.cumulative_fuel_used_gal,'final_fuel_gal',coalesce(f.last_observed_fuel_gal,(f.telemetry->'live'->>'fuel_gal')::numeric),'departure_target_fuel_gal',coalesce((f.estimate->>'target_fuel_gal')::numeric,(f.estimate->'weight_budget'->>'planned_fuel_gal')::numeric));
 END IF;
 IF p_telemetry->>'landing_icao' IS NOT NULL$p$);
 IF n=d THEN RAISE EXCEPTION 'settle_flight observed evidence patch missing'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.flight_fuel_billing(jsonb,text,jsonb)'::regprocedure);
 n:=replace(d,'billed:=greatest(actual,trip*floor_pct);',$p$
 actual:=greatest(actual,coalesce((p_telemetry->>'cumulative_fuel_used_gal')::numeric,0),
 CASE WHEN p_telemetry->>'final_fuel_gal' IS NOT NULL THEN greatest(0,coalesce((p_telemetry->>'departure_target_fuel_gal')::numeric,(q->>'target_fuel_gal')::numeric,(q->'weight_budget'->>'planned_fuel_gal')::numeric,0)-(p_telemetry->>'final_fuel_gal')::numeric) ELSE 0 END);
 billed:=greatest(actual,trip*floor_pct);$p$);
 IF n=d THEN RAISE EXCEPTION 'flight_fuel_billing balance patch missing'; END IF; EXECUTE n;
 -- Diverted legs were already consumed; the next leg starts its own counter.
 d:=pg_get_functiondef('public.divert_action(uuid,text,numeric)'::regprocedure);
 n:=replace(d,$p$status='DISPATCHED',origin_icao=a.location_icao$p$,$p$status='DISPATCHED',cumulative_fuel_used_gal=0,last_observed_fuel_gal=NULL,fuel_tracking_started=false,origin_icao=a.location_icao$p$);
 IF n=d THEN RAISE EXCEPTION 'divert_action new-leg reset patch missing'; END IF; EXECUTE n;
END $$;