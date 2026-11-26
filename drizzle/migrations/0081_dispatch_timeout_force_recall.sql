CREATE OR REPLACE FUNCTION public.recall_stale_dispatches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  timeout_hours numeric := economy_number_or('dispatch_timeout_hours', 3);
  telemetry_grace_minutes numeric := economy_number_or('dispatch_telemetry_grace_minutes', 30);
  f record;
  recalled integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  IF timeout_hours <= 0 OR telemetry_grace_minutes <= 0 THEN
    RAISE EXCEPTION 'Dispatch timeout settings must be positive';
  END IF;

  -- Match ACARS lock order (company, then flight) so a position report cannot
  -- race this cleanup into cancelling a flight that has just started.
  PERFORM 1 FROM public.companies WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;

  FOR f IN
    SELECT x.id
    FROM public.flights x
    JOIN public.companies c ON c.id=x.company_id
    WHERE c.user_id=auth.uid()
      AND x.status='DISPATCHED'
      AND x.divert_state IS NULL
      AND x.departed_at IS NULL
      AND x.created_at < now()-make_interval(hours => timeout_hours::double precision)
      AND (
        x.telemetry->'live'->>'received_at' IS NULL
        OR (x.telemetry->'live'->>'received_at')::timestamptz
          < now()-make_interval(mins => telemetry_grace_minutes::double precision)
      )
    ORDER BY x.created_at, x.id
    FOR UPDATE OF x
  LOOP
    PERFORM public.cancel_test_flight(f.id);
    UPDATE public.flights
       SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object(
         'recall_reason','DISPATCH_TIMEOUT','recalled_at',now()
       )
     WHERE id=f.id;
    recalled:=recalled+1;
  END LOOP;
  RETURN recalled;
END
$function$;

REVOKE ALL ON FUNCTION public.recall_stale_dispatches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recall_stale_dispatches() TO service_role;

CREATE OR REPLACE FUNCTION public.process_due_obligations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cid uuid;
BEGIN
  PERFORM process_due_obligations_core();
  PERFORM recall_stale_dispatches();
  SELECT id INTO cid FROM companies WHERE user_id=auth.uid();
  IF cid IS NOT NULL THEN PERFORM pay_due_dividends(cid); END IF;
END
$function$;