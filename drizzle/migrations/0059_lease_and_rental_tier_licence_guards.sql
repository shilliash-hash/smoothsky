CREATE OR REPLACE FUNCTION public.assert_aircraft_tier_license(p_tier integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ratings integer[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_tier <= 3 THEN RETURN; END IF;
  SELECT type_ratings INTO ratings FROM public.profiles WHERE id=auth.uid() FOR SHARE;
  IF NOT FOUND OR NOT coalesce(p_tier=ANY(ratings),false) THEN RAISE EXCEPTION 'Requires Tier % license',p_tier; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_aircraft_tier_license(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_aircraft_tier_license(integer) TO authenticated;
DO $$
DECLARE d text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.sign_lease(text,integer)'::regprocedure) INTO d;
  needle := 'IF NOT FOUND THEN RAISE EXCEPTION ''Unknown or inactive aircraft''; END IF;';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'Cannot locate lease aircraft guard'; END IF;
  EXECUTE replace(d,needle,needle || ' PERFORM public.assert_aircraft_tier_license(t.tier);');
  SELECT pg_get_functiondef('public.rent_aircraft(text,text)'::regprocedure) INTO d;
  needle := 'IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND t.tier=ANY(type_ratings)) THEN RAISE EXCEPTION ''Requires Tier % license'',t.tier; END IF;';
  IF position(needle IN d)=0 THEN RAISE EXCEPTION 'Cannot locate rental tier guard'; END IF;
  EXECUTE replace(d,needle,'PERFORM public.assert_aircraft_tier_license(t.tier);');
END;
$$;