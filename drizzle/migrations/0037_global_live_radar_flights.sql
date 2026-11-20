CREATE INDEX IF NOT EXISTS flights_live_radar ON public.flights(id) WHERE status IN ('EN_ROUTE','DISPATCHED');
CREATE OR REPLACE FUNCTION public.get_live_radar_flights()
RETURNS TABLE(id uuid, flight_number text, origin_icao text, destination_icao text, status text, execution_source text, last_lat double precision, last_lon double precision, last_altitude_ft double precision, last_groundspeed_kts double precision, last_heading double precision, last_telemetry_at timestamptz, departed_at timestamptz, eta_at timestamptz, airline_name text, aircraft_model text, registration text, origin_lat double precision, origin_lon double precision, destination_lat double precision, destination_lon double precision, is_own boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT f.id,f.flight_number,f.origin_icao,f.destination_icao,f.status,f.execution_source,
 (f.telemetry->'live'->>'lat')::double precision,
 (f.telemetry->'live'->>'lon')::double precision,
 (f.telemetry->'live'->>'altitude_ft')::double precision,
 (f.telemetry->'live'->>'ground_speed_kt')::double precision,
 (f.telemetry->'live'->>'heading')::double precision,
 (f.telemetry->'live'->>'received_at')::timestamptz,
 f.departed_at,
 f.departed_at + make_interval(secs => (f.estimated_minutes*60 / CASE WHEN f.execution_source='WEB_MANUAL' THEN greatest(1,coalesce((f.rules_snapshot->>'simulation_time_scale')::numeric,1)) ELSE 1 END)::double precision),
 c.name,t.model,a.registration,o.lat,o.lon,d.lat,d.lon,
 coalesce(auth.uid() IS NOT NULL AND (c.user_id=auth.uid() OR f.pilot_id=auth.uid()),false)
 FROM public.flights f
 JOIN public.companies c ON c.id=f.company_id
 JOIN public.fleet_aircraft a ON a.id=f.aircraft_id
 JOIN public.aircraft_types t ON t.id=a.aircraft_type_id
 JOIN public.airports o ON o.icao=f.origin_icao
 JOIN public.airports d ON d.icao=f.destination_icao
 WHERE f.status IN ('EN_ROUTE','DISPATCHED')
$$;
REVOKE ALL ON FUNCTION public.get_live_radar_flights() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_radar_flights() TO anon,authenticated,service_role;
COMMENT ON FUNCTION public.get_live_radar_flights() IS 'Public active-flight projection only; no account identifiers, economics or full telemetry. is_own is derived from verified caller identity.';