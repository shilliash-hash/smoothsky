CREATE OR REPLACE FUNCTION public.aircraft_physical_range_nm(p_type text) RETURNS double precision LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
DECLARE t aircraft_types%ROWTYPE; r operating_rules%ROWTYPE; density numeric; reserve numeric; usable numeric;
BEGIN
 SELECT * INTO t FROM aircraft_types WHERE id=p_type;
 IF NOT FOUND OR t.cruise_kts<=0 OR t.fuel_burn_gph<=0 OR t.empty_weight_kg<=0 OR t.mtow_kg<=t.empty_weight_kg THEN RETURN 0; END IF;
 SELECT * INTO r FROM operating_rules WHERE singleton;
 density:=CASE WHEN t.fuel_type='100LL' THEN r.avgas_kg_per_litre ELSE r.jeta_kg_per_litre END*3.785411784;
 reserve:=economy_number('fuel_reserve_minutes')/60*t.fuel_burn_gph;
 usable:=least(t.fuel_capacity_gal,(t.mtow_kg-t.empty_weight_kg)/nullif(density,0))-reserve;
 RETURN greatest(0,coalesce(usable,0)/t.fuel_burn_gph*t.cruise_kts);
END $f$;
REVOKE ALL ON FUNCTION public.aircraft_physical_range_nm(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aircraft_physical_range_nm(text) TO authenticated,service_role;
COMMENT ON FUNCTION public.aircraft_physical_range_nm(text) IS 'Max NM where trip + IFR reserve fuel fits tank capacity and MTOW with zero payload; dispatch discovery bound.';

CREATE OR REPLACE FUNCTION public.dispatch_destination_estimate(p_aircraft_id uuid,p_destination text,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; cap integer; ferry boolean:=coalesce(p_all_cargo,false) AND coalesce(p_cargo_kg,0)=0;
BEGIN
 SELECT floor(t.cargo_kg*(1+CASE WHEN p_all_cargo THEN coalesce((SELECT all_cargo_capacity_bonus FROM operating_rules WHERE singleton),0) ELSE 0 END))::int INTO cap
 FROM fleet_aircraft f JOIN aircraft_types t ON t.id=f.aircraft_type_id WHERE f.id=p_aircraft_id;
 q:=public.flight_quote_full(p_aircraft_id,p_destination,CASE WHEN ferry THEN 0 ELSE greatest(coalesce(p_cargo_kg,0),coalesce(cap,0)) END,p_all_cargo);
 IF NOT ferry AND coalesce((q->'weight_budget'->>'payload_kg')::numeric,0)<=0 THEN
  RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error','Ferry only: no payload capacity after fuel and reserve','available_payload_kg',q->'weight_budget'->'available_payload_kg');
 END IF;
 RETURN jsonb_build_object('estimated_revenue',q->'revenue','estimated_margin',q->'net','estimate_error',NULL,'passengers',q->'passengers','cargo_kg',q->'cargo_kg','available_payload_kg',q->'weight_budget'->'available_payload_kg');
EXCEPTION WHEN raise_exception THEN
 RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error',SQLERRM);
END $$;

DO $m$
DECLARE d text; o text;
BEGIN
 d:=pg_get_functiondef('public.get_dispatch_nearby_airports(uuid,integer[])'::regprocedure);
 o:='t.range_nm * public.dispatch_usable_range_pct() AS range_nm';
 IF position(o IN d)=0 THEN RAISE EXCEPTION 'nearby anchor'; END IF;
 EXECUTE replace(d,o,'public.aircraft_physical_range_nm(t.id) AS range_nm');
 d:=pg_get_functiondef('public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean)'::regprocedure);
 o:='s.distance_nm<=t.range_nm * public.dispatch_usable_range_pct()';
 IF position(o IN d)=0 THEN RAISE EXCEPTION 'deals anchor'; END IF;
 EXECUTE replace(d,o,'s.distance_nm<=public.aircraft_physical_range_nm(t.id)');
 d:=pg_get_functiondef('public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean)'::regprocedure);
 o:='a.origin_nm<=t.range_nm * public.dispatch_usable_range_pct()';
 IF position(o IN d)=0 THEN RAISE EXCEPTION 'alternatives anchor'; END IF;
 EXECUTE replace(d,o,'a.origin_nm<=public.aircraft_physical_range_nm(t.id)');
 d:=pg_get_functiondef('public.dispatch_flight(uuid,text)'::regprocedure);
 o:='lim := floor(rng * public.dispatch_usable_range_pct());';
 IF position(o IN d)=0 THEN RAISE EXCEPTION 'dispatch anchor'; END IF;
 EXECUTE replace(d,o,'lim := floor(public.aircraft_physical_range_nm(f.aircraft_type_id));');
END $m$;