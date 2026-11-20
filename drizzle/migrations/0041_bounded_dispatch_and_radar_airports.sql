CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS airports_lat_lon_idx ON public.airports(lat,lon);
CREATE INDEX IF NOT EXISTS airports_size_idx ON public.airports(size);
CREATE INDEX IF NOT EXISTS airports_icao_upper_idx ON public.airports(upper(icao) text_pattern_ops);
CREATE INDEX IF NOT EXISTS airports_iata_upper_idx ON public.airports(upper(iata) text_pattern_ops);
CREATE INDEX IF NOT EXISTS airports_search_trgm_idx ON public.airports USING gin ((icao || ' ' || coalesce(iata,'') || ' ' || name || ' ' || city) extensions.gin_trgm_ops);
CREATE OR REPLACE FUNCTION public.airport_distance_nm(a_lat double precision,a_lon double precision,b_lat double precision,b_lon double precision) RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$ SELECT 2*3440.065*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(b_lat-a_lat)/2),2)+cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lon-a_lon)/2),2))))) $$;
CREATE OR REPLACE FUNCTION public.get_dispatch_nearby_airports(p_aircraft_id uuid,p_tiers integer[] DEFAULT NULL) RETURNS TABLE(airport jsonb,distance_nm double precision,is_fbo boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH aircraft AS MATERIALIZED (
 SELECT f.company_id,t.range_nm,t.minimum_runway_ft,t.tier,o.icao,o.lat,o.lon
 FROM public.fleet_aircraft f JOIN public.companies c ON c.id=f.company_id JOIN public.aircraft_types t ON t.id=f.aircraft_type_id JOIN public.airports o ON o.icao=f.location_icao
 WHERE f.id=p_aircraft_id AND c.user_id=(SELECT auth.uid()) AND f.returned_at IS NULL
), candidates AS (
 SELECT to_jsonb(a) airport,public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon) distance_nm,
 EXISTS(SELECT 1 FROM public.company_fobs b WHERE b.company_id=o.company_id AND b.airport_icao=a.icao AND b.closed_at IS NULL) is_fbo,o.range_nm
 FROM aircraft o JOIN public.airports a ON a.icao<>o.icao
 WHERE a.size=ANY(coalesce(p_tiers,CASE WHEN o.tier>=3 THEN ARRAY[2,3,4,5,6,7] ELSE ARRAY[1,2,3,4,5,6,7] END))
 AND (a.longest_runway_ft IS NULL OR a.longest_runway_ft>=o.minimum_runway_ft)
 AND a.lat BETWEEN o.lat-o.range_nm/60.0 AND o.lat+o.range_nm/60.0
 AND (abs(o.lat)+o.range_nm/60.0>=90 OR abs(mod((a.lon-o.lon+540)::numeric,360)-180)<=degrees(asin(least(1.0,sin(o.range_nm/3440.065)/nullif(cos(radians(o.lat)),0)))))
), chosen AS (SELECT * FROM candidates WHERE distance_nm<=range_nm ORDER BY is_fbo DESC,distance_nm,airport->>'icao' LIMIT 60)
SELECT airport,distance_nm,is_fbo FROM chosen ORDER BY distance_nm,airport->>'icao'
$$;
REVOKE ALL ON FUNCTION public.get_dispatch_nearby_airports(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_dispatch_nearby_airports(uuid,integer[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.search_airports(p_query text,p_origin_icao text DEFAULT NULL,p_tiers integer[] DEFAULT ARRAY[1,2,3,4,5,6,7],p_min_runway_ft integer DEFAULT 0,p_limit integer DEFAULT 40) RETURNS TABLE(airport jsonb,distance_nm double precision,is_fbo boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH q AS (SELECT upper(left(trim(p_query),60)) term), origin AS (SELECT lat,lon FROM public.airports WHERE icao=p_origin_icao)
SELECT to_jsonb(a),public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon),false
FROM public.airports a CROSS JOIN q LEFT JOIN origin o ON true
WHERE length(q.term)>=2 AND a.size=ANY(p_tiers) AND (a.longest_runway_ft IS NULL OR a.longest_runway_ft>=p_min_runway_ft)
AND (a.icao || ' ' || coalesce(a.iata,'') || ' ' || a.name || ' ' || a.city) ILIKE '%' || replace(replace(replace(q.term,'\','\\'),'%','\%'),'_','\_') || '%'
ORDER BY (upper(a.icao)=q.term OR upper(a.iata)=q.term) DESC,
(upper(a.icao) LIKE q.term || '%' OR upper(a.iata) LIKE q.term || '%') DESC,
public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon) ASC NULLS LAST,a.size DESC,a.icao
LIMIT least(40,greatest(0,p_limit))
$$;
REVOKE ALL ON FUNCTION public.search_airports(text,text,integer[],integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_airports(text,text,integer[],integer,integer) TO anon,authenticated,service_role;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.radar_airport_metrics()'::regprocedure) INTO definition;
 definition:=replace(definition,'public.radar_airport_metrics()','public.radar_airport_metrics(p_icaos text[])');
 definition:=replace(definition,'WHERE (SELECT auth.uid()) IS NOT NULL','WHERE (SELECT auth.uid()) IS NOT NULL AND a.icao=ANY(p_icaos)');
 definition:=replace(definition,'WHERE created_at>=','WHERE origin_icao=ANY(p_icaos) AND created_at>=');
 definition:=replace(definition,'WHERE completed_at>=','WHERE destination_icao=ANY(p_icaos) AND completed_at>=');
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.radar_airport_metrics(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.radar_airport_metrics(text[]) TO authenticated,service_role;