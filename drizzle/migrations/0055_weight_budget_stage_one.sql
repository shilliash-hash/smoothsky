ALTER TABLE public.aircraft_types
 ADD COLUMN IF NOT EXISTS empty_weight_kg numeric NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS mtow_kg numeric NOT NULL DEFAULT 0;
UPDATE public.aircraft_types a SET empty_weight_kg=v.oew,mtow_kg=v.mtow
FROM (VALUES ('C172',830,1157),('BE58',1820,2495),('C208B',2150,4350),('B350',4600,6804),('PC12NGX',3100,4740),('DHC6',3200,6350),('AT76',13000,26500),('A320NEO',44300,79000),('B77W',167829,351500)) v(id,oew,mtow)
WHERE a.id=v.id AND a.empty_weight_kg=0 AND a.mtow_kg=0;
ALTER TABLE public.aircraft_types ADD CONSTRAINT aircraft_weight_specification CHECK ((empty_weight_kg=0 AND mtow_kg=0) OR (empty_weight_kg>0 AND mtow_kg>empty_weight_kg));
COMMENT ON COLUMN public.aircraft_types.empty_weight_kg IS 'Operating empty mass in kg; configure together with MTOW before dispatching new catalogue types.';
COMMENT ON COLUMN public.aircraft_types.mtow_kg IS 'Maximum takeoff mass in kg; payload and trip plus reserve fuel must fit below it.';

CREATE OR REPLACE FUNCTION public.flight_weight_budget(p_type text,p_distance_nm numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE t aircraft_types%ROWTYPE; r operating_rules%ROWTYPE; trip numeric; reserve numeric; density numeric; fuel_mass numeric; available numeric; pax_mass numeric; floor_pct numeric; landing_rate numeric;
BEGIN
 SELECT * INTO t FROM aircraft_types WHERE id=p_type;
 IF NOT FOUND OR t.empty_weight_kg<=0 OR t.mtow_kg<=t.empty_weight_kg OR t.cruise_kts<=0 OR t.fuel_burn_gph<=0 THEN RAISE EXCEPTION 'Configure valid aircraft empty weight, MTOW, speed and fuel burn'; END IF;
 IF p_distance_nm IS NULL OR p_distance_nm<0 THEN RAISE EXCEPTION 'Invalid flight distance'; END IF;
 SELECT * INTO r FROM operating_rules WHERE singleton;
 density:=CASE WHEN t.fuel_type='100LL' THEN r.avgas_kg_per_litre ELSE r.jeta_kg_per_litre END * 3.785411784;
 IF density IS NULL OR density<=0 THEN RAISE EXCEPTION 'Invalid fuel density'; END IF;
 trip:=p_distance_nm/t.cruise_kts*t.fuel_burn_gph;
 reserve:=economy_number('fuel_reserve_minutes')/60*t.fuel_burn_gph;
 IF trip+reserve>t.fuel_capacity_gal THEN RAISE EXCEPTION 'Insufficient fuel capacity with reserve'; END IF;
 fuel_mass:=(trip+reserve)*density;
 IF t.empty_weight_kg+fuel_mass>t.mtow_kg THEN RAISE EXCEPTION 'Trip fuel and reserve exceed MTOW even with no payload'; END IF;
 available:=greatest(0,t.mtow_kg-t.empty_weight_kg-fuel_mass);
 pax_mass:=economy_number_or('passenger_weight_kg',80);
 floor_pct:=economy_number_or('fuel_billing_floor_pct',0.80);
 landing_rate:=economy_number_or('landing_fee_per_ton_mtow',2.5);
 IF pax_mass<=0 OR floor_pct<0 OR floor_pct>1 OR landing_rate<0 THEN RAISE EXCEPTION 'Invalid weight-budget economy settings'; END IF;
 RETURN jsonb_build_object('version',1,'empty_weight_kg',t.empty_weight_kg,'mtow_kg',t.mtow_kg,'trip_fuel_gal',trip,'reserve_fuel_gal',reserve,'planned_fuel_gal',trip+reserve,'fuel_kg_per_gal',density,'planned_fuel_kg',fuel_mass,'available_payload_kg',available,'passenger_weight_kg',pax_mass,'fuel_billing_floor_pct',floor_pct,'landing_fee_per_ton_mtow',landing_rate);
END $function$;
REVOKE ALL ON FUNCTION public.flight_weight_budget(text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flight_weight_budget(text,numeric) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.flight_fuel_billing(q jsonb,p_source text,p_telemetry jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $function$
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
REVOKE ALL ON FUNCTION public.flight_fuel_billing(jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flight_fuel_billing(jsonb,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finalize_flight_weight(q jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $function$
DECLARE wb jsonb:=q->'weight_budget'; payload numeric; tow numeric;
BEGIN
 payload:=coalesce((q->>'passengers')::numeric,0)*(wb->>'passenger_weight_kg')::numeric+coalesce((q->>'cargo_kg')::numeric,0);
 IF payload IS NULL OR payload<0 OR payload>(wb->>'available_payload_kg')::numeric THEN RAISE EXCEPTION 'Payload exceeds MTOW with trip fuel and reserve'; END IF;
 tow:=(wb->>'empty_weight_kg')::numeric+(wb->>'planned_fuel_kg')::numeric+payload;
 RETURN q||jsonb_build_object('ferry',payload=0 AND q->>'mission_id' IS NULL,'weight_budget',wb||jsonb_build_object('payload_kg',payload,'takeoff_weight_kg',tow,'remaining_payload_kg',(wb->>'available_payload_kg')::numeric-payload));
END $function$;
REVOKE ALL ON FUNCTION public.finalize_flight_weight(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_flight_weight(jsonb) TO authenticated,service_role;

DO $migration$
DECLARE d text; old text;
BEGIN
 d:=pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
 old:='unpaved boolean := false; BEGIN';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing weight quote declaration anchor'; END IF;
 d:=replace(d,old,'unpaved boolean := false; wb jsonb; BEGIN');
 old:='pax:=round(raw_pax*dfac)::int; IF t.tier<=2 AND raw_pax>=1 THEN pax:=greatest(1,pax); END IF;';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing passenger mass anchor'; END IF;
 d:=replace(d,old,old||' wb:=public.flight_weight_budget(t.id,nm); pax:=least(pax,floor((wb->>''available_payload_kg'')::numeric/(wb->>''passenger_weight_kg'')::numeric)::int);');
 old:='landing:=round(economy_number(''landing_base_fee'')*(rules->''airport_fee_multipliers''->>(b.size-1))::numeric,2);';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing MTOW landing fee anchor'; END IF;
 d:=replace(d,old,'landing:=round(t.mtow_kg/1000*(wb->>''landing_fee_per_ton_mtow'')::numeric*(rules->''airport_fee_multipliers''->>(b.size-1))::numeric,2);');
 old:='RETURN jsonb_build_object(''demand'',';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing weight quote return anchor'; END IF;
 d:=replace(d,old,'RETURN jsonb_build_object(''weight_budget'',wb||jsonb_build_object(''payload_kg'',pax*(wb->>''passenger_weight_kg'')::numeric,''takeoff_weight_kg'',t.empty_weight_kg+(wb->>''planned_fuel_kg'')::numeric+pax*(wb->>''passenger_weight_kg'')::numeric,''remaining_payload_kg'',(wb->>''available_payload_kg'')::numeric-pax*(wb->>''passenger_weight_kg'')::numeric),''fuel_price_per_gal'',price,''ferry'',pax=0,''demand'',');
 EXECUTE d;
 d:=pg_get_functiondef('public.flight_quote_cargo(uuid,text)'::regprocedure);
 old:='IF t.cargo_kg*(1+r.all_cargo_capacity_bonus) < m.cargo_kg THEN';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing mission mass anchor'; END IF;
 d:=replace(d,old,'IF m.cargo_kg>(q->''weight_budget''->>''available_payload_kg'')::numeric THEN RAISE EXCEPTION ''Mission payload exceeds MTOW with trip fuel and reserve''; END IF; '||old);
 old:='kg := floor(least(want, cap, cargo_stock(f.location_icao)));';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing cargo mass anchor'; END IF;
 d:=replace(d,old,'kg := floor(least(want, cap, cargo_stock(f.location_icao),greatest(0,(q->''weight_budget''->>''available_payload_kg'')::numeric-CASE WHEN all_cargo THEN 0 ELSE (q->>''passengers'')::int*(q->''weight_budget''->>''passenger_weight_kg'')::numeric END)));');
 old:='RETURN q || jsonb_build_object(';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing cargo quote returns'; END IF;
 d:=replace(d,old,'RETURN public.finalize_flight_weight(q || jsonb_build_object(');
 d:=replace(d,'''all_cargo'',false);','''all_cargo'',false));');
 d:=replace(d,'-(q->>''maintenance'')::numeric);','-(q->>''maintenance'')::numeric));');
 EXECUTE d;
 d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 old:='q:=f.estimate;';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing frozen fuel settlement anchor'; END IF;
 d:=replace(d,old,'q:=public.flight_fuel_billing(f.estimate,f.execution_source,p_telemetry);');
 EXECUTE d;
END $migration$;