CREATE OR REPLACE FUNCTION public.economy_number_or(p_key text, p_default numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce((SELECT CASE WHEN jsonb_typeof(value)='number' THEN (value #>> '{}')::numeric WHEN jsonb_typeof(value)='string' AND (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (value #>> '{}')::numeric END FROM economy_config WHERE key=p_key), p_default) $$;
REVOKE ALL ON FUNCTION public.economy_number_or(text,numeric) FROM PUBLIC, anon;
DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.pay_due_dividends(uuid)'::regprocedure) INTO d;
EXECUTE replace(d,'coalesce(economy_number(''stake_dividend_payout''),0.5)','economy_number_or(''stake_dividend_payout'',0.5)');
SELECT pg_get_functiondef('public.pilot_flight_action(text,uuid,text,text,uuid)'::regprocedure) INTO d;
EXECUTE replace(d,'coalesce(economy_number(''aircraft_reservation_minutes''),20)','economy_number_or(''aircraft_reservation_minutes'',20)');
END $$;