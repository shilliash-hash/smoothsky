CREATE OR REPLACE FUNCTION public.get_public_leaderboard()
RETURNS TABLE(company_name text, icao_code text, home_base_icao text, home_base_name text, is_supporter boolean, net_worth numeric, flight_count bigint, flight_hours numeric, passengers bigint, rank bigint, prev_week_rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE current_week date := date_trunc('week',now() AT TIME ZONE 'UTC')::date;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
PERFORM pg_advisory_xact_lock(73920461);
IF NOT EXISTS (SELECT 1 FROM public.leaderboard_weekly_snapshots s WHERE s.week_start=current_week) THEN
  INSERT INTO public.leaderboard_weekly_snapshots(week_start,company_id,rank)
  SELECT current_week,t.company_id,row_number() OVER(ORDER BY t.net_worth DESC,t.icao_code)::integer FROM public.leaderboard_totals() t;
  UPDATE public.companies c SET prev_week_rank=(SELECT s.rank FROM public.leaderboard_weekly_snapshots s WHERE s.company_id=c.id AND s.week_start=current_week-7)
  WHERE EXISTS(SELECT 1 FROM public.leaderboard_weekly_snapshots current_snapshot WHERE current_snapshot.company_id=c.id AND current_snapshot.week_start=current_week);
END IF;
RETURN QUERY SELECT t.company_name,t.icao_code,t.home_base_icao,t.home_base_name,t.is_supporter,t.net_worth,t.flight_count,t.flight_hours,t.passengers,row_number() OVER(ORDER BY t.net_worth DESC,t.icao_code),c.prev_week_rank FROM public.leaderboard_totals() t JOIN public.companies c ON c.id=t.company_id ORDER BY t.net_worth DESC,t.icao_code;
END;
$$;