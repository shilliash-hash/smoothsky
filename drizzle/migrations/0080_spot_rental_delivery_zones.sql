CREATE OR REPLACE FUNCTION public.spot_rental_cfg(p_key text, p_default numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT nullif(value::text,'')::numeric FROM economy_config WHERE key=p_key), p_default) $$;

CREATE OR REPLACE FUNCTION public.spot_rental_delivery_zone(p_company uuid, p_icao text)
RETURNS TABLE(zone text, fee_pct numeric, anchor_icao text, distance_nm double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH cfg AS (SELECT spot_rental_cfg('spot_positioning_fee_pct',0.10) fee, spot_rental_cfg('spot_main_radius_nm',100) rmain, spot_rental_cfg('spot_satellite_radius_nm',60) rsat),
anchors AS (
  SELECT c.home_base_icao icao, 'MAIN'::text kind FROM companies c WHERE c.id=p_company
  UNION
  SELECT f.airport_icao, 'SATELLITE' FROM company_fobs f JOIN companies c ON c.id=f.company_id
   WHERE f.company_id=p_company AND f.closed_at IS NULL AND f.airport_icao<>c.home_base_icao
), target AS (SELECT * FROM airports WHERE icao=upper(trim(p_icao))),
cand AS (
  SELECT a.kind, a.icao, airport_distance_nm(b.lat,b.lon,t.lat,t.lon) d
  FROM anchors a JOIN airports b ON b.icao=a.icao CROSS JOIN target t
)
SELECT * FROM (
  SELECT CASE WHEN d<0.01 OR icao=upper(trim(p_icao)) THEN kind ELSE 'EXTENDED' END,
         CASE WHEN icao=upper(trim(p_icao)) THEN 0 ELSE (SELECT fee FROM cfg) END,
         icao, CASE WHEN icao=upper(trim(p_icao)) THEN 0 ELSE d END
  FROM cand, cfg
  WHERE icao=upper(trim(p_icao)) OR d <= CASE WHEN kind='MAIN' THEN cfg.rmain ELSE cfg.rsat END
  ORDER BY (icao=upper(trim(p_icao))) DESC, (kind='MAIN') DESC, d
  LIMIT 1) z
$$;
REVOKE ALL ON FUNCTION public.spot_rental_delivery_zone(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spot_rental_delivery_zone(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.spot_rental_delivery_options(p_type text, p_query text DEFAULT '')
RETURNS TABLE(icao text, name text, city text, country text, longest_runway_ft integer, zone text, fee_pct numeric, anchor_icao text, distance_nm double precision, runway_ok boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; minrw integer; rmax numeric := greatest(spot_rental_cfg('spot_main_radius_nm',100), spot_rental_cfg('spot_satellite_radius_nm',60)); q text := upper(left(trim(coalesce(p_query,'')),60));
BEGIN
  SELECT id INTO cid FROM companies WHERE user_id=auth.uid() AND NOT is_personal;
  IF cid IS NULL THEN RETURN; END IF;
  SELECT minimum_runway_ft INTO minrw FROM aircraft_types WHERE id=p_type;
  RETURN QUERY
  WITH anchors AS (
    SELECT c.home_base_icao ai FROM companies c WHERE c.id=cid
    UNION SELECT f.airport_icao FROM company_fobs f WHERE f.company_id=cid AND f.closed_at IS NULL
  ), near AS (
    SELECT DISTINCT a.icao FROM anchors x JOIN airports b ON b.icao=x.ai JOIN airports a
      ON a.lat BETWEEN b.lat - rmax/60.0 AND b.lat + rmax/60.0
     AND a.lon BETWEEN b.lon - rmax/(60.0*greatest(cos(radians(b.lat)),0.05)) AND b.lon + rmax/(60.0*greatest(cos(radians(b.lat)),0.05))
  )
  SELECT a.icao, a.name, a.city, a.country, a.longest_runway_ft, z.zone, z.fee_pct, z.anchor_icao, z.distance_nm,
         (a.longest_runway_ft IS NULL OR minrw IS NULL OR a.longest_runway_ft >= minrw)
  FROM near n JOIN airports a ON a.icao=n.icao
  CROSS JOIN LATERAL spot_rental_delivery_zone(cid, a.icao) z
  WHERE (q='' OR a.icao LIKE q||'%' OR upper(coalesce(a.name,'')) LIKE '%'||q||'%' OR upper(coalesce(a.city,'')) LIKE '%'||q||'%' OR upper(coalesce(a.iata,''))=q)
  ORDER BY z.fee_pct, (a.longest_runway_ft IS NULL OR minrw IS NULL OR a.longest_runway_ft >= minrw) DESC, z.distance_nm, a.icao
  LIMIT 40;
END $$;
REVOKE ALL ON FUNCTION public.spot_rental_delivery_options(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spot_rental_delivery_options(text,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rent_aircraft(text,text);
CREATE OR REPLACE FUNCTION public.rent_aircraft(p_type text, p_registration text DEFAULT NULL, p_airport_icao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE c companies%ROWTYPE; t aircraft_types%ROWTYPE; ap airports%ROWTYPE; z record; base numeric; fee numeric; price numeric; fid uuid:=gen_random_uuid(); reg text; dest text; descr text;
BEGIN
 SELECT * INTO c FROM companies WHERE user_id=auth.uid() AND NOT is_personal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Airline company required'; END IF;
 PERFORM process_due_obligations(); PERFORM assert_company_investment(); PERFORM ensure_my_profile();
 SELECT * INTO t FROM aircraft_types WHERE id=p_type AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive aircraft'; END IF;
 PERFORM public.assert_aircraft_tier_license(t.tier);
 dest := upper(trim(coalesce(nullif(trim(p_airport_icao),''), c.home_base_icao)));
 SELECT * INTO ap FROM airports WHERE icao=dest;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown delivery airport %', dest; END IF;
 SELECT * INTO z FROM spot_rental_delivery_zone(c.id, dest);
 IF z.zone IS NULL THEN RAISE EXCEPTION 'Delivery airport % is outside operational reach — max % NM from Main Hub or % NM from a Satellite FBO', dest, spot_rental_cfg('spot_main_radius_nm',100), spot_rental_cfg('spot_satellite_radius_nm',60); END IF;
 IF z.zone='EXTENDED' AND ap.longest_runway_ft IS NOT NULL AND t.minimum_runway_ft IS NOT NULL AND ap.longest_runway_ft < t.minimum_runway_ft THEN
   RAISE EXCEPTION 'Runway too short at % (required % ft, airport % ft)', dest, t.minimum_runway_ft, ap.longest_runway_ft; END IF;
 base := spot_rental_price(t.weekly_rate);
 fee := round(base * z.fee_pct, 2);
 price := base + fee;
 IF price<0 OR company_balance(c.id)<price THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF;
 PERFORM pg_advisory_xact_lock(814503); reg:=aircraft_registration(p_type,p_registration);
 INSERT INTO fleet_aircraft(id,company_id,aircraft_type_id,registration,location_icao,ownership,lease_deposit,weekly_rate,purchase_price,next_payment_due) VALUES(fid,c.id,t.id,reg,dest,'RENTAL',0,0,0,now());
 descr := 'Single-flight rental – '||reg||CASE WHEN z.zone='EXTENDED' THEN ' · Delivery to '||dest||' (+'||round(z.fee_pct*100)||'% positioning fee)' ELSE ' · Base delivery '||dest END;
 PERFORM company_post(c.id,'SPOT_RENTAL','RENTAL_EXPENSE','COMPANY_CASH',-price,descr,reg,'spot_rental:'||fid);
 RETURN fid;
END $function$;
REVOKE ALL ON FUNCTION public.rent_aircraft(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rent_aircraft(text,text,text) TO authenticated, service_role;