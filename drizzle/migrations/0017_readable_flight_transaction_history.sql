DO $migration$
DECLARE definition text; old_description text := 'item.kind||'' – ''||f.origin_icao||'' → ''||f.destination_icao';
BEGIN
 SELECT pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,old_description)=0 THEN RAISE EXCEPTION 'Settlement description expression changed; review required'; END IF;
 definition := replace(definition,old_description,'item.kind||'' – ''||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||'' · ''||f.origin_icao||'' → ''||f.destination_icao||'' (#''||left(f.id::text,8)||'')''');
 EXECUTE definition;
END $migration$;
CREATE OR REPLACE FUNCTION public.transaction_history(p_company uuid, p_aircraft uuid DEFAULT NULL)
RETURNS TABLE(id bigint, entry_type text, debit_account text, credit_account text, company_delta numeric, balance_after numeric, description text, reference text, created_at timestamptz, aircraft_id uuid, registration text, flight_id uuid, origin_icao text, destination_icao text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $function$
 SELECT l.id,l.entry_type,l.debit_account,l.credit_account,l.company_delta,l.balance_after,l.description,l.reference,l.created_at,a.id,a.registration,f.id,f.origin_icao,f.destination_icao
 FROM public.company_ledger l
 LEFT JOIN public.flights f ON l.reference=f.id::text AND f.company_id=l.company_id
 LEFT JOIN public.fleet_aircraft a ON a.company_id=l.company_id AND (a.id=f.aircraft_id OR (f.id IS NULL AND a.registration=l.reference))
 WHERE l.company_id=p_company AND EXISTS(SELECT 1 FROM public.companies c WHERE c.id=l.company_id AND c.user_id=auth.uid()) AND (p_aircraft IS NULL OR a.id=p_aircraft)
 ORDER BY l.id DESC LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.transaction_history(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_history(uuid,uuid) TO authenticated;