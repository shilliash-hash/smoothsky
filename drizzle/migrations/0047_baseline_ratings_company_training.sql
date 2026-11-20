ALTER TABLE public.profiles ALTER COLUMN type_ratings SET DEFAULT '{1,2,3}'::integer[];
CREATE OR REPLACE FUNCTION public.baseline_type_ratings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.type_ratings := ARRAY(SELECT DISTINCT t FROM unnest(coalesce(NEW.type_ratings,'{}'::integer[]) || '{1,2,3}'::integer[]) t ORDER BY t);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.baseline_type_ratings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_baseline_type_ratings BEFORE INSERT OR UPDATE OF type_ratings ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.baseline_type_ratings();
ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type IN ('INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND','USED_AIRCRAFT_SALE','SPOT_RENTAL','LEASE_TERMINATION_FEE','PASSENGER_TIP','TYPE_RATING'));
CREATE OR REPLACE FUNCTION public.buy_type_rating(p_group text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tiers integer[]; price numeric; bal numeric; uid uuid:=auth.uid(); cid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 tiers := CASE p_group WHEN 'T3_4' THEN '{3,4}'::integer[] WHEN 'T5' THEN '{5}'::integer[] WHEN 'T6_7' THEN '{6,7}'::integer[] ELSE NULL END;
 IF tiers IS NULL THEN RAISE EXCEPTION 'Unknown licence'; END IF;
 SELECT id INTO cid FROM companies WHERE user_id=uid AND NOT is_personal FOR UPDATE;
 IF cid IS NOT NULL THEN PERFORM process_due_obligations(); END IF;
 PERFORM 1 FROM profiles WHERE id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pilot profile required'; END IF;
 IF (SELECT type_ratings @> tiers FROM profiles WHERE id=uid) THEN RAISE EXCEPTION 'Licence already held'; END IF;
 price := economy_number('type_rating_'||lower(p_group));
 IF price IS NULL OR price<=0 THEN RAISE EXCEPTION 'Invalid licence price'; END IF;
 IF cid IS NOT NULL THEN
  bal := company_balance(cid);
  IF bal<price THEN RAISE EXCEPTION 'Insufficient company balance'; END IF;
  PERFORM company_post(cid,'TYPE_RATING','TRAINING_EXPENSE','COMPANY_CASH',-price,'Owner type rating '||replace(p_group,'_','–'),uid::text,'type_rating:'||cid::text||':'||uid::text||':'||p_group);
 ELSE
  bal := pilot_balance(uid);
  IF bal<price THEN RAISE EXCEPTION 'Insufficient pilot balance'; END IF;
  PERFORM pilot_post(uid,'TYPE_RATING',-price,'Type rating '||replace(p_group,'_','–'));
 END IF;
 UPDATE profiles SET type_ratings=ARRAY(SELECT DISTINCT unnest(type_ratings||tiers) ORDER BY 1) WHERE id=uid;
END $$;
REVOKE ALL ON FUNCTION public.buy_type_rating(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_type_rating(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.my_pilot_profile() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p profiles;
BEGIN
 SELECT * INTO p FROM profiles WHERE id=auth.uid(); IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('career_role',p.career_role,'callsign',p.callsign,'pilot_home_icao',p.pilot_home_icao,'type_ratings',to_jsonb(p.type_ratings),'balance',pilot_balance(p.id),
 'training_company',(SELECT jsonb_build_object('id',c.id,'name',c.name,'balance',company_balance(c.id)) FROM companies c WHERE c.user_id=auth.uid() AND NOT c.is_personal),
 'roster',(SELECT jsonb_build_object('company_id',c.id,'name',c.name,'icao_code',c.icao_code,'commission_pct',c.roster_commission_pct,'joined_at',p.roster_joined_at) FROM companies c WHERE c.id=p.roster_company_id),
 'prices',jsonb_build_object('T3_4',economy_number('type_rating_t3_4'),'T5',economy_number('type_rating_t5'),'T6_7',economy_number('type_rating_t6_7')));
END $$;
REVOKE ALL ON FUNCTION public.my_pilot_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pilot_profile() TO authenticated, service_role;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.company_daily_results()'::regprocedure);
 EXECUTE replace(d,'''SPOT_RENTAL''','''SPOT_RENTAL'',''TYPE_RATING''');
 d:=pg_get_functiondef('public.pay_due_dividends(uuid)'::regprocedure);
 EXECUTE replace(d,'''SPOT_RENTAL''','''SPOT_RENTAL'',''TYPE_RATING''');
END $$;