CREATE INDEX IF NOT EXISTS fleet_radar_ground_location_idx ON public.fleet_aircraft(location_icao) WHERE returned_at IS NULL AND status <> 'EN_ROUTE';
CREATE INDEX IF NOT EXISTS airports_radar_size_icao_idx ON public.airports(size DESC, icao);
CREATE OR REPLACE FUNCTION public.get_radar_world_activity()
RETURNS TABLE(icao text, flights_7d bigint, grounded_aircraft_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH activity AS (
 SELECT port, count(*) AS total FROM (
  SELECT origin_icao AS port FROM public.flights WHERE created_at >= now() - interval '7 days' AND status <> 'CANCELLED'
  UNION ALL
  SELECT destination_icao FROM public.flights WHERE completed_at >= now() - interval '7 days' AND status = 'COMPLETED'
 ) events GROUP BY port
), ground AS (
 SELECT location_icao AS port, count(*) AS total FROM public.fleet_aircraft
 WHERE returned_at IS NULL AND status <> 'EN_ROUTE' GROUP BY location_icao
)
SELECT coalesce(a.port,g.port), coalesce(a.total,0), coalesce(g.total,0)
FROM activity a FULL JOIN ground g USING (port)
ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.get_radar_world_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_radar_world_activity() TO anon, authenticated, service_role;