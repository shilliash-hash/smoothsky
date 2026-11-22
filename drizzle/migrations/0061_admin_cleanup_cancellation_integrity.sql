CREATE OR REPLACE FUNCTION public.admin_cancel_cleanup_flights(p_flight_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.flights%ROWTYPE; owner_id uuid; old_claims text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 FOR f IN SELECT * FROM public.flights WHERE id=ANY(p_flight_ids) AND status IN ('DISPATCHED','EN_ROUTE') ORDER BY id FOR UPDATE LOOP
  SELECT user_id INTO owner_id FROM public.companies WHERE id=f.company_id;
  -- Refund triggers use owner-scoped company_balance; retain the administrator identity outside this cancellation.
  old_claims:=public.act_as(owner_id);
  UPDATE public.airport_passenger_pools SET stock=public.passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;
  UPDATE public.flights SET status='CANCELLED' WHERE id=f.id;
  UPDATE public.fleet_aircraft SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;
  PERFORM set_config('request.jwt.claims',old_claims,true);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.admin_cancel_cleanup_flights(uuid[]) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.admin_cleanup_company(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'UPDATE public.flights SET status=''CANCELLED'' WHERE id=ANY(flight_ids) AND status IN (''DISPATCHED'',''EN_ROUTE'');','PERFORM public.admin_cancel_cleanup_flights(flight_ids);');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.admin_delete_user_and_company(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'UPDATE public.flights SET status=''CANCELLED'' WHERE pilot_id=p_user_id AND status IN (''DISPATCHED'',''EN_ROUTE'');','PERFORM public.admin_cancel_cleanup_flights(ARRAY(SELECT id FROM public.flights WHERE pilot_id=p_user_id AND status IN (''DISPATCHED'',''EN_ROUTE'')));');
 definition:=replace(definition,'UPDATE public.fleet_aircraft SET status=''AVAILABLE'' WHERE id IN (SELECT aircraft_id FROM public.flights WHERE pilot_id=p_user_id AND status=''CANCELLED'') AND returned_at IS NULL AND status IN (''DISPATCHED'',''EN_ROUTE'');','');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.admin_company_supporters()'::regprocedure) INTO definition;
 definition:=replace(definition,'FROM public.companies c;','FROM public.companies c WHERE c.is_personal=false;');
 EXECUTE definition;
END $$;