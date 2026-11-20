CREATE OR REPLACE FUNCTION public.spot_rental_price(p_weekly numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public
AS $$ SELECT round(p_weekly * coalesce((SELECT (value #>> '{}')::numeric FROM public.economy_config WHERE key='spot_rental_multiplier'), 0.20)) $$;
COMMENT ON FUNCTION public.spot_rental_price(numeric) IS 'Single-flight rental price using the live economy multiplier; existing ledger charges and settlement remain unchanged.';