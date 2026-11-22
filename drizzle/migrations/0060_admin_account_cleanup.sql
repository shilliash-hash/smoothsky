CREATE OR REPLACE FUNCTION public.ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND public.is_admin()
    AND current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.admin_cleanup_company(uuid)'::regprocedure)) THEN
  IF TG_TABLE_NAME='company_ledger' AND OLD.company_id::text = nullif(current_setting('smoothsky.cleanup_company',true),'') THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='pilot_ledger' AND OLD.user_id::text = nullif(current_setting('smoothsky.cleanup_user',true),'') THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Ledger entries are immutable';
END $$;

CREATE OR REPLACE FUNCTION public.admin_cleanup_company(p_company_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.companies%ROWTYPE; flight_ids uuid[]; previous_scope text:=coalesce(current_setting('smoothsky.cleanup_company',true),'');
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 LOCK TABLE public.companies,public.fleet_aircraft,public.flights,public.profiles IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
 IF c.user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot clean up your own account' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(f.id),'{}'::uuid[]) INTO flight_ids FROM public.flights f WHERE f.company_id=c.id OR f.aircraft_id IN (SELECT a.id FROM public.fleet_aircraft a WHERE a.company_id=c.id);
 DELETE FROM public.special_missions WHERE flight_id=ANY(flight_ids) OR accepted_by=c.id;
 UPDATE public.flights SET status='CANCELLED' WHERE id=ANY(flight_ids) AND status IN ('DISPATCHED','EN_ROUTE');
 DELETE FROM public.flights WHERE id=ANY(flight_ids);
 DELETE FROM public.used_aircraft_listings WHERE seller_company_id=c.id OR buyer_company_id=c.id OR fleet_aircraft_id IN (SELECT a.id FROM public.fleet_aircraft a WHERE a.company_id=c.id);
 DELETE FROM public.lease_contracts WHERE company_id=c.id OR aircraft_id IN (SELECT a.id FROM public.fleet_aircraft a WHERE a.company_id=c.id);
 DELETE FROM public.fleet_aircraft WHERE company_id=c.id;
 DELETE FROM public.company_fobs WHERE company_id=c.id;
 DELETE FROM public.company_stakes WHERE company_id=c.id;
 UPDATE public.profiles SET roster_company_id=NULL,roster_joined_at=NULL WHERE roster_company_id=c.id;
 DELETE FROM public.leaderboard_weekly_snapshots WHERE company_id=c.id;
 PERFORM set_config('smoothsky.cleanup_company',c.id::text,true);
 DELETE FROM public.company_ledger WHERE company_id=c.id;
 PERFORM set_config('smoothsky.cleanup_company',previous_scope,true);
END $$;
REVOKE ALL ON FUNCTION public.admin_cleanup_company(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_company(p_company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.companies%ROWTYPE; capital numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 LOCK TABLE public.companies,public.fleet_aircraft,public.flights,public.profiles IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
 IF c.user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot reset your own account' USING ERRCODE='42501'; END IF;
 IF c.is_personal THEN RAISE EXCEPTION 'Personal hangars cannot receive a company grant'; END IF;
 capital:=public.economy_number('starting_capital');
 IF capital IS NULL OR capital<=0 THEN RAISE EXCEPTION 'Invalid starting capital configuration'; END IF;
 PERFORM public.admin_cleanup_company(c.id);
 UPDATE public.companies SET next_flight_sequence=101,prev_week_rank=NULL,is_hiring=false,stake_offer_pct=0,next_dividend_at=now()+interval '7 days' WHERE id=c.id;
 PERFORM public.company_post(c.id,'INITIAL_GRANT','COMPANY_CASH','SYSTEM_TREASURY',capital,'Initial Smooth Coins grant after administrator reset',NULL,'initial_grant:'||c.id);
 RETURN jsonb_build_object('company_id',c.id,'balance',capital);
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_company(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user_and_company(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; previous_scope text:=coalesce(current_setting('smoothsky.cleanup_user',true),'');
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot delete your own account' USING ERRCODE='42501'; END IF;
 LOCK TABLE public.companies,public.fleet_aircraft,public.flights,public.profiles IN SHARE ROW EXCLUSIVE MODE;
 -- Retain other companies' historical flights, but cancel live operations and detach the deleted pilot.
 UPDATE public.flights SET status='CANCELLED' WHERE pilot_id=p_user_id AND status IN ('DISPATCHED','EN_ROUTE');
 UPDATE public.fleet_aircraft SET status='AVAILABLE' WHERE id IN (SELECT aircraft_id FROM public.flights WHERE pilot_id=p_user_id AND status='CANCELLED') AND returned_at IS NULL AND status IN ('DISPATCHED','EN_ROUTE');
 UPDATE public.flights SET pilot_id=NULL WHERE pilot_id=p_user_id;
 UPDATE public.fleet_aircraft SET reserved_by=NULL,reserved_until=NULL WHERE reserved_by=p_user_id;
 DELETE FROM public.special_missions WHERE accepted_by=p_user_id;
 FOR cid IN SELECT id FROM public.companies WHERE user_id=p_user_id ORDER BY id LOOP
  PERFORM public.admin_cleanup_company(cid);
  DELETE FROM public.companies WHERE id=cid;
 END LOOP;
 DELETE FROM public.company_stakes WHERE holder_id=p_user_id;
 PERFORM set_config('smoothsky.cleanup_user',p_user_id::text,true);
 DELETE FROM public.pilot_ledger WHERE user_id=p_user_id;
 PERFORM set_config('smoothsky.cleanup_user',previous_scope,true);
 DELETE FROM public.profiles WHERE id=p_user_id;
 DELETE FROM public.user_roles WHERE user_id=p_user_id;
 -- Auth identity is removed by the authenticated server action through the managed Auth API.
 RETURN jsonb_build_object('user_id',p_user_id,'application_data_deleted',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_user_and_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_and_company(uuid) TO authenticated;

DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.admin_players()'::regprocedure) INTO definition;
 definition:=replace(definition,'LEFT JOIN public.companies c ON c.user_id=u.id','LEFT JOIN public.companies c ON c.user_id=u.id AND c.is_personal=false');
 EXECUTE definition;
END $$;