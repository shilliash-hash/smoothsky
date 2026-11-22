CREATE OR REPLACE FUNCTION public.flight_quote_without_fobs(p_aircraft uuid, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE f fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; mins numeric; fuel numeric; pax integer; gross numeric; landing numeric; handling numeric; maintenance numeric; price numeric; rules jsonb; raw_pax integer; dfac numeric; hub numeric; unpaved boolean := false; BEGIN SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM companies WHERE user_id=auth.uid()); IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF; SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id; SELECT * INTO a FROM airports WHERE icao=f.location_icao; SELECT * INTO b FROM airports WHERE icao=p_destination; IF NOT FOUND OR a.icao=b.icao THEN RAISE EXCEPTION 'Choose a different destination'; END IF; IF f.ownership NOT IN ('OWNED','RENTAL') AND NOT EXISTS(SELECT 1 FROM public.lease_contracts k WHERE k.aircraft_id=f.id AND now()>=k.starts_at AND now()<k.ends_at) OR f.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Lease expired — renew before dispatch'; END IF; IF f.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Aircraft is not available'; END IF; IF t.cruise_kts<=0 OR t.fuel_burn_gph<=0 THEN RAISE EXCEPTION 'Invalid aircraft specification'; END IF; nm:=3440.065*2*asin(sqrt(least(1,power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lon-a.lon)/2),2)))); IF nm>t.range_nm THEN RAISE EXCEPTION 'Destination is outside aircraft range'; END IF; IF b.longest_runway_ft IS NOT NULL AND b.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Destination runway is too short'; END IF; IF a.longest_runway_ft IS NOT NULL AND a.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Origin runway is too short'; END IF; IF public.runway_is_unpaved(b.runway_surface,b.size,b.longest_runway_ft) AND NOT t.unpaved_capable THEN IF EXISTS(SELECT 1 FROM public.airports x WHERE x.icao<>b.icao AND x.lat BETWEEN b.lat-1.7 AND b.lat+1.7 AND x.lon BETWEEN b.lon-5 AND b.lon+5 AND NOT public.runway_is_unpaved(x.runway_surface,x.size,x.longest_runway_ft) AND (x.longest_runway_ft IS NULL OR x.longest_runway_ft>=t.minimum_runway_ft)) THEN RAISE EXCEPTION 'Unpaved runway — aircraft is not bush-capable'; END IF; unpaved:=true; END IF;  mins:=nm/t.cruise_kts*60; fuel:=mins/60*t.fuel_burn_gph; IF public.airport_fuel_stock(a.icao,t.fuel_type)<fuel THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF; IF fuel+economy_number('fuel_reserve_minutes')/60*t.fuel_burn_gph>t.fuel_capacity_gal THEN RAISE EXCEPTION 'Insufficient fuel capacity with reserve'; END IF; pax:=greatest(0,least(t.pax,floor(passenger_stock(a.icao))::int,floor(passenger_capacity(b.icao)*economy_number('transit_cap')-passenger_stock(b.icao))::int)); SELECT jsonb_object_agg(key,value) INTO rules FROM economy_config; rules := rules || jsonb_build_object('short_hop_threshold_nm',coalesce((rules->>'short_hop_threshold_nm')::numeric,80),'short_hop_charter_multiplier',coalesce((rules->>'short_hop_charter_multiplier')::numeric,0.5),'short_hop_min_multiplier',least(1,greatest(0,coalesce((rules->>'short_hop_min_multiplier')::numeric,0.2))));
  rules := rules || jsonb_build_object('short_hop_charter',jsonb_build_object(
    'base_rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0),
    'rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0)*CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN round((rules->>'short_hop_min_multiplier')::numeric+(1-(rules->>'short_hop_min_multiplier')::numeric)*nm/(rules->>'short_hop_threshold_nm')::numeric,4) ELSE 1 END,
    'multiplier',CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN round((rules->>'short_hop_min_multiplier')::numeric+(1-(rules->>'short_hop_min_multiplier')::numeric)*nm/(rules->>'short_hop_threshold_nm')::numeric,4) ELSE 1 END,
    'threshold_nm',(rules->>'short_hop_threshold_nm')::numeric,
    'reduced',nm<(rules->>'short_hop_threshold_nm')::numeric));
  raw_pax:=pax; dfac:=least(1,greatest(0,coalesce((rules->'demand_factor_by_size'->>(b.size-1))::numeric,1))); hub:=greatest(0,coalesce((rules->'hub_fare_bonus_by_size'->>(b.size-1))::numeric,0)); pax:=round(raw_pax*dfac)::int; IF t.tier<=2 AND raw_pax>=1 THEN pax:=greatest(1,pax); END IF; gross:=round(pax*(nm*economy_number('fare_per_nm')+(rules->'short_hop_charter'->>'rate')::numeric)*(1+hub),2); price:=economy_number(CASE WHEN t.fuel_type='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END); landing:=round(economy_number('landing_base_fee')*(rules->'airport_fee_multipliers'->>(b.size-1))::numeric,2); handling:=round(gross*economy_number('handling_rate')*2,2); maintenance:=round(mins/60*economy_number('maintenance_per_hour'),2); RETURN jsonb_build_object('demand',jsonb_build_object('raw_passengers',raw_pax,'factor',dfac,'hub_bonus',hub,'destination_size',b.size),'runway_unpaved',unpaved,'short_hop_charter',rules->'short_hop_charter','distance_nm',round(nm,2),'minutes',round(mins,2),'passengers',pax,'revenue',gross,'fuel_gal',round(fuel,4),'fuel_cost',round(fuel*price,2),'landing_fee',landing,'handling_fee',handling,'maintenance',maintenance,'net',gross-round(fuel*price,2)-landing-handling-maintenance,'rules',rules); END $function$;

CREATE OR REPLACE FUNCTION public.flight_quote_cargo(p_aircraft uuid, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q jsonb; opt jsonb := nullif(current_setting('smoothsky.cargo', true),'')::jsonb; r operating_rules%ROWTYPE;
  f fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; m special_missions%ROWTYPE; all_cargo boolean; want numeric; cap numeric; kg numeric := 0;
  pax int; fare numeric; cargo_rev numeric := 0; revenue numeric; landing numeric; handling numeric; hd numeric; mission uuid;
BEGIN
  q := flight_quote(p_aircraft, p_destination);
  q := q || jsonb_build_object('rules',coalesce(q->'rules','{}'::jsonb) || (SELECT jsonb_build_object('butter_landing_max_fpm',butter_landing_max_fpm,'smooth_landing_min_fpm',smooth_landing_min_fpm,'smooth_landing_max_fpm',smooth_landing_max_fpm,'butter_tip_rate',butter_tip_rate,'smooth_tip_rate',smooth_tip_rate) FROM public.operating_rules WHERE singleton));
  IF opt IS NULL THEN RETURN q || jsonb_build_object('cargo_kg',0,'cargo_revenue',0,'ticket_revenue',q->'revenue','all_cargo',false); END IF;
  SELECT * INTO r FROM operating_rules WHERE singleton;
  SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft;
  SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id;
  mission := nullif(opt->>'mission','')::uuid;
  hd := ((coalesce((q->'fob_discounts'->>'handling_origin')::numeric,0)+coalesce((q->'fob_discounts'->>'handling_destination')::numeric,0))/2);
  IF mission IS NOT NULL THEN
    SELECT * INTO m FROM special_missions WHERE id=mission AND accepted_by=auth.uid();
    IF NOT FOUND OR m.status <> 'ACCEPTED' THEN RAISE EXCEPTION 'Mission not accepted by you'; END IF;
    IF m.origin_icao <> f.location_icao OR m.destination_icao <> p_destination THEN RAISE EXCEPTION 'Aircraft must fly % → % for this mission', m.origin_icao, m.destination_icao; END IF;
    IF t.cargo_kg*(1+r.all_cargo_capacity_bonus) < m.cargo_kg THEN RAISE EXCEPTION 'Aircraft cargo capacity is too small for this mission (% kg needed)', m.cargo_kg; END IF;
    landing := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2) END;
    handling := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round(m.payout*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2) END;
    RETURN q || jsonb_build_object('passengers',0,'cargo_kg',m.cargo_kg,'cargo_revenue',m.payout,'ticket_revenue',0,'revenue',m.payout,'all_cargo',true,
      'mission_id',m.id,'mission_category',m.category,'landing_fee',landing,'handling_fee',handling,
      'net',m.payout-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric);
  END IF;
  all_cargo := coalesce((opt->>'all_cargo')::boolean,false);
  want := greatest(0, coalesce((opt->>'cargo_kg')::numeric,0));
  cap := t.cargo_kg * CASE WHEN all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END;
  kg := floor(least(want, cap, cargo_stock(f.location_icao)));
  fare := (q->>'distance_nm')::numeric*(q->'rules'->>'fare_per_nm')::numeric + (q->'short_hop_charter'->>'rate')::numeric;
  cargo_rev := round(kg/100*r.cargo_pax_rate_ratio*fare,2);
  pax := CASE WHEN all_cargo THEN 0 ELSE (q->>'passengers')::int END;
  revenue := CASE WHEN all_cargo THEN cargo_rev ELSE (q->>'revenue')::numeric + cargo_rev END;
  IF all_cargo THEN
    landing := round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2);
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2);
  ELSE
    landing := (q->>'landing_fee')::numeric;
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd),2);
  END IF;
  RETURN q || jsonb_build_object('passengers',pax,'cargo_kg',kg,'cargo_capacity_kg',cap,'cargo_revenue',cargo_rev,
    'ticket_revenue',CASE WHEN all_cargo THEN 0 ELSE (q->>'revenue')::numeric END,'revenue',revenue,'all_cargo',all_cargo,
    'landing_fee',landing,'handling_fee',handling,
    'net',revenue-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric);
END $function$;

CREATE OR REPLACE FUNCTION public.flight_quote_full(p_aircraft uuid, p_destination text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('smoothsky.cargo', jsonb_build_object('cargo_kg',coalesce(p_cargo_kg,0),'all_cargo',coalesce(p_all_cargo,false),'mission',p_mission)::text, true);
  RETURN flight_quote_cargo(p_aircraft, p_destination);
END $function$;

CREATE OR REPLACE FUNCTION public.settle_flight(p_flight uuid, p_telemetry jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f flights%ROWTYPE; q jsonb; bal numeric; delta numeric; item record; dissolving integer; remaining numeric; m special_missions%ROWTYPE; cut numeric:=0; tip jsonb; tip_amount numeric:=0; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF; IF f.status='COMPLETED' THEN RETURN f.settlement; END IF; IF f.execution_source='ACARS_AGENT' THEN IF coalesce(current_setting('smoothsky.acars_settlement',true),'')<>f.id::text THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; ELSE IF f.execution_source<>'WEB_MANUAL' THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN RAISE EXCEPTION 'Test simulation disabled'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; IF now()<f.departed_at+make_interval(secs=>((f.estimated_minutes*60)/greatest(1,(f.rules_snapshot->>'simulation_time_scale')::numeric))::double precision) THEN RAISE EXCEPTION 'Flight has not arrived yet'; END IF; END IF; q:=f.estimate; SELECT * INTO m FROM special_missions WHERE flight_id=f.id FOR UPDATE; IF FOUND AND m.status='ACCEPTED' THEN IF now()>m.deadline_at THEN cut:=round((q->>'revenue')::numeric*0.5,2); q:=q||jsonb_build_object('revenue',(q->>'revenue')::numeric-cut,'net',(q->>'net')::numeric-cut,'late_penalty',cut); END IF; UPDATE special_missions SET status='COMPLETED',completed_at=now(),final_payout=(q->>'revenue')::numeric,delivered_late=cut>0 WHERE id=m.id; END IF; tip:=public.passenger_landing_tip(f.execution_source,f.passengers,p_telemetry,coalesce((q->>'ticket_revenue')::numeric,greatest(0,(q->>'revenue')::numeric-coalesce((q->>'cargo_revenue')::numeric,0))),q->'rules');
 tip_amount:=coalesce((tip->>'passenger_tip')::numeric,0);
 q:=q||tip||jsonb_build_object('net',(q->>'net')::numeric+tip_amount);
 bal:=company_balance(c.id); FOR item IN SELECT * FROM (VALUES('TICKET_REVENUE','COMPANY_CASH','PASSENGER_REVENUE',(q->>'revenue')::numeric),('FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-(q->>'fuel_cost')::numeric),('AIRPORT_FEES','AIRPORT_EXPENSE','COMPANY_CASH',-(q->>'landing_fee')::numeric),('HANDLING_FEES','HANDLING_EXPENSE','COMPANY_CASH',-(q->>'handling_fee')::numeric),('MAINTENANCE_RESERVE','MAINTENANCE_EXPENSE','COMPANY_CASH',-(q->>'maintenance')::numeric)) AS v(kind,debit,credit,change) LOOP IF item.change=0 THEN CONTINUE; END IF; delta:=item.change; bal:=bal+delta; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(c.id,item.kind,item.debit,item.credit,abs(delta),delta,bal,item.kind||' – '||f.flight_number||' · '||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||' · '||f.origin_icao||' → '||f.destination_icao,f.id::text,'flight:'||f.id||':'||item.kind); END LOOP;
 IF tip_amount>0 THEN
  bal:=public.company_post(c.id,'PASSENGER_TIP','COMPANY_CASH','PASSENGER_REVENUE',tip_amount,'Passenger tip – '||f.flight_number||' · '||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||' · '||f.origin_icao||' → '||f.destination_icao,f.id::text,'flight:'||f.id||':PASSENGER_TIP');
 END IF;
 PERFORM 1 FROM airport_passenger_pools WHERE airport_icao=f.destination_icao FOR UPDATE; dissolving:=round(f.passengers*((f.rules_snapshot->>'dissolve_min')::numeric+((f.rules_snapshot->>'dissolve_max')::numeric-(f.rules_snapshot->>'dissolve_min')::numeric)*random())); remaining:=passenger_stock(f.destination_icao)+f.passengers-dissolving; UPDATE airport_passenger_pools SET stock=least(passenger_capacity(f.destination_icao)*economy_number('transit_cap'),remaining),updated_at=now() WHERE airport_icao=f.destination_icao; UPDATE fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.destination_icao WHERE id=f.aircraft_id; q:=q||jsonb_build_object('balance_after',bal,'dissolved_passengers',dissolving); UPDATE flights SET status='COMPLETED',completed_at=now(),telemetry=CASE WHEN f.execution_source='ACARS_AGENT' THEN coalesce(f.telemetry,'{}'::jsonb)||p_telemetry||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','destination',f.destination_icao) ELSE jsonb_build_object('schema_version',1,'source','WEB_MANUAL','fuel_used_gal',f.estimate->'fuel_gal','destination',f.destination_icao) END,settlement=q WHERE id=f.id; RETURN q; END $function$;