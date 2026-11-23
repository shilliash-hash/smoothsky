CREATE OR REPLACE FUNCTION public.divert_leg_quote(f flights, dest text, target numeric DEFAULT NULL::numeric, landing_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a fleet_aircraft; t aircraft_types; b airports; o airports; contract jsonb; wb jsonb; q jsonb; nm numeric; mins numeric; trip numeric; price numeric; fee numeric; fd numeric:=0; ld numeric:=0; prior numeric:=0; payload numeric; fuel_target numeric;
BEGIN
 SELECT * INTO a FROM fleet_aircraft WHERE id=f.aircraft_id;
 SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
 SELECT * INTO o FROM airports WHERE icao=CASE WHEN landing_only THEN f.origin_icao ELSE a.location_icao END;
 SELECT * INTO b FROM airports WHERE icao=dest;
 IF b.icao IS NULL OR o.icao IS NULL OR b.icao=o.icao THEN RAISE EXCEPTION 'Choose a known, different airport'; END IF;
 IF b.longest_runway_ft IS NULL OR b.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Alternate runway is unknown or too short'; END IF;
 IF runway_is_unpaved(b.runway_surface,b.size,b.longest_runway_ft) AND NOT t.unpaved_capable THEN RAISE EXCEPTION 'Alternate runway surface is unsuitable'; END IF;
 contract:=coalesce(f.divert_state->'contract',f.estimate); contract:=contract||jsonb_build_object('rules',coalesce(contract->'rules',f.rules_snapshot));
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
END $function$;
CREATE OR REPLACE FUNCTION public.flight_quote(p_aircraft uuid, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q jsonb; cid uuid; origin text; o company_fobs%ROWTYPE; d company_fobs%ROWTYPE; fd numeric:=0; hd_o numeric:=0; hd_d numeric:=0; ld numeric:=0; md numeric:=0; fuel numeric; landing numeric; handling numeric; maintenance numeric; savings numeric;
BEGIN
 q:=flight_quote_without_fobs(p_aircraft,p_destination);
 SELECT company_id,location_icao INTO cid,origin FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM companies WHERE user_id=auth.uid());
 SELECT * INTO o FROM company_fobs WHERE company_id=cid AND airport_icao=origin AND closed_at IS NULL;
 SELECT * INTO d FROM company_fobs WHERE company_id=cid AND airport_icao=p_destination AND closed_at IS NULL;
 IF coalesce(o.has_fuel_contract,false) THEN fd:=economy_number('fob_fuel_discount'); END IF;
 IF o.id IS NOT NULL THEN hd_o:=1; END IF;
 IF d.id IS NOT NULL THEN hd_d:=1; END IF;
 IF coalesce(d.has_handling_desk,false) THEN ld:=economy_number('fob_handling_discount'); END IF;
 IF coalesce(o.has_maintenance_bay,false) OR coalesce(d.has_maintenance_bay,false) THEN md:=economy_number('fob_maintenance_discount'); END IF;
 fuel:=round((q->>'fuel_cost')::numeric*(1-fd),2);
 landing:=round((q->>'landing_fee')::numeric*(1-ld),2);
 handling:=round((q->>'handling_fee')::numeric*(1-(hd_o+hd_d)/2),2);
 maintenance:=round((q->>'maintenance')::numeric*(1-md),2);
 savings:=(q->>'fuel_cost')::numeric+(q->>'landing_fee')::numeric+(q->>'handling_fee')::numeric+(q->>'maintenance')::numeric-fuel-landing-handling-maintenance;
 RETURN q||jsonb_build_object('fuel_cost',fuel,'landing_fee',landing,'handling_fee',handling,'maintenance',maintenance,'net',(q->>'revenue')::numeric-fuel-landing-handling-maintenance,'fob_discounts',jsonb_build_object('fuel',fd,'landing',ld,'handling_origin',hd_o,'handling_destination',hd_d,'handling_discount',(hd_o+hd_d)/2,'handling_savings',(q->>'handling_fee')::numeric-handling,'maintenance',md,'savings',savings));
END $function$;
CREATE OR REPLACE FUNCTION public.flight_quote_without_fobs(p_aircraft uuid, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE f fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; mins numeric; fuel numeric; pax integer; gross numeric; landing numeric; handling numeric; maintenance numeric; price numeric; rules jsonb; raw_pax integer; dfac numeric; hub numeric; unpaved boolean := false; wb jsonb; BEGIN SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM companies WHERE user_id=auth.uid()); IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF; SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id; SELECT * INTO a FROM airports WHERE icao=f.location_icao; SELECT * INTO b FROM airports WHERE icao=p_destination; IF NOT FOUND OR a.icao=b.icao THEN RAISE EXCEPTION 'Choose a different destination'; END IF; IF f.ownership NOT IN ('OWNED','RENTAL') AND NOT EXISTS(SELECT 1 FROM public.lease_contracts k WHERE k.aircraft_id=f.id AND now()>=k.starts_at AND now()<k.ends_at) OR f.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Lease expired — renew before dispatch'; END IF; IF f.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Aircraft is not available'; END IF; IF t.cruise_kts<=0 OR t.fuel_burn_gph<=0 THEN RAISE EXCEPTION 'Invalid aircraft specification'; END IF; nm:=3440.065*2*asin(sqrt(least(1,power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lon-a.lon)/2),2)))); IF nm>t.range_nm THEN RAISE EXCEPTION 'Destination is outside aircraft range'; END IF; IF b.longest_runway_ft IS NOT NULL AND b.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Destination runway is too short'; END IF; IF a.longest_runway_ft IS NOT NULL AND a.longest_runway_ft<t.minimum_runway_ft THEN RAISE EXCEPTION 'Origin runway is too short'; END IF; IF public.runway_is_unpaved(b.runway_surface,b.size,b.longest_runway_ft) AND NOT t.unpaved_capable THEN IF EXISTS(SELECT 1 FROM public.airports x WHERE x.icao<>b.icao AND x.lat BETWEEN b.lat-1.7 AND b.lat+1.7 AND x.lon BETWEEN b.lon-5 AND b.lon+5 AND NOT public.runway_is_unpaved(x.runway_surface,x.size,x.longest_runway_ft) AND (x.longest_runway_ft IS NULL OR x.longest_runway_ft>=t.minimum_runway_ft)) THEN RAISE EXCEPTION 'Unpaved runway — aircraft is not bush-capable'; END IF; unpaved:=true; END IF;  mins:=nm/t.cruise_kts*60; fuel:=mins/60*t.fuel_burn_gph; IF public.airport_fuel_stock(a.icao,t.fuel_type)<fuel THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF; IF fuel+economy_number('fuel_reserve_minutes')/60*t.fuel_burn_gph>t.fuel_capacity_gal THEN RAISE EXCEPTION 'Insufficient fuel capacity with reserve'; END IF; pax:=greatest(0,least(t.pax,floor(passenger_stock(a.icao))::int,floor(passenger_capacity(b.icao)*economy_number('transit_cap')-passenger_stock(b.icao))::int)); SELECT jsonb_object_agg(key,value) INTO rules FROM economy_config; rules := rules || jsonb_build_object('short_hop_threshold_nm',coalesce((rules->>'short_hop_threshold_nm')::numeric,80),'short_hop_charter_multiplier',coalesce((rules->>'short_hop_charter_multiplier')::numeric,0.5),'short_hop_min_multiplier',least(1,greatest(0,coalesce((rules->>'short_hop_min_multiplier')::numeric,0.2))));
  rules := rules || jsonb_build_object('short_hop_charter',jsonb_build_object(
    'base_rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0),
    'rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0)*CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN round((rules->>'short_hop_min_multiplier')::numeric+(1-(rules->>'short_hop_min_multiplier')::numeric)*nm/(rules->>'short_hop_threshold_nm')::numeric,4) ELSE 1 END,
    'multiplier',CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN round((rules->>'short_hop_min_multiplier')::numeric+(1-(rules->>'short_hop_min_multiplier')::numeric)*nm/(rules->>'short_hop_threshold_nm')::numeric,4) ELSE 1 END,
    'threshold_nm',(rules->>'short_hop_threshold_nm')::numeric,
    'reduced',nm<(rules->>'short_hop_threshold_nm')::numeric));
  raw_pax:=pax; dfac:=least(1,greatest(0,coalesce((rules->'demand_factor_by_size'->>(b.size-1))::numeric,1))); hub:=greatest(0,coalesce((rules->'hub_fare_bonus_by_size'->>(b.size-1))::numeric,0)); pax:=round(raw_pax*dfac)::int; IF t.tier<=2 AND raw_pax>=1 THEN pax:=greatest(1,pax); END IF; wb:=public.flight_weight_budget(t.id,nm); pax:=least(pax,floor((wb->>'available_payload_kg')::numeric/(wb->>'passenger_weight_kg')::numeric)::int); gross:=round(pax*(nm*economy_number('fare_per_nm')+(rules->'short_hop_charter'->>'rate')::numeric)*(1+hub),2); price:=economy_number(CASE WHEN t.fuel_type='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END); landing:=round(t.mtow_kg/1000*(wb->>'landing_fee_per_ton_mtow')::numeric*(rules->'airport_fee_multipliers'->>(b.size-1))::numeric,2); handling:=round(gross*economy_number('handling_rate')*2,2); maintenance:=round(mins/60*economy_number('maintenance_per_hour'),2); RETURN jsonb_build_object('weight_budget',wb||jsonb_build_object('payload_kg',pax*(wb->>'passenger_weight_kg')::numeric,'takeoff_weight_kg',t.empty_weight_kg+(wb->>'planned_fuel_kg')::numeric+pax*(wb->>'passenger_weight_kg')::numeric,'remaining_payload_kg',(wb->>'available_payload_kg')::numeric-pax*(wb->>'passenger_weight_kg')::numeric),'fuel_price_per_gal',price,'ferry',pax=0,'demand',jsonb_build_object('raw_passengers',raw_pax,'factor',dfac,'hub_bonus',hub,'destination_size',b.size),'runway_unpaved',unpaved,'short_hop_charter',rules->'short_hop_charter','distance_nm',round(nm,2),'minutes',round(mins,2),'passengers',pax,'revenue',gross,'fuel_gal',round(fuel,4),'fuel_cost',round(fuel*price,2),'landing_fee',landing,'handling_fee',handling,'maintenance',maintenance,'net',gross-round(fuel*price,2)-landing-handling-maintenance,'rules',rules); END $function$;
CREATE OR REPLACE FUNCTION public.flight_tank_plan(q jsonb, p_current numeric, p_persistent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE wb jsonb:=q->'weight_budget'; target numeric; added numeric; price numeric; payload numeric; mx numeric;
BEGIN
 IF wb IS NULL THEN RETURN q; END IF;
 target:=(wb->>'planned_fuel_gal')::numeric;
 price:=(q->>'fuel_price_per_gal')::numeric*(1-coalesce((q->'fob_discounts'->>'fuel')::numeric,0));
 payload:=coalesce((wb->>'payload_kg')::numeric,0);
 mx:=least((wb->>'fuel_capacity_gal')::numeric,((wb->>'mtow_kg')::numeric-(wb->>'empty_weight_kg')::numeric-payload)/(wb->>'fuel_kg_per_gal')::numeric);
 IF p_persistent THEN added:=greatest(0,target-p_current); ELSE added:=target; END IF;
 RETURN q||jsonb_build_object('tank',jsonb_build_object('persistent',p_persistent,'current_fuel_gal',CASE WHEN p_persistent THEN p_current ELSE 0 END,'min_target_gal',CASE WHEN p_persistent THEN greatest((wb->>'min_safe_fuel_gal')::numeric,p_current) ELSE (wb->>'min_safe_fuel_gal')::numeric END,'target_fuel_gal',target,'max_target_gal',greatest(target,mx),'added_fuel_gal',added,'uplift_cost',CASE WHEN p_persistent THEN round(added*price,2) ELSE 0 END,'fuel_price_effective_per_gal',price));
END $function$;