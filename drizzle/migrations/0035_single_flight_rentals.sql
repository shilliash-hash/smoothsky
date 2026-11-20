ALTER TABLE public.fleet_aircraft DROP CONSTRAINT fleet_aircraft_ownership_check;
ALTER TABLE public.fleet_aircraft ADD CONSTRAINT fleet_aircraft_ownership_check CHECK (ownership IN ('LEASED','OWNED','RENTAL'));
ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type IN ('INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND','USED_AIRCRAFT_SALE','SPOT_RENTAL'));
CREATE FUNCTION public.spot_rental_price(p_weekly numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT round(p_weekly * 0.37) $$;
GRANT EXECUTE ON FUNCTION public.spot_rental_price(numeric) TO authenticated;
CREATE FUNCTION public.rent_aircraft(p_type text,p_registration text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c companies%ROWTYPE; t aircraft_types%ROWTYPE; price numeric; fid uuid:=gen_random_uuid(); reg text;
BEGIN
 SELECT * INTO c FROM companies WHERE user_id=auth.uid() AND NOT is_personal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Airline company required'; END IF;
 PERFORM process_due_obligations(); PERFORM assert_company_investment(); PERFORM ensure_my_profile();
 SELECT * INTO t FROM aircraft_types WHERE id=p_type AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive aircraft'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND t.tier=ANY(type_ratings)) THEN RAISE EXCEPTION 'Requires Tier % license',t.tier; END IF;
 price:=spot_rental_price(t.weekly_rate);
 IF price<0 OR company_balance(c.id)<price THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF;
 PERFORM pg_advisory_xact_lock(814503); reg:=aircraft_registration(p_type,p_registration);
 INSERT INTO fleet_aircraft(id,company_id,aircraft_type_id,registration,location_icao,ownership,lease_deposit,weekly_rate,purchase_price,next_payment_due) VALUES(fid,c.id,t.id,reg,c.home_base_icao,'RENTAL',0,0,0,now());
 PERFORM company_post(c.id,'SPOT_RENTAL','RENTAL_EXPENSE','COMPANY_CASH',-price,'Single-flight rental – '||reg,reg,'spot_rental:'||fid);
 RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public.rent_aircraft(text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.rent_aircraft(text,text) TO authenticated;
DO $$ DECLARE d text; old text; BEGIN
 old:='ownership=''OWNED'' AND returned_at IS NULL'; d:=pg_get_functiondef('public.validate_dispatch_lease()'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected dispatch validation definition'; END IF; EXECUTE replace(d,old,'ownership IN (''OWNED'',''RENTAL'') AND returned_at IS NULL');
 old:='f.ownership<>''OWNED'''; d:=pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected quote definition'; END IF; EXECUTE replace(d,old,'f.ownership NOT IN (''OWNED'',''RENTAL'')');
 old:='UPDATE fleet_aircraft SET status=''AVAILABLE'',location_icao=f.destination_icao WHERE id=f.aircraft_id;'; d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected settlement definition'; END IF; EXECUTE replace(d,old,'UPDATE fleet_aircraft SET status=CASE WHEN ownership=''RENTAL'' THEN ''RETURNED'' ELSE ''AVAILABLE'' END,returned_at=CASE WHEN ownership=''RENTAL'' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.destination_icao WHERE id=f.aircraft_id;');
 old:='UPDATE fleet_aircraft SET status=''AVAILABLE'',location_icao=f.origin_icao WHERE id=f.aircraft_id;'; d:=pg_get_functiondef('public.cancel_test_flight(uuid)'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected cancellation definition'; END IF; EXECUTE replace(d,old,'UPDATE fleet_aircraft SET status=CASE WHEN ownership=''RENTAL'' THEN ''RETURNED'' ELSE ''AVAILABLE'' END,returned_at=CASE WHEN ownership=''RENTAL'' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;');
 d:=pg_get_functiondef('public.company_daily_results()'::regprocedure); EXECUTE replace(d,'''FOB_UPKEEP''','''FOB_UPKEEP'',''SPOT_RENTAL''');
 d:=pg_get_functiondef('public.aircraft_finance(uuid)'::regprocedure); EXECUTE replace(d,'''lease_paid'',','''rental_paid'',coalesce(sum(amount) FILTER(WHERE entry_type=''SPOT_RENTAL''),0),''lease_paid'',');
END $$;