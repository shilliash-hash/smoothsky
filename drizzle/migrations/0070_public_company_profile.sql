CREATE OR REPLACE FUNCTION public.get_public_company_profile(p_icao_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE (
  SELECT jsonb_build_object(
    'name', c.name, 'icao_code', c.icao_code, 'is_supporter', c.is_supporter,
    'owner', coalesce(p.callsign, 'Captain'), 'is_me', c.user_id = auth.uid(),
    'hub', jsonb_build_object('icao', h.icao, 'name', h.name, 'lat', h.lat, 'lon', h.lon),
    'bases', coalesce((SELECT jsonb_agg(jsonb_build_object('icao', a.icao, 'name', a.name, 'lat', a.lat, 'lon', a.lon, 'base_type', f.base_type,
        'fuel', f.has_fuel_contract, 'handling', f.has_handling_desk, 'maintenance', f.has_maintenance_bay) ORDER BY f.created_at)
      FROM company_fobs f JOIN airports a ON a.icao = f.airport_icao WHERE f.company_id = c.id AND f.closed_at IS NULL), '[]'),
    'fleet', coalesce((SELECT jsonb_agg(jsonb_build_object('registration', fa.registration, 'model', t.manufacturer || ' ' || t.model,
        'ownership', fa.ownership, 'status', fa.status, 'location', fa.location_icao,
        'flight', (SELECT jsonb_build_object('origin', fl.origin_icao, 'destination', fl.destination_icao, 'status', fl.status)
                   FROM flights fl WHERE fl.aircraft_id = fa.id AND fl.status IN ('EN_ROUTE','DISPATCHED','DIVERTED') ORDER BY fl.created_at DESC LIMIT 1)) ORDER BY fa.registration)
      FROM fleet_aircraft fa JOIN aircraft_types t ON t.id = fa.aircraft_type_id WHERE fa.company_id = c.id AND fa.returned_at IS NULL), '[]'),
    'flights', coalesce((SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
      SELECT jsonb_build_object('flight_number', fl.flight_number, 'origin', fl.origin_icao, 'destination', fl.destination_icao,
        'olat', o.lat, 'olon', o.lon, 'dlat', d.lat, 'dlon', d.lon,
        'distance_nm', round(fl.distance_nm), 'registration', fa.registration, 'model', t.model,
        'pax', fl.passengers, 'cargo_kg', coalesce((fl.estimate->>'cargo_kg')::numeric, 0),
        'seats', t.pax, 'minutes', round(coalesce((fl.settlement->>'minutes')::numeric, fl.estimated_minutes)),
        'status', fl.status, 'date', coalesce(fl.completed_at, fl.departed_at, fl.created_at)) x
      FROM flights fl JOIN fleet_aircraft fa ON fa.id = fl.aircraft_id JOIN aircraft_types t ON t.id = fa.aircraft_type_id
        JOIN airports o ON o.icao = fl.origin_icao JOIN airports d ON d.icao = fl.destination_icao
      WHERE fl.company_id = c.id AND fl.status IN ('COMPLETED','EN_ROUTE','DISPATCHED','DIVERTED')
      ORDER BY coalesce(fl.completed_at, fl.departed_at, fl.created_at) DESC LIMIT 20) s), '[]'))
  FROM companies c JOIN airports h ON h.icao = c.home_base_icao LEFT JOIN profiles p ON p.id = c.user_id
  WHERE upper(c.icao_code) = upper(p_icao_code) AND c.is_personal = false) END
$$;
REVOKE ALL ON FUNCTION public.get_public_company_profile(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_public_company_profile(text) TO authenticated;