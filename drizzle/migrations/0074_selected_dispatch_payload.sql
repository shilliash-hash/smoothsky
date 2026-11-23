-- Selected payload uses the existing frozen quote and transactional dispatch paths.
DO $patch$
DECLARE src text; old text;
BEGIN
 src:=pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
 old:='wb:=public.flight_weight_budget(t.id,nm);';
 IF position(old IN src)=0 THEN RAISE EXCEPTION 'Passenger demand anchor missing'; END IF;
 src:=replace(src,old,'rules:=rules || jsonb_build_object(''available_passengers'',pax); '||old);
 old:='pax:=least(pax,floor((wb->>''available_payload_kg'')::numeric/(wb->>''passenger_weight_kg'')::numeric)::int);';
 IF position(old IN src)=0 THEN RAISE EXCEPTION 'Passenger weight anchor missing'; END IF;
 src:=replace(src,old,old||' pax:=least(pax,greatest(0,coalesce(nullif(current_setting(''smoothsky.passengers'',true),'''')::int,pax)));');
 src:=replace(src,'''raw_passengers'',raw_pax','''available_passengers'',rules->''available_passengers'',''raw_passengers'',raw_pax');
 EXECUTE src;
END $patch$;
CREATE OR REPLACE FUNCTION public.set_selected_passengers(p_passengers integer)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
 IF p_passengers IS NOT NULL AND (p_passengers<0 OR p_passengers>1000) THEN RAISE EXCEPTION 'Invalid passenger count'; END IF;
 PERFORM set_config('smoothsky.passengers',coalesce(p_passengers::text,''),true);
END $$;
CREATE OR REPLACE FUNCTION public.flight_quote_loaded(p_aircraft uuid, p_destination text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL, p_passengers integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q jsonb; t public.aircraft_types%ROWTYPE; f public.fleet_aircraft%ROWTYPE; hd numeric; discount numeric; fare numeric; r public.operating_rules%ROWTYPE;
BEGIN
 PERFORM public.set_selected_passengers(CASE WHEN p_mission IS NULL THEN p_passengers END);
 q:=public.flight_quote_fueled(p_aircraft,p_destination,p_cargo_kg,p_all_cargo,p_mission,p_target_fuel_gal);
 PERFORM set_config('smoothsky.passengers','',true);
 SELECT * INTO f FROM public.fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM public.companies WHERE user_id=auth.uid());
 SELECT * INTO t FROM public.aircraft_types WHERE id=f.aircraft_type_id;
 SELECT * INTO r FROM public.operating_rules WHERE singleton;
 hd:=(coalesce((q->'fob_discounts'->>'handling_origin')::numeric,0)+coalesce((q->'fob_discounts'->>'handling_destination')::numeric,0))/2;
 discount:=CASE WHEN p_all_cargo THEN 1-r.cargo_airport_fee_discount ELSE 1 END;
 fare:=(q->>'distance_nm')::numeric*(q->'rules'->>'fare_per_nm')::numeric+(q->'short_hop_charter'->>'rate')::numeric;
 RETURN q||jsonb_build_object('payload_limits',jsonb_build_object(
 'max_passengers',CASE WHEN p_all_cargo OR p_mission IS NOT NULL THEN 0 ELSE (q->'demand'->>'available_passengers')::int END,
 'max_cargo_kg',floor(least(t.cargo_kg*CASE WHEN p_all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END,public.cargo_stock(f.location_icao))),
 'ticket_unit_revenue',fare*(1+coalesce((q->'demand'->>'hub_bonus')::numeric,0)),
 'cargo_unit_revenue',fare*r.cargo_pax_rate_ratio/100,
 'handling_rate_effective',public.economy_number('handling_rate')*2*(1-hd)*discount));
END $$;
CREATE OR REPLACE FUNCTION public.dispatch_flight_loaded(p_aircraft uuid, p_destination text, p_flight_number text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL, p_passengers integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE fid uuid;
BEGIN
 PERFORM public.set_selected_passengers(CASE WHEN p_mission IS NULL THEN p_passengers END);
 fid:=public.dispatch_flight_fueled(p_aircraft,p_destination,p_flight_number,p_cargo_kg,p_all_cargo,p_mission,p_target_fuel_gal);
 PERFORM set_config('smoothsky.passengers','',true);
 RETURN fid;
END $$;
CREATE OR REPLACE FUNCTION public.get_dispatch_destination_deals_loaded(p_aircraft_id uuid, p_tiers integer[] DEFAULT NULL, p_query text DEFAULT NULL, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_passengers integer DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL)
RETURNS TABLE(airport jsonb, distance_nm double precision, is_fbo boolean, estimated_revenue numeric, estimated_margin numeric, estimate_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 PERFORM public.set_selected_passengers(p_passengers);
 PERFORM public.set_target_fuel(p_aircraft_id,p_target_fuel_gal);
 RETURN QUERY SELECT * FROM public.get_dispatch_destination_deals(p_aircraft_id,p_tiers,p_query,p_cargo_kg,p_all_cargo);
 PERFORM set_config('smoothsky.passengers','',true);
 PERFORM set_config('smoothsky.target_fuel','',true);
END $$;
CREATE OR REPLACE FUNCTION public.get_destination_alternatives_loaded(p_aircraft_id uuid, p_target_icao text, p_radius_nm numeric DEFAULT 150, p_tiers integer[] DEFAULT NULL, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_passengers integer DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL)
RETURNS TABLE(airport jsonb, distance_nm double precision, distance_from_target_nm double precision, estimated_revenue numeric, estimated_margin numeric, margin_diff_vs_target numeric, estimate_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 PERFORM public.set_selected_passengers(p_passengers);
 PERFORM public.set_target_fuel(p_aircraft_id,p_target_fuel_gal);
 RETURN QUERY SELECT * FROM public.get_destination_alternatives(p_aircraft_id,p_target_icao,p_radius_nm,p_tiers,p_cargo_kg,p_all_cargo);
 PERFORM set_config('smoothsky.passengers','',true);
 PERFORM set_config('smoothsky.target_fuel','',true);
END $$;
REVOKE ALL ON FUNCTION public.set_selected_passengers(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flight_quote_loaded(uuid,text,integer,boolean,uuid,numeric,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_flight_loaded(uuid,text,text,integer,boolean,uuid,numeric,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dispatch_destination_deals_loaded(uuid,integer[],text,integer,boolean,integer,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_destination_alternatives_loaded(uuid,text,numeric,integer[],integer,boolean,integer,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flight_quote_loaded(uuid,text,integer,boolean,uuid,numeric,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_flight_loaded(uuid,text,text,integer,boolean,uuid,numeric,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dispatch_destination_deals_loaded(uuid,integer[],text,integer,boolean,integer,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_destination_alternatives_loaded(uuid,text,numeric,integer[],integer,boolean,integer,numeric) TO authenticated, service_role;