ALTER TABLE public.companies ADD COLUMN is_supporter boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN prev_week_rank integer;
CREATE TABLE public.leaderboard_weekly_snapshots (
  week_start date NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  PRIMARY KEY (week_start, company_id)
);
GRANT ALL ON public.leaderboard_weekly_snapshots TO service_role;
ALTER TABLE public.leaderboard_weekly_snapshots ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.leaderboard_weekly_snapshots IS 'Weekly ranking captured on first leaderboard read in each UTC week; no direct player access.';
CREATE FUNCTION public.leaderboard_totals()
RETURNS TABLE(company_id uuid, company_name text, icao_code text, home_base_icao text, home_base_name text, is_supporter boolean, net_worth numeric, flight_count bigint, flight_hours numeric, passengers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH cash AS (SELECT DISTINCT ON (company_id) company_id,balance_after FROM public.company_ledger ORDER BY company_id,id DESC),
fleet AS (SELECT company_id,sum(CASE WHEN ownership='OWNED' THEN purchase_price ELSE lease_deposit END) AS assets FROM public.fleet_aircraft WHERE returned_at IS NULL GROUP BY company_id),
bases AS (SELECT b.company_id,sum(l.amount) AS assets FROM public.company_fobs b JOIN public.company_ledger l ON l.company_id=b.company_id AND l.reference=b.id::text AND l.entry_type IN ('FOB_SETUP','FOB_MODULE') WHERE b.closed_at IS NULL GROUP BY b.company_id),
operations AS (SELECT company_id,count(*) AS flights,sum(coalesce((settlement->>'minutes')::numeric,estimated_minutes))/60 AS hours,sum(passengers)::bigint AS pax FROM public.flights WHERE status='COMPLETED' GROUP BY company_id)
SELECT c.id,c.name,c.icao_code,c.home_base_icao,a.name,c.is_supporter,
coalesce(cash.balance_after,0)+coalesce(fleet.assets,0)+coalesce(bases.assets,0),
coalesce(o.flights,0),coalesce(o.hours,0),coalesce(o.pax,0)
FROM public.companies c JOIN public.airports a ON a.icao=c.home_base_icao
LEFT JOIN cash ON cash.company_id=c.id LEFT JOIN fleet ON fleet.company_id=c.id LEFT JOIN bases ON bases.company_id=c.id LEFT JOIN operations o ON o.company_id=c.id;
$$;
REVOKE ALL ON FUNCTION public.leaderboard_totals() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_public_leaderboard()
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
  UPDATE public.companies c SET prev_week_rank=(SELECT s.rank FROM public.leaderboard_weekly_snapshots s WHERE s.company_id=c.id AND s.week_start=current_week-7);
END IF;
RETURN QUERY SELECT t.company_name,t.icao_code,t.home_base_icao,t.home_base_name,t.is_supporter,t.net_worth,t.flight_count,t.flight_hours,t.passengers,row_number() OVER(ORDER BY t.net_worth DESC,t.icao_code),c.prev_week_rank FROM public.leaderboard_totals() t JOIN public.companies c ON c.id=t.company_id ORDER BY t.net_worth DESC,t.icao_code;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_leaderboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard() TO authenticated;
CREATE FUNCTION public.admin_company_supporters()
RETURNS TABLE(company_id uuid, user_id uuid, is_supporter boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
RETURN QUERY SELECT c.id,c.user_id,c.is_supporter FROM public.companies c;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_company_supporters() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_company_supporters() TO authenticated;
CREATE FUNCTION public.set_company_supporter(p_company uuid,p_supporter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
IF p_supporter IS NULL THEN RAISE EXCEPTION 'Supporter value required'; END IF;
UPDATE public.companies SET is_supporter=p_supporter WHERE id=p_company;
IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_company_supporter(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_company_supporter(uuid,boolean) TO authenticated;