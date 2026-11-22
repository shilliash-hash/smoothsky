CREATE OR REPLACE FUNCTION public.dispatch_usable_range_pct() RETURNS double precision LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT coalesce((SELECT (value #>> '{}')::double precision FROM public.economy_config WHERE key='dispatch_usable_range_pct'),0.75) $$;
REVOKE ALL ON FUNCTION public.dispatch_usable_range_pct() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispatch_usable_range_pct() TO authenticated,service_role;
ALTER TABLE public.economy_config ADD CONSTRAINT dispatch_usable_range_pct_valid CHECK (key <> 'dispatch_usable_range_pct' OR (jsonb_typeof(value)='number' AND (value #>> '{}')::numeric BETWEEN 0.05 AND 1)) NOT VALID;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_dispatch_nearby_airports(uuid,integer[])'::regprocedure) INTO definition;
 IF position('SELECT f.company_id,t.range_nm,t.minimum_runway_ft' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected nearby function definition'; END IF;
 EXECUTE replace(definition,'SELECT f.company_id,t.range_nm,t.minimum_runway_ft','SELECT f.company_id,t.range_nm * public.dispatch_usable_range_pct() AS range_nm,t.minimum_runway_ft');
 SELECT pg_get_functiondef('public.get_dispatch_destination_deals(uuid,integer[],text,integer,boolean)'::regprocedure) INTO definition;
 IF position('s.distance_nm<=t.range_nm' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected deals function definition'; END IF;
 EXECUTE replace(definition,'s.distance_nm<=t.range_nm','s.distance_nm<=t.range_nm * public.dispatch_usable_range_pct()');
 SELECT pg_get_functiondef('public.get_destination_alternatives(uuid,text,numeric,integer[],integer,boolean)'::regprocedure) INTO definition;
 IF position('a.origin_nm<=t.range_nm' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected alternatives function definition'; END IF;
 EXECUTE replace(definition,'a.origin_nm<=t.range_nm','a.origin_nm<=t.range_nm * public.dispatch_usable_range_pct()');
END $migration$;
COMMENT ON FUNCTION public.dispatch_usable_range_pct() IS 'Dispatch discovery range fraction, default 0.75 when absent; stage one only, not a payload/fuel guarantee or dispatch/settlement validation.';