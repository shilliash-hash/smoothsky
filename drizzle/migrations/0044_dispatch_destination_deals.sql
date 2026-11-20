CREATE OR REPLACE FUNCTION public.dispatch_destination_estimate(p_aircraft_id uuid,p_destination text,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb;
BEGIN
 q:=public.flight_quote_full(p_aircraft_id,p_destination,p_cargo_kg,p_all_cargo);
 RETURN jsonb_build_object('estimated_revenue',q->'revenue','estimated_margin',q->'net','estimate_error',NULL);
EXCEPTION WHEN raise_exception THEN
 RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error',SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.dispatch_destination_estimate(uuid,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispatch_destination_estimate(uuid,text,integer,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_dispatch_destination_deals(p_aircraft_id uuid,p_tiers integer[] DEFAULT NULL,p_query text DEFAULT NULL,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS TABLE(airport jsonb,distance_nm double precision,is_fbo boolean,estimated_revenue numeric,estimated_margin numeric,estimate_error text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.fleet_aircraft%ROWTYPE; t public.aircraft_types%ROWTYPE; row record; q jsonb;
BEGIN
 SELECT a.* INTO f FROM public.fleet_aircraft a JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_aircraft_id AND c.user_id=(SELECT auth.uid()) AND a.returned_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 SELECT * INTO t FROM public.aircraft_types WHERE id=f.aircraft_type_id;
 IF p_cargo_kg<0 OR p_cargo_kg>100000 THEN RAISE EXCEPTION 'Invalid cargo amount'; END IF;
 FOR row IN
 SELECT n.* FROM public.get_dispatch_nearby_airports(p_aircraft_id,p_tiers) n WHERE nullif(trim(p_query),'') IS NULL
 UNION ALL
 SELECT s.* FROM public.search_airports(p_query,f.location_icao,coalesce(p_tiers,CASE WHEN t.tier>=3 THEN ARRAY[2,3,4,5,6,7] ELSE ARRAY[1,2,3,4,5,6,7] END),t.minimum_runway_ft,40) s WHERE nullif(trim(p_query),'') IS NOT NULL AND s.distance_nm<=t.range_nm AND s.airport->>'icao'<>f.location_icao
 LOOP
 q:=public.dispatch_destination_estimate(p_aircraft_id,row.airport->>'icao',p_cargo_kg,p_all_cargo);
 airport:=row.airport; distance_nm:=row.distance_nm;
 is_fbo:=EXISTS(SELECT 1 FROM public.company_fobs b WHERE b.company_id=f.company_id AND b.airport_icao=row.airport->>'icao' AND b.closed_at IS NULL);
 estimated_revenue:=(q->>'estimated_revenue')::numeric; estimated_margin:=(q->>'estimated_margin')::numeric; estimate_error:=q->>'estimate_error'; RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_destination_alternatives(p_aircraft_id uuid,p_target_icao text,p_radius_nm numeric DEFAULT 150,p_tiers integer[] DEFAULT NULL,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS TABLE(airport jsonb,distance_nm double precision,distance_from_target_nm double precision,estimated_revenue numeric,estimated_margin numeric,margin_diff_vs_target numeric,estimate_error text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.fleet_aircraft%ROWTYPE; t public.aircraft_types%ROWTYPE; o public.airports%ROWTYPE; target public.airports%ROWTYPE; radius double precision:=least(150,greatest(0,coalesce(p_radius_nm,150))); target_q jsonb;
BEGIN
 SELECT a.* INTO f FROM public.fleet_aircraft a JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_aircraft_id AND c.user_id=(SELECT auth.uid()) AND a.returned_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 IF p_cargo_kg<0 OR p_cargo_kg>100000 THEN RAISE EXCEPTION 'Invalid cargo amount'; END IF;
 SELECT * INTO t FROM public.aircraft_types WHERE id=f.aircraft_type_id;
 SELECT * INTO o FROM public.airports WHERE icao=f.location_icao;
 SELECT * INTO target FROM public.airports WHERE icao=p_target_icao;
 IF NOT FOUND THEN RAISE EXCEPTION 'Destination not found'; END IF;
 target_q:=public.dispatch_destination_estimate(p_aircraft_id,p_target_icao,p_cargo_kg,p_all_cargo);
 RETURN QUERY WITH candidates AS MATERIALIZED (
 SELECT a.*,public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon) origin_nm,public.airport_distance_nm(target.lat,target.lon,a.lat,a.lon) target_nm
 FROM public.airports a
 WHERE a.icao NOT IN(o.icao,target.icao)
 AND a.size=ANY(coalesce(p_tiers,CASE WHEN t.tier>=3 THEN ARRAY[2,3,4,5,6,7] ELSE ARRAY[1,2,3,4,5,6,7] END))
 AND (a.longest_runway_ft IS NULL OR a.longest_runway_ft>=t.minimum_runway_ft)
 AND a.lat BETWEEN target.lat-radius/60.0 AND target.lat+radius/60.0
 AND (abs(target.lat)+radius/60.0>=90 OR abs(mod((a.lon-target.lon+540)::numeric,360)-180)<=degrees(asin(least(1.0,sin(radius/3440.065)/nullif(cos(radians(target.lat)),0)))))
 ), chosen AS MATERIALIZED (
 SELECT a.* FROM candidates a WHERE a.target_nm<=radius AND a.origin_nm<=t.range_nm ORDER BY a.target_nm,a.icao LIMIT 6
 ), estimates AS MATERIALIZED (
 SELECT a.*,public.dispatch_destination_estimate(p_aircraft_id,a.icao,p_cargo_kg,p_all_cargo) q FROM chosen a
 )
 SELECT to_jsonb(a)-'origin_nm'-'target_nm'-'q',a.origin_nm,a.target_nm,(a.q->>'estimated_revenue')::numeric,(a.q->>'estimated_margin')::numeric,(a.q->>'estimated_margin')::numeric-(target_q->>'estimated_margin')::numeric,a.q->>'estimate_error'
 FROM estimates a ORDER BY (a.q->>'estimated_margin')::numeric DESC NULLS LAST,a.target_nm,a.icao;
END $$;
REVOKE ALL ON FUNCTION public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean) IS 'Owner-only bounded previews using existing quotes; does not mutate ledger or reserve supplies. Existing nearby/search signatures remain compatible.';
COMMENT ON FUNCTION public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean) IS 'Evaluates only the six closest eligible alternatives within at most 150 NM, then sorts these by estimated profit; not a worldwide profitability scan.';