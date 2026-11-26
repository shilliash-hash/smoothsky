CREATE OR REPLACE FUNCTION public.cancel_test_flight(p_flight uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE f flights%ROWTYPE; c uuid;
BEGIN
  SELECT co.id INTO c
    FROM public.companies co
    JOIN public.flights x ON x.company_id=co.id
   WHERE x.id=p_flight AND co.user_id=auth.uid()
   FOR UPDATE OF co;
  SELECT * INTO f FROM public.flights WHERE id=p_flight AND company_id=c FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF;
  IF f.status='CANCELLED' THEN RETURN; END IF;
  IF f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RAISE EXCEPTION 'Only active flights can be cancelled'; END IF;
  IF f.divert_state IS NOT NULL THEN PERFORM cancel_continuation(f); RETURN; END IF;
  UPDATE public.airport_passenger_pools
     SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now()
   WHERE airport_icao=f.origin_icao;
  UPDATE public.flights SET status='CANCELLED' WHERE id=f.id;
  UPDATE public.fleet_aircraft
     SET status=CASE WHEN ownership='RENTAL' THEN 'RETURNED' ELSE 'AVAILABLE' END,
         returned_at=CASE WHEN ownership='RENTAL' THEN now() ELSE returned_at END,
         reserved_by=NULL,
         reserved_until=NULL,
         location_icao=f.origin_icao
   WHERE id=f.aircraft_id;
END
$function$;