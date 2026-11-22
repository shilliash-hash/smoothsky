ALTER TABLE public.flights ADD COLUMN IF NOT EXISTS divert_state jsonb;
COMMENT ON COLUMN public.flights.divert_state IS 'Frozen contract, landed leg history and pending continuation snapshot; never pauses mission deadline.';
ALTER TABLE public.flights DROP CONSTRAINT flights_status_check;
ALTER TABLE public.flights ADD CONSTRAINT flights_status_check CHECK(status IN ('DISPATCHED','EN_ROUTE','COMPLETED','CANCELLED','DIVERTED','ABANDONED'));

CREATE OR REPLACE FUNCTION public.divert_leg_quote(f public.flights, dest text, target numeric DEFAULT NULL, landing_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a fleet_aircraft; t aircraft_types; b airports; o airports; contract jsonb; wb jsonb; q jsonb; nm numeric; mins numeric; trip numeric; price numeric; fee numeric; fd numeric:=0; ld numeric:=0; prior numeric:=0; payload numeric; fuel_target numeric;
BEGIN
 SELECT * INTO a FROM fleet_aircraft WHERE id=f.aircraft_id;
 SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
 SELECT * INTO o FROM airports WHERE icao=CASE WHEN landing_only THEN f.origin_icao ELSE a.location_icao END;
 SELECT * INTO b FROM airports WHERE icao=dest;
 IF b.icao IS NULL OR o.icao IS NULL OR b.icao=o.icao THEN RAISE EXCEPTION 'Choose a known, different airport'; END IF;
 IF b.longest_runway_ft IS NULL OR b.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Alternate runway is unknown or too short'; END IF;
 IF runway_is_unpaved(b.runway_surface,b.size,b.longest_runway_ft) AND NOT t.unpaved_capable THEN RAISE EXCEPTION 'Alternate runway surface is unsuitable'; END IF;
 contract:=coalesce(f.divert_state->'contract',f.estimate);
 nm:=airport_distance_nm(o.lat,o.lon,b.lat,b.lon); mins:=nm/t.cruise_kts*60; trip:=nm/t.cruise_kts*t.fuel_burn_gph;
 IF landing_only THEN
  wb:=f.estimate->'weight_budget';
  price:=(f.estimate->>'fuel_price_per_gal')::numeric;
  fd:=coalesce((f.estimate->'fob_discounts'->>'fuel')::numeric,0);
 ELSE
  IF a.ownership='LEASED' AND NOT EXISTS(SELECT 1 FROM lease_contracts WHERE aircraft_id=a.id AND now()>=starts_at AND now()<ends_at) THEN RAISE EXCEPTION 'Lease expired — renew before continuation'; END IF;
  IF target IS NOT NULL AND (target<0 OR target::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid target fuel'; END IF;
  fuel_target:=CASE WHEN a.ownership='RENTAL' THEN 0 ELSE greatest(a.current_fuel_gal,coalesce(target,0)) END;
  PERFORM set_config('smoothsky.target_fuel',fuel_target::text,true);
  wb:=flight_weight_budget(t.id,nm);
  PERFORM set_config('smoothsky.target_fuel','',true);
  wb:=wb||jsonb_build_object('passenger_weight_kg',coalesce((contract->'weight_budget'->>'passenger_weight_kg')::numeric,80));
  payload:=f.passengers*(wb->>'passenger_weight_kg')::numeric+coalesce((contract->>'cargo_kg')::numeric,0);
  IF payload>(wb->>'available_payload_kg')::numeric THEN RAISE EXCEPTION 'Locked payload exceeds MTOW with continuation fuel'; END IF;
  price:=economy_number(CASE WHEN t.fuel_type='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END);
  IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=f.company_id AND airport_icao=o.icao AND closed_at IS NULL AND has_fuel_contract) THEN fd:=economy_number_or('fob_fuel_discount',0.2); END IF;
 END IF;
 IF wb IS NULL THEN RAISE EXCEPTION 'This historical flight has no weight-budget snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=f.company_id AND airport_icao=b.icao AND closed_at IS NULL AND has_handling_desk) THEN ld:=economy_number_or('fob_handling_discount',0.2); END IF;
 fee:=round(t.mtow_kg/1000*coalesce((contract->'weight_budget'->>'landing_fee_per_ton_mtow')::numeric,2.5)*(contract->'rules'->'airport_fee_multipliers'->>(b.size-1))::numeric*(1-ld),2);
 IF fee IS NULL THEN RAISE EXCEPTION 'Landing fee configuration missing'; END IF;
 IF NOT landing_only THEN
  IF contract->>'mission_category'='MEDEVAC' THEN fee:=0;
  ELSIF coalesce((contract->>'all_cargo')::boolean,false) THEN fee:=round(fee*(1-(SELECT cargo_airport_fee_discount FROM operating_rules WHERE singleton)),2); END IF;
 END IF;
 SELECT coalesce(sum((x->>'fuel_cost')::numeric+(x->>'landing_fee')::numeric),0) INTO prior FROM jsonb_array_elements(coalesce(f.divert_state->'legs','[]')) x;
 q:=contract-'fuel_uplift_gal'-'fuel_uplift_cost'-'fuel_reserved_gal'-'initial_fuel_gal'-'target_fuel_gal'-'tank';
 q:=q||jsonb_build_object('distance_nm',round(nm,2),'minutes',round(mins,2),'fuel_gal',trip,'fuel_cost',round(trip*price*(1-fd),2),'fuel_price_per_gal',price,'landing_fee',fee,'weight_budget',wb||jsonb_build_object('trip_fuel_gal',trip),'fob_discounts',coalesce(contract->'fob_discounts','{}')||jsonb_build_object('fuel',fd,'landing',ld),'net',(contract->>'revenue')::numeric-round(trip*price*(1-fd),2)-fee-coalesce((contract->>'handling_fee')::numeric,0)-coalesce((contract->>'maintenance')::numeric,0)-prior);
 IF NOT landing_only THEN
  q:=finalize_flight_weight(q);
  q:=flight_tank_plan(q,a.current_fuel_gal,a.ownership<>'RENTAL');
  IF airport_fuel_stock(o.icao,t.fuel_type)<(CASE WHEN a.ownership='RENTAL' THEN trip ELSE (q->'tank'->>'added_fuel_gal')::numeric END) THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF;
 END IF;
 RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public.record_divert(f public.flights, dest text, evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a fleet_aircraft; q jsonb; state jsonb; leg jsonb; fuel numeric; target numeric; remaining numeric; mins numeric;
BEGIN
 q:=divert_leg_quote(f,dest,NULL,true);
 q:=flight_fuel_billing(q,f.execution_source,evidence);
 SELECT * INTO a FROM fleet_aircraft WHERE id=f.aircraft_id FOR UPDATE;
 target:=coalesce((f.estimate->>'target_fuel_gal')::numeric,(f.estimate->'weight_budget'->>'planned_fuel_gal')::numeric);
 fuel:=(q->>'billed_fuel_gal')::numeric;
 IF fuel>target+0.01 THEN RAISE EXCEPTION 'Reported burn exceeds departure fuel'; END IF;
 remaining:=greatest(0,target-fuel);
 state:=coalesce(f.divert_state,jsonb_build_object('contract',f.estimate,'original_origin',f.origin_icao,'legs','[]'::jsonb,'deadline_at',(SELECT deadline_at FROM special_missions WHERE flight_id=f.id AND status='ACCEPTED')));
 mins:=CASE WHEN f.execution_source='ACARS_AGENT' THEN (evidence->'pirep'->>'flight_time_hours')::numeric*60 ELSE (q->>'minutes')::numeric END;
 leg:=jsonb_build_object('origin',f.origin_icao,'destination',dest,'landed_at',now(),'minutes',mins,'distance_nm',q->'distance_nm','fuel_cost',q->'fuel_cost','fuel_used_gal',fuel,'landing_fee',q->'landing_fee','remaining_fuel_gal',remaining,'source',f.execution_source);
 state:=(state-'pending_quote')||jsonb_build_object('legs',(state->'legs')||jsonb_build_array(leg),'airport',dest);
 IF a.ownership='RENTAL' THEN
  IF (q->>'fuel_cost')::numeric>0 THEN PERFORM company_post(f.company_id,'FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-(q->>'fuel_cost')::numeric,'Divert fuel – '||f.flight_number||' · '||a.registration||' · '||f.origin_icao||' → '||dest,f.id::text,'flight:'||f.id||':divert:'||jsonb_array_length(state->'legs')||':FUEL'); END IF;
 END IF;
 IF (q->>'landing_fee')::numeric>0 THEN PERFORM company_post(f.company_id,'AIRPORT_FEES','AIRPORT_EXPENSE','COMPANY_CASH',-(q->>'landing_fee')::numeric,'Divert landing – '||f.flight_number||' · '||a.registration||' · '||dest,f.id::text,'flight:'||f.id||':divert:'||jsonb_array_length(state->'legs')||':LANDING'); END IF;
 UPDATE fleet_aircraft SET status='DIVERTED',location_icao=dest,current_fuel_gal=CASE WHEN ownership='RENTAL' THEN 0 ELSE remaining END,airframe_hours=airframe_hours+mins/60 WHERE id=f.aircraft_id;
 UPDATE flights SET status='DIVERTED',divert_state=state,telemetry=coalesce(telemetry,'{}')||evidence||jsonb_build_object('landed_icao',dest),route_waypoints=NULL WHERE id=f.id;
 RETURN jsonb_build_object('status','DIVERTED','flight_id',f.id,'airport',dest,'remaining_fuel_gal',remaining,'landing_fee',q->'landing_fee','revenue',0);
END $$;

CREATE OR REPLACE FUNCTION public.divert_action(p_flight uuid,p_action text,p_target_fuel_gal numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f flights; c companies; a fleet_aircraft; t aircraft_types; uid uuid:=auth.uid(); old text; q jsonb; needed numeric; cost numeric; stock numeric; state jsonb; total numeric;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT co.* INTO c FROM companies co JOIN flights fl ON fl.company_id=co.id WHERE fl.id=p_flight AND (co.user_id=uid OR fl.pilot_id=uid) FOR UPDATE OF co;
 IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF;
 SELECT * INTO f FROM flights WHERE id=p_flight FOR UPDATE;
 SELECT * INTO a FROM fleet_aircraft WHERE id=f.aircraft_id FOR UPDATE;
 IF f.status='ABANDONED' AND p_action='abandon' THEN RETURN f.settlement; END IF;
 IF f.status<>'DIVERTED' THEN RAISE EXCEPTION 'Flight must be diverted'; END IF;
 old:=act_as(c.user_id);
 IF p_action IN ('quote','continue') THEN
  q:=divert_leg_quote(f,f.destination_icao,p_target_fuel_gal,false);
  IF p_action='quote' THEN PERFORM set_config('request.jwt.claims',old,true); RETURN q; END IF;
  SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
  needed:=CASE WHEN a.ownership='RENTAL' THEN (q->>'fuel_gal')::numeric ELSE round((q->'tank'->>'added_fuel_gal')::numeric,4) END;
  cost:=CASE WHEN a.ownership='RENTAL' THEN 0 ELSE (q->'tank'->>'uplift_cost')::numeric END;
  IF company_balance(c.id)<cost THEN RAISE EXCEPTION 'Insufficient funds for continuation fuel'; END IF;
  INSERT INTO airport_fuel_pools(airport_icao,fuel_type,stock_gal) VALUES(a.location_icao,t.fuel_type,airport_fuel_stock(a.location_icao,t.fuel_type)) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM airport_fuel_pools WHERE airport_icao=a.location_icao AND fuel_type=t.fuel_type FOR UPDATE;
  stock:=airport_fuel_stock(a.location_icao,t.fuel_type);
  IF stock<needed THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF;
  UPDATE airport_fuel_pools SET stock_gal=stock-needed,updated_at=now() WHERE airport_icao=a.location_icao AND fuel_type=t.fuel_type;
  state:=f.divert_state||jsonb_build_object('pending_quote',f.estimate);
  q:=q||jsonb_build_object('fuel_type',t.fuel_type,'fuel_reserved_gal',needed);
  IF a.ownership<>'RENTAL' THEN
   q:=q||jsonb_build_object('initial_fuel_gal',a.current_fuel_gal,'target_fuel_gal',q->'tank'->'target_fuel_gal','fuel_uplift_gal',needed,'fuel_uplift_cost',cost,'fuel_uplift_price_per_gal',q->'tank'->'fuel_price_effective_per_gal');
   IF cost>0 THEN PERFORM company_post(c.id,'FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-cost,'Continuation fuel uplift – '||f.flight_number||' · '||a.registration||' · '||a.location_icao,f.id::text,'flight:'||f.id||':continuation:'||gen_random_uuid()||':UPLIFT'); END IF;
  END IF;
  UPDATE flights SET status='DISPATCHED',origin_icao=a.location_icao,estimate=q,divert_state=state,departed_at=NULL,telemetry=NULL,estimated_minutes=(q->>'minutes')::numeric,distance_nm=(q->>'distance_nm')::numeric,route_waypoints=NULL WHERE id=f.id;
  UPDATE fleet_aircraft SET status='DISPATCHED' WHERE id=a.id;
  PERFORM set_config('request.jwt.claims',old,true);
  RETURN jsonb_build_object('status','DISPATCHED','flight_id',f.id);
 ELSIF p_action='abandon' THEN
  SELECT coalesce(sum((x->>'fuel_cost')::numeric+(x->>'landing_fee')::numeric),0) INTO total FROM jsonb_array_elements(f.divert_state->'legs') x;
  q:=jsonb_build_object('revenue',0,'net',-total,'status','ABANDONED','airport',a.location_icao,'legs',f.divert_state->'legs');
  UPDATE special_missions SET status='EXPIRED',completed_at=now(),final_payout=0,delivered_late=false WHERE flight_id=f.id AND status='ACCEPTED';
  UPDATE flights SET status='ABANDONED',completed_at=now(),settlement=q WHERE id=f.id;
  UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL WHERE id=a.id;
  PERFORM set_config('request.jwt.claims',old,true); RETURN q;
 END IF;
 RAISE EXCEPTION 'Unknown divert action';
END $$;

CREATE OR REPLACE FUNCTION public.cancel_continuation(f public.flights) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost numeric:=coalesce((f.estimate->>'fuel_uplift_cost')::numeric,0); fuel text:=f.estimate->>'fuel_type'; amount numeric:=coalesce((f.estimate->>'fuel_reserved_gal')::numeric,0);
BEGIN
 IF f.divert_state IS NULL OR f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RAISE EXCEPTION 'No pending continuation'; END IF;
 PERFORM 1 FROM airport_fuel_pools WHERE airport_icao=f.origin_icao AND fuel_type=fuel FOR UPDATE;
 UPDATE airport_fuel_pools SET stock_gal=least(airport_fuel_capacity(f.origin_icao,fuel),airport_fuel_stock(f.origin_icao,fuel)+amount),updated_at=now() WHERE airport_icao=f.origin_icao AND fuel_type=fuel;
 IF cost>0 THEN PERFORM company_post(f.company_id,'FUEL_REFUND','COMPANY_CASH','FUEL_EXPENSE',cost,'Continuation fuel refund – '||f.flight_number||' · '||f.origin_icao,f.id::text,'flight:'||f.id||':continuation:'||gen_random_uuid()||':REFUND'); END IF;
 UPDATE flights SET status='DIVERTED',estimate=divert_state->'pending_quote',divert_state=divert_state-'pending_quote',telemetry=NULL,departed_at=NULL WHERE id=f.id;
 UPDATE fleet_aircraft SET status='DIVERTED',location_icao=f.origin_icao WHERE id=f.aircraft_id;
END $$;

CREATE OR REPLACE FUNCTION public.test_divert(p_flight uuid,p_airport text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN settle_flight(p_flight,jsonb_build_object('landing_icao',upper(p_airport))); END $$;

DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 n:=replace(d,'q:=public.flight_fuel_billing(f.estimate,f.execution_source,p_telemetry);',
 $patch$IF p_telemetry->>'landing_icao' IS NOT NULL AND p_telemetry->>'landing_icao'<>f.destination_icao THEN RETURN record_divert(f,p_telemetry->>'landing_icao',p_telemetry); END IF; q:=public.flight_fuel_billing(f.estimate,f.execution_source,p_telemetry);
 IF f.divert_state IS NOT NULL THEN
 q:=q||jsonb_build_object('legs',f.divert_state->'legs','minutes',(q->>'minutes')::numeric+(SELECT coalesce(sum((x->>'minutes')::numeric),0) FROM jsonb_array_elements(f.divert_state->'legs') x),'distance_nm',(q->>'distance_nm')::numeric+(SELECT coalesce(sum((x->>'distance_nm')::numeric),0) FROM jsonb_array_elements(f.divert_state->'legs') x));
 END IF;$patch$);
 IF n=d THEN RAISE EXCEPTION 'Settlement divert patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.accrue_airframe_hours()'::regprocedure);
 n:=replace(d,'coalesce((NEW.settlement->>''minutes'')::numeric, NEW.estimated_minutes)/60','(coalesce((NEW.settlement->>''minutes'')::numeric, NEW.estimated_minutes)-coalesce((SELECT sum((x->>''minutes'')::numeric) FROM jsonb_array_elements(NEW.divert_state->''legs'') x),0))/60');
 IF n=d THEN RAISE EXCEPTION 'Hours divert patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.cancel_test_flight(uuid)'::regprocedure);
 n:=replace(d,'UPDATE airport_passenger_pools SET','IF f.divert_state IS NOT NULL THEN PERFORM cancel_continuation(f); RETURN; END IF; UPDATE airport_passenger_pools SET');
 IF n=d THEN RAISE EXCEPTION 'Cancel divert patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure);
 n:=replace(d,'SELECT id INTO cid FROM companies WHERE user_id=uid FOR UPDATE;', 'SELECT c.id INTO cid FROM companies c WHERE c.id IN (SELECT company_id FROM flights WHERE pilot_id=uid AND status IN (''DISPATCHED'',''EN_ROUTE'') UNION SELECT company_id FROM flights WHERE status IN (''DISPATCHED'',''EN_ROUTE'') AND company_id IN (SELECT id FROM companies WHERE user_id=uid)) ORDER BY c.id LIMIT 1 FOR UPDATE;');
 n:=replace(n,'UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;', 'IF f.divert_state IS NOT NULL THEN PERFORM set_config(''request.jwt.claims'',jsonb_build_object(''sub'',(SELECT user_id FROM companies WHERE id=f.company_id),''role'',''authenticated'')::text,true); PERFORM cancel_continuation(f); RETURN jsonb_build_object(''ok'',false,''status'',''DIVERTED'',''reason'',''ILLEGAL_REFUEL_IN_FLIGHT'',''flight_id'',f.id); END IF; UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;');
 n:=replace(n,'WHERE company_id=cid AND status=', 'WHERE company_id=cid AND (pilot_id=uid OR company_id IN (SELECT id FROM companies WHERE user_id=uid)) AND status=');
 n:=replace(n,'WHERE company_id=cid AND status IN', 'WHERE company_id=cid AND (pilot_id=uid OR company_id IN (SELECT id FROM companies WHERE user_id=uid)) AND status IN');
 n:=replace(n,'prev := f.telemetry->''live'';', 'PERFORM set_config(''request.jwt.claims'',jsonb_build_object(''sub'',(SELECT user_id FROM companies WHERE id=f.company_id),''role'',''authenticated'')::text,true); prev := f.telemetry->''live'';');
 IF n=d THEN RAISE EXCEPTION 'ACARS continuation cancel patch failed'; END IF; EXECUTE n;
END $$;

CREATE OR REPLACE FUNCTION public.acars_pirep(p_key text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=acars_pilot(p_key); f flights; burn numeric; cap numeric; wall numeric; live jsonb; b airports; landed text; gps_lat double precision; gps_lon double precision; hours numeric; used numeric;
BEGIN
 PERFORM 1 FROM companies c WHERE c.id IN (SELECT company_id FROM flights WHERE pilot_id=uid AND status='EN_ROUTE' UNION SELECT id FROM companies WHERE user_id=uid) ORDER BY c.id FOR UPDATE;
 SELECT x.* INTO f FROM flights x JOIN companies c ON c.id=x.company_id WHERE (c.user_id=uid OR x.pilot_id=uid) AND x.status='EN_ROUTE' AND x.execution_source='ACARS_AGENT' FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'No ACARS flight en route or PIREP already received' USING ERRCODE='P0409'; END IF;
 SELECT t.fuel_burn_gph,t.fuel_capacity_gal INTO burn,cap FROM fleet_aircraft a JOIN aircraft_types t ON t.id=a.aircraft_type_id WHERE a.id=f.aircraft_id;
 hours:=(p->>'flight_time_hours')::numeric; used:=(p->>'fuel_used_gal')::numeric;
 IF hours IS NULL OR used IS NULL OR hours<0 OR used<0 OR hours::text IN ('NaN','Infinity','-Infinity') OR used::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid PIREP values'; END IF;
 wall:=extract(epoch FROM now()-f.departed_at)/3600;
 IF hours>wall+0.25 THEN RAISE EXCEPTION 'Implausible flight time: longer than time since departure' USING ERRCODE='P0422'; END IF;
 IF used>cap*1.05 OR used>burn*greatest(hours,0.1)*2.5+20 THEN RAISE EXCEPTION 'Implausible fuel used for this flight time' USING ERRCODE='P0422'; END IF;
 live:=f.telemetry->'live';
 IF live IS NULL OR coalesce(live->>'phase','') NOT IN ('LANDING','TAXI_IN','PARKED') OR coalesce((live->>'ground_speed_kt')::numeric,999)>60 OR (live->>'received_at')::timestamptz IS NULL OR now()-(live->>'received_at')::timestamptz>interval '2 minutes' THEN RAISE EXCEPTION 'Fresh landing position required before PIREP' USING ERRCODE='P0422'; END IF;
 gps_lat:=(live->>'lat')::double precision; gps_lon:=(live->>'lon')::double precision;
 IF gps_lat IS NULL OR gps_lon IS NULL OR abs(gps_lat)>90 OR abs(gps_lon)>180 THEN RAISE EXCEPTION 'Invalid landing position'; END IF;
 SELECT * INTO b FROM airports WHERE icao=f.destination_icao AND airport_distance_nm(gps_lat,gps_lon,airports.lat,airports.lon)<=3;
 IF NOT FOUND THEN SELECT * INTO b FROM airports WHERE airports.lat BETWEEN gps_lat-0.06 AND gps_lat+0.06 AND airport_distance_nm(gps_lat,gps_lon,airports.lat,airports.lon)<=3 ORDER BY airport_distance_nm(gps_lat,gps_lon,airports.lat,airports.lon),icao LIMIT 1; END IF;
 IF b.icao IS NULL THEN RAISE EXCEPTION 'Landing position is not near a known airport' USING ERRCODE='P0422'; END IF;
 landed:=b.icao;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT user_id FROM companies WHERE id=f.company_id),'role','authenticated')::text,true);
 PERFORM set_config('smoothsky.acars_settlement',f.id::text,true);
 RETURN settle_flight(f.id,jsonb_build_object('landing_icao',landed,'pirep',p||jsonb_build_object('received_at',now()),'fuel_used_gal',p->'fuel_used_gal','landing_rate_fpm',p->'landing_rate_fpm'));
END $$;
REVOKE ALL ON FUNCTION public.divert_leg_quote(public.flights,text,numeric,boolean),public.record_divert(public.flights,text,jsonb),public.cancel_continuation(public.flights) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.divert_action(uuid,text,numeric),public.test_divert(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.divert_action(uuid,text,numeric),public.test_divert(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acars_pirep(text,jsonb) TO anon,authenticated;

DO $$ DECLARE d text; n text; BEGIN
 IF to_regprocedure('public.pilot_operations()') IS NOT NULL THEN
  d:=pg_get_functiondef('public.pilot_operations()'::regprocedure);
  n:=replace(d,'''origin_icao'',f.origin_icao,''destination_icao'',f.destination_icao', '''divert_state'',f.divert_state,''origin_icao'',f.origin_icao,''destination_icao'',f.destination_icao');
  IF n=d THEN RAISE EXCEPTION 'Pilot operations divert projection patch failed'; END IF; EXECUTE n;
 END IF;
 IF to_regprocedure('public.admin_cancel_cleanup_flights(uuid[])') IS NOT NULL THEN
  d:=pg_get_functiondef('public.admin_cancel_cleanup_flights(uuid[])'::regprocedure);
  n:=replace(d,'''DISPATCHED'',''EN_ROUTE''','''DISPATCHED'',''EN_ROUTE'',''DIVERTED''');
  n:=replace(n,'UPDATE public.airport_passenger_pools SET', 'IF f.divert_state IS NOT NULL THEN IF f.status<>''DIVERTED'' THEN PERFORM public.cancel_continuation(f); END IF; PERFORM public.divert_action(f.id,''abandon'',NULL); PERFORM set_config(''request.jwt.claims'',old_claims,true); CONTINUE; END IF; UPDATE public.airport_passenger_pools SET');
  IF n=d THEN RAISE EXCEPTION 'Admin cleanup divert patch failed'; END IF; EXECUTE n;
 END IF;
END $$;