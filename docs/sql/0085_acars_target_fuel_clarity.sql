-- CR-08: manual production migration. No flight, tank or ledger data is changed.
-- Existing key-checked acars_connect uses this revoked helper; the gateway
-- already exposes its fields both in `flight` and at the response root.
BEGIN;

CREATE OR REPLACE FUNCTION public.acars_flight_json(f public.flights)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'flight_id', f.id,
    'flight_number', f.flight_number,
    'registration', a.registration,
    'aircraft_type', a.aircraft_type_id,
    'origin_icao', f.origin_icao,
    'destination_icao', f.destination_icao,
    'status', f.status,
    'execution_source', f.execution_source,
    'passengers', f.passengers,
    'distance_nm', f.distance_nm,
    'planned_fuel_gal', f.estimate->'fuel_gal',
    'target_fuel_gal', coalesce(
      (f.estimate->>'target_fuel_gal')::numeric,
      (f.estimate->'weight_budget'->>'planned_fuel_gal')::numeric,
      (f.estimate->>'fuel_gal')::numeric
    )
  ) FROM public.fleet_aircraft a WHERE a.id = f.aircraft_id;
$$;

REVOKE ALL ON FUNCTION public.acars_flight_json(public.flights) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acars_flight_json(public.flights) TO service_role;

COMMIT;