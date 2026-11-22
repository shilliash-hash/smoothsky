CREATE OR REPLACE FUNCTION public.acars_position(p_key text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE uid uuid:=acars_pilot(p_key); cid uuid; f flights; n int; last timestamptz; prev jsonb; secs numeric; nm numeric; cap numeric; BEGIN
SELECT last_position_at INTO last FROM profiles WHERE id=uid FOR UPDATE;
IF last IS NOT NULL AND now()-last < interval '3 seconds' THEN RAISE EXCEPTION 'Rate limit: max 1 position report per 3 seconds' USING ERRCODE='P0429'; END IF;
UPDATE profiles SET last_position_at=now() WHERE id=uid;
SELECT id INTO cid FROM companies WHERE user_id=uid FOR UPDATE; IF cid IS NULL THEN RAISE EXCEPTION 'No company'; END IF;
SELECT * INTO f FROM flights WHERE company_id=cid AND status='EN_ROUTE' AND execution_source='ACARS_AGENT' FOR UPDATE;
IF NOT FOUND THEN
  SELECT count(*) INTO n FROM flights WHERE company_id=cid AND status IN('DISPATCHED','EN_ROUTE');
  IF n=0 THEN RAISE EXCEPTION 'No dispatched flight' USING ERRCODE='P0002'; END IF;
  IF n>1 THEN RAISE EXCEPTION 'Only one active flight may be flown via ACARS; cancel or finish the others' USING ERRCODE='P0409'; END IF;
  SELECT * INTO f FROM flights WHERE company_id=cid AND status IN('DISPATCHED','EN_ROUTE') FOR UPDATE;
  UPDATE flights SET execution_source='ACARS_AGENT',status='EN_ROUTE',departed_at=coalesce(departed_at,now()) WHERE id=f.id;
  UPDATE fleet_aircraft SET status='EN_ROUTE' WHERE id=f.aircraft_id;
END IF;
IF f.status='EN_ROUTE' AND f.execution_source='ACARS_AGENT' AND now()>=coalesce((f.telemetry->'live'->>'received_at')::timestamptz,f.departed_at,f.created_at)+interval '30 minutes' THEN RAISE EXCEPTION 'ACARS resume window expired — use Cancel flight' USING ERRCODE='P0409'; END IF; SELECT t.fuel_capacity_gal INTO cap FROM fleet_aircraft a JOIN aircraft_types t ON t.id=a.aircraft_type_id WHERE a.id=f.aircraft_id;
IF (p->>'fuel_gal')::numeric > cap*1.05 THEN RAISE EXCEPTION 'Implausible fuel: exceeds aircraft tank capacity' USING ERRCODE='P0422'; END IF;
prev := f.telemetry->'live';
IF prev IS NOT NULL AND prev ? 'received_at' THEN
  secs := greatest(1, extract(epoch FROM now()-(prev->>'received_at')::timestamptz));
  nm := 3440.065*2*asin(sqrt(power(sin(radians(((p->>'lat')::numeric-(prev->>'lat')::numeric)/2)),2)+cos(radians((prev->>'lat')::numeric))*cos(radians((p->>'lat')::numeric))*power(sin(radians(((p->>'lon')::numeric-(prev->>'lon')::numeric)/2)),2)));
  IF nm/(secs/3600.0) > 800 AND nm > 5 THEN RAISE EXCEPTION 'Implausible position jump' USING ERRCODE='P0422'; END IF;
  IF upper(coalesce(p->>'phase',''))<>ALL(ARRAY['PREFLIGHT','PARKED']) AND (p->>'fuel_gal')::numeric > (prev->>'fuel_gal')::numeric + greatest(2,cap*0.01) THEN
    UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;
    IF coalesce((f.estimate->>'cargo_kg')::numeric,0)>0 AND NOT EXISTS(SELECT 1 FROM special_missions WHERE flight_id=f.id) THEN
      INSERT INTO airport_cargo_pools(airport_icao,cargo_pool_kg) VALUES(f.origin_icao,cargo_stock(f.origin_icao)) ON CONFLICT DO NOTHING;
      UPDATE airport_cargo_pools SET cargo_pool_kg=cargo_stock(airport_icao)+(f.estimate->>'cargo_kg')::numeric,updated_at=now() WHERE airport_icao=f.origin_icao;
    END IF;
    UPDATE flights SET status='CANCELLED',telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('cancellation_reason','ILLEGAL_REFUEL_IN_FLIGHT','cancelled_at',now(),'refuel_evidence',jsonb_build_object('phase',p->>'phase','previous_fuel_gal',(prev->>'fuel_gal')::numeric,'reported_fuel_gal',(p->>'fuel_gal')::numeric,'tolerance_gal',greatest(2,cap*0.01))) WHERE id=f.id;
    UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;
    RETURN jsonb_build_object('ok',false,'status','CANCELLED','reason','ILLEGAL_REFUEL_IN_FLIGHT','flight_id',f.id,'flight_number',f.flight_number);
  END IF;
END IF;
UPDATE flights SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','live',p||jsonb_build_object('received_at',now())) WHERE id=f.id;
RETURN jsonb_build_object('ok',true,'flight_id',f.id,'flight_number',f.flight_number); END $function$;
CREATE OR REPLACE FUNCTION public.settle_flight(p_flight uuid, p_telemetry jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f flights%ROWTYPE; q jsonb; bal numeric; delta numeric; item record; dissolving integer; remaining numeric; m special_missions%ROWTYPE; cut numeric:=0; tip jsonb; tip_amount numeric:=0; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF; IF f.status='COMPLETED' THEN RETURN f.settlement; END IF; IF f.execution_source='ACARS_AGENT' THEN IF coalesce(current_setting('smoothsky.acars_settlement',true),'')<>f.id::text THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; ELSE IF f.execution_source<>'WEB_MANUAL' THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN RAISE EXCEPTION 'Test simulation disabled'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; IF now()<f.departed_at+make_interval(secs=>((f.estimated_minutes*60)/greatest(1,(f.rules_snapshot->>'simulation_time_scale')::numeric))::double precision) THEN RAISE EXCEPTION 'Flight has not arrived yet'; END IF; END IF; q:=public.flight_fuel_billing(f.estimate,f.execution_source,p_telemetry); SELECT * INTO m FROM special_missions WHERE flight_id=f.id FOR UPDATE; IF FOUND AND m.status='ACCEPTED' THEN IF now()>m.deadline_at THEN cut:=round((q->>'revenue')::numeric*0.5,2); q:=q||jsonb_build_object('revenue',(q->>'revenue')::numeric-cut,'net',(q->>'net')::numeric-cut,'late_penalty',cut); END IF; UPDATE special_missions SET status='COMPLETED',completed_at=now(),final_payout=(q->>'revenue')::numeric,delivered_late=cut>0 WHERE id=m.id; END IF; tip:=public.passenger_landing_tip(f.execution_source,f.passengers,p_telemetry,coalesce((q->>'ticket_revenue')::numeric,greatest(0,(q->>'revenue')::numeric-coalesce((q->>'cargo_revenue')::numeric,0))),q->'rules');
 tip_amount:=coalesce((tip->>'passenger_tip')::numeric,0);
 q:=q||tip||jsonb_build_object('net',(q->>'net')::numeric+tip_amount);
 bal:=company_balance(c.id); FOR item IN SELECT * FROM (VALUES('TICKET_REVENUE','COMPANY_CASH','PASSENGER_REVENUE',(q->>'revenue')::numeric),('FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',CASE WHEN q ? 'fuel_uplift_gal' THEN 0 ELSE -(q->>'fuel_cost')::numeric END),('AIRPORT_FEES','AIRPORT_EXPENSE','COMPANY_CASH',-(q->>'landing_fee')::numeric),('HANDLING_FEES','HANDLING_EXPENSE','COMPANY_CASH',-(q->>'handling_fee')::numeric),('MAINTENANCE_RESERVE','MAINTENANCE_EXPENSE','COMPANY_CASH',-(q->>'maintenance')::numeric)) AS v(kind,debit,credit,change) LOOP IF item.change=0 THEN CONTINUE; END IF; delta:=item.change; bal:=bal+delta; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(c.id,item.kind,item.debit,item.credit,abs(delta),delta,bal,item.kind||' – '||f.flight_number||' · '||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||' · '||f.origin_icao||' → '||f.destination_icao,f.id::text,'flight:'||f.id||':'||item.kind); END LOOP;
 IF tip_amount>0 THEN
  bal:=public.company_post(c.id,'PASSENGER_TIP','COMPANY_CASH','PASSENGER_REVENUE',tip_amount,'Passenger tip – '||f.flight_number||' · '||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||' · '||f.origin_icao||' → '||f.destination_icao,f.id::text,'flight:'||f.id||':PASSENGER_TIP');
 END IF;
 PERFORM 1 FROM airport_passenger_pools WHERE airport_icao=f.destination_icao FOR UPDATE; dissolving:=round(f.passengers*((f.rules_snapshot->>'dissolve_min')::numeric+((f.rules_snapshot->>'dissolve_max')::numeric-(f.rules_snapshot->>'dissolve_min')::numeric)*random())); remaining:=passenger_stock(f.destination_icao)+f.passengers-dissolving; UPDATE airport_passenger_pools SET stock=least(passenger_capacity(f.destination_icao)*economy_number('transit_cap'),remaining),updated_at=now() WHERE airport_icao=f.destination_icao; UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.destination_icao,current_fuel_gal=CASE WHEN ownership='RENTAL' THEN 0 WHEN q ? 'fuel_uplift_gal' THEN greatest(0,round((q->>'target_fuel_gal')::numeric-coalesce((q->>'billed_fuel_gal')::numeric,(q->>'fuel_gal')::numeric,0),4)) ELSE current_fuel_gal END WHERE id=f.aircraft_id; q:=q||jsonb_build_object('balance_after',bal,'dissolved_passengers',dissolving); UPDATE flights SET status='COMPLETED',completed_at=now(),telemetry=CASE WHEN f.execution_source='ACARS_AGENT' THEN coalesce(f.telemetry,'{}'::jsonb)||p_telemetry||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','destination',f.destination_icao) ELSE jsonb_build_object('schema_version',1,'source','WEB_MANUAL','fuel_used_gal',f.estimate->'fuel_gal','destination',f.destination_icao) END,settlement=q WHERE id=f.id; RETURN q; END $function$;
CREATE OR REPLACE FUNCTION public.start_test_flight(p_flight uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE f flights%ROWTYPE; cid uuid; BEGIN SELECT id INTO cid FROM companies WHERE user_id=auth.uid() FOR UPDATE; SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=cid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF; IF f.execution_source<>'WEB_MANUAL' OR NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN RAISE EXCEPTION 'Test simulation disabled'; END IF; IF f.status='EN_ROUTE' THEN RETURN; END IF; IF f.status<>'DISPATCHED' THEN RAISE EXCEPTION 'Invalid flight state'; END IF; UPDATE flights SET status='EN_ROUTE',departed_at=now(),rules_snapshot=jsonb_set(rules_snapshot,'{simulation_time_scale}',to_jsonb(greatest(1,economy_number('simulation_time_scale')))) WHERE id=f.id; UPDATE fleet_aircraft SET status='EN_ROUTE' WHERE id=f.aircraft_id; END $function$;
CREATE OR REPLACE FUNCTION public.accrue_airframe_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status='COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    UPDATE fleet_aircraft SET airframe_hours = airframe_hours + coalesce((NEW.settlement->>'minutes')::numeric, NEW.estimated_minutes)/60 WHERE id = NEW.aircraft_id;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.cancel_test_flight(p_flight uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE f flights%ROWTYPE; c uuid; BEGIN SELECT id INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=c FOR UPDATE; IF NOT FOUND OR f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RAISE EXCEPTION 'Only active flights can be cancelled'; END IF; UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao; UPDATE flights SET status='CANCELLED' WHERE id=f.id; UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id; END $function$;
CREATE OR REPLACE FUNCTION public.flight_fuel_billing(q jsonb, p_source text, p_telemetry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE trip numeric; actual numeric; billed numeric; price numeric; cost numeric; floor_pct numeric;
BEGIN
 IF NOT (q ? 'weight_budget') THEN RETURN q; END IF;
 trip:=(q->'weight_budget'->>'trip_fuel_gal')::numeric;
 floor_pct:=(q->'weight_budget'->>'fuel_billing_floor_pct')::numeric;
 price:=(q->>'fuel_price_per_gal')::numeric*(1-coalesce((q->'fob_discounts'->>'fuel')::numeric,0));
 IF trip IS NULL OR trip<0 OR price IS NULL OR price<0 OR floor_pct IS NULL OR floor_pct<0 OR floor_pct>1 THEN RAISE EXCEPTION 'Invalid frozen fuel billing data'; END IF;
 IF p_source='ACARS_AGENT' THEN
  IF jsonb_typeof(p_telemetry->'fuel_used_gal')='number' THEN actual:=(p_telemetry->>'fuel_used_gal')::numeric;
  ELSIF jsonb_typeof(p_telemetry->'pirep'->'fuel_used_gal')='number' THEN actual:=(p_telemetry->'pirep'->>'fuel_used_gal')::numeric;
  ELSE RAISE EXCEPTION 'Verified ACARS fuel consumption is required'; END IF;
  IF actual<0 OR actual::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid ACARS fuel consumption'; END IF;
  billed:=greatest(actual,trip*floor_pct);
 ELSE billed:=trip; END IF;
 cost:=round(billed*price,2);
 RETURN q||jsonb_build_object('actual_fuel_used_gal',actual,'billed_fuel_gal',billed,'fuel_billing_floor_pct',floor_pct,'fuel_price_effective_per_gal',price,'fuel_cost',cost,'net',(q->>'net')::numeric+(q->>'fuel_cost')::numeric-cost);
END $function$;
CREATE OR REPLACE FUNCTION public.manage_lease(p_aircraft uuid, p_action text, p_weeks integer DEFAULT 4)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f fleet_aircraft%ROWTYPE; k lease_contracts%ROWTYPE; bal numeric; rate numeric; base numeric; discount numeric; kid uuid; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; PERFORM process_due_obligations(); SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF; IF f.ownership='OWNED' THEN RAISE EXCEPTION 'Owned aircraft has no lease'; END IF; IF f.returned_at IS NOT NULL THEN RETURN f.id; END IF; SELECT * INTO k FROM lease_contracts WHERE aircraft_id=f.id ORDER BY starts_at DESC LIMIT 1 FOR UPDATE; IF now()<k.ends_at THEN RAISE EXCEPTION 'Contract has not expired yet'; END IF; IF EXISTS(SELECT 1 FROM flights WHERE aircraft_id=f.id AND status IN ('DISPATCHED','EN_ROUTE')) THEN RAISE EXCEPTION 'Complete or cancel the active flight first'; END IF; bal:=company_balance(c.id); IF p_action='return' THEN INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(c.id,'LEASE_DEPOSIT_REFUND','COMPANY_CASH','LESSOR_DEPOSITS',f.lease_deposit,f.lease_deposit,bal+f.lease_deposit,'Deposit refunded – '||f.registration,f.registration,'lease_refund:'||f.id); UPDATE fleet_aircraft SET returned_at=now(),status='RETURNED' WHERE id=f.id; RETURN f.id; ELSIF p_action='renew' THEN PERFORM assert_company_investment(); IF p_weeks IS NULL OR p_weeks NOT BETWEEN 1 AND 52 THEN RAISE EXCEPTION 'Lease term must be 1–52 weeks'; END IF; SELECT weekly_rate INTO base FROM aircraft_types WHERE id=f.aircraft_type_id; SELECT renewal_discount INTO discount FROM operating_rules WHERE singleton; rate:=round(base*(1-discount),2); IF bal<rate THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF; INSERT INTO lease_contracts(aircraft_id,company_id,starts_at,ends_at,term_weeks,base_weekly_rate,weekly_rate,renewal) VALUES(f.id,c.id,now(),now()+make_interval(days=>7*p_weeks),p_weeks,base,rate,true) RETURNING id INTO kid; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(c.id,'LEASE_PAYMENT','LESSOR_REVENUE','COMPANY_CASH',rate,-rate,bal-rate,'Renewal first weekly payment – '||f.registration,f.registration,'contract:'||kid||':week:1'); UPDATE fleet_aircraft SET weekly_rate=rate,next_payment_due=now()+interval '7 days',status='AVAILABLE' WHERE id=f.id; RETURN kid; ELSE RAISE EXCEPTION 'Unknown lease action'; END IF; END $function$;
