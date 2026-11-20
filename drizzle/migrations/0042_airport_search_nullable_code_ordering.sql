ALTER FUNCTION public.airport_distance_nm(double precision,double precision,double precision,double precision) STRICT;
CREATE OR REPLACE FUNCTION public.search_airports(p_query text,p_origin_icao text DEFAULT NULL,p_tiers integer[] DEFAULT ARRAY[1,2,3,4,5,6,7],p_min_runway_ft integer DEFAULT 0,p_limit integer DEFAULT 40) RETURNS TABLE(airport jsonb,distance_nm double precision,is_fbo boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH q AS (SELECT upper(left(trim(p_query),60)) term), origin AS (SELECT lat,lon FROM public.airports WHERE icao=p_origin_icao)
SELECT to_jsonb(a),public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon),false
FROM public.airports a CROSS JOIN q LEFT JOIN origin o ON true
WHERE length(q.term)>=2 AND a.size=ANY(p_tiers) AND (a.longest_runway_ft IS NULL OR a.longest_runway_ft>=p_min_runway_ft)
AND (a.icao || ' ' || coalesce(a.iata,'') || ' ' || a.name || ' ' || a.city) ILIKE '%' || replace(replace(replace(q.term,'\','\\'),'%','\%'),'_','\_') || '%'
ORDER BY coalesce(upper(a.icao)=q.term OR upper(a.iata)=q.term,false) DESC,
coalesce(upper(a.icao) LIKE q.term || '%' OR upper(a.iata) LIKE q.term || '%',false) DESC,
public.airport_distance_nm(o.lat,o.lon,a.lat,a.lon) ASC NULLS LAST,a.size DESC,a.icao
LIMIT least(40,greatest(0,p_limit))
$$;