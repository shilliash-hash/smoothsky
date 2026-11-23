CREATE OR REPLACE FUNCTION public.dispatch_flight(p_aircraft uuid, p_destination text, p_flight_number text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE fid uuid;
BEGIN
 fid:=public.dispatch_flight(p_aircraft,p_destination);
 UPDATE public.flights SET flight_number=p_flight_number WHERE id=fid;
 RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_destination_estimate(p_aircraft_id uuid,p_destination text,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q jsonb; ferry boolean:=coalesce(p_all_cargo,false) AND coalesce(p_cargo_kg,0)=0;
BEGIN
 q:=public.flight_quote_full(p_aircraft_id,p_destination,greatest(coalesce(p_cargo_kg,0),0),p_all_cargo);
 IF NOT ferry AND coalesce((q->'weight_budget'->>'payload_kg')::numeric,0)<=0 THEN
 RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error','Ferry only');
 END IF;
 RETURN jsonb_build_object('estimated_revenue',q->'revenue','estimated_margin',q->'net','estimate_error',NULL);
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_flight_full(p_aircraft uuid, p_destination text, p_flight_number text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE fid uuid; origin text; est jsonb;
BEGIN
  SELECT location_icao INTO origin FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN (SELECT id FROM companies WHERE user_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
  IF p_mission IS NOT NULL THEN
    PERFORM 1 FROM special_missions WHERE id=p_mission AND accepted_by=auth.uid() AND status='ACCEPTED' AND flight_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mission not available for dispatch'; END IF;
  ELSE
    INSERT INTO airport_cargo_pools(airport_icao,cargo_pool_kg) VALUES (origin, cargo_stock(origin)) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM airport_cargo_pools WHERE airport_icao=origin FOR UPDATE;
  END IF;
  PERFORM set_config('smoothsky.cargo', jsonb_build_object('cargo_kg',coalesce(p_cargo_kg,0),'all_cargo',coalesce(p_all_cargo,false),'mission',p_mission)::text, true);
  fid := dispatch_flight(p_aircraft, p_destination, p_flight_number);
  PERFORM set_config('smoothsky.cargo', '', true);
  SELECT estimate INTO est FROM flights WHERE id=fid;
  IF p_mission IS NOT NULL THEN
    UPDATE special_missions SET flight_id=fid WHERE id=p_mission;
  ELSIF coalesce((est->>'cargo_kg')::numeric,0) > 0 THEN
    UPDATE airport_cargo_pools SET cargo_pool_kg=greatest(0,cargo_stock(origin)-(est->>'cargo_kg')::numeric), updated_at=now() WHERE airport_icao=origin;
  END IF;
  RETURN fid;
END $function$;
