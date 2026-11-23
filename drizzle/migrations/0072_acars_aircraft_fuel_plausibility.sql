-- Fuel plausibility is a heuristic, not simulator aircraft identity verification.
-- Preserve key validation, locking, cancellation refunds and per-leg resets.
DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure);
 n:=replace(d,'cur_fuel numeric;','cur_fuel numeric; min_safe numeric;');
 IF n=d THEN RAISE EXCEPTION 'Departure guard declarations missing'; END IF; d:=n;
 n:=replace(d,'IF NOT f.fuel_tracking_started THEN PERFORM public.ramp_fuel_adjust(f.id,p); END IF;',
 $patch$-- Check once at departure, never against remaining fuel during a reconnect.
 IF NOT gps_started AND NOT coalesce((f.telemetry->>'departure_fuel_checked')::boolean,false)
 AND upper(coalesce(p->>'phase','')) IN ('TAXI','TAXI_OUT','TAKEOFF','CLIMB','CRUISE','EN_ROUTE','DESCENT','APPROACH','LANDING') THEN
  min_safe:=(f.estimate->'weight_budget'->>'min_safe_fuel_gal')::numeric;
  -- Legacy flights without a frozen physical budget keep their original checks.
  IF min_safe IS NOT NULL AND min_safe>0 AND cur_fuel<min_safe*0.70 THEN
   RETURN public.acars_invalidate(f,'INSUFFICIENT_DEPARTURE_FUEL',jsonb_build_object('sim_fuel_gal',cur_fuel,'min_safe_fuel_gal',min_safe,'phase',p->>'phase'));
  END IF;
  UPDATE flights SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('departure_fuel_checked',true,'departure_observed_fuel_gal',cur_fuel) WHERE id=f.id;
 END IF;
 IF NOT f.fuel_tracking_started THEN PERFORM public.ramp_fuel_adjust(f.id,p); END IF;$patch$);
 IF n=d THEN RAISE EXCEPTION 'Departure guard insertion missing'; END IF;
 EXECUTE n;
 d:=pg_get_functiondef('public.acars_pirep(text,jsonb)'::regprocedure);
 n:=replace(d,'used numeric;','used numeric; raw_burn numeric;');
 IF n=d THEN RAISE EXCEPTION 'Burn guard declarations missing'; END IF; d:=n;
 n:=replace(d,'PERFORM set_config(''smoothsky.acars_settlement'',f.id::text,true);',
 $patch$-- Use raw burn before the billing floor; reconnect cannot erase server burn.
 raw_burn:=greatest(used,coalesce(f.cumulative_fuel_used_gal,0));
 IF hours>=0.6 AND raw_burn<burn*hours*0.35 THEN
  RETURN public.acars_invalidate(f,'IMPLAUSIBLE_LOW_FUEL_BURN',jsonb_build_object('actual_burn_gal',raw_burn,'flight_time_hours',hours,'catalogue_burn_gph',burn));
 END IF;
 PERFORM set_config('smoothsky.acars_settlement',f.id::text,true);$patch$);
 IF n=d THEN RAISE EXCEPTION 'Burn guard insertion missing'; END IF;
 EXECUTE n;
END $$;