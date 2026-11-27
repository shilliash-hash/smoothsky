-- CR-12: Spot Rental Airframe Pool Reuse. Manual deployment after 0087 and 0090.
-- Returned rental airframes of the same type and country prefix are handed out again
-- (airframe_hours preserved, defects cleared); a new registration is minted only when all are busy.
BEGIN;
CREATE INDEX IF NOT EXISTS fleet_aircraft_rental_pool_idx ON public.fleet_aircraft(aircraft_type_id, returned_at)
 WHERE ownership='RENTAL' AND returned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rent_aircraft(p_type text, p_registration text DEFAULT NULL, p_airport_icao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE c companies%ROWTYPE; t aircraft_types%ROWTYPE; ap airports%ROWTYPE; z record; base numeric; fee numeric; price numeric;
 fid uuid; reg text; dest text; descr text; deposit numeric; v_prefix text; tok text:=replace(gen_random_uuid()::text,'-','');
BEGIN
 SELECT * INTO c FROM companies WHERE user_id=auth.uid() AND NOT is_personal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Airline company required'; END IF;
 PERFORM process_due_obligations(); PERFORM assert_company_investment(); PERFORM ensure_my_profile();
 SELECT * INTO t FROM aircraft_types WHERE id=p_type AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive aircraft'; END IF;
 PERFORM public.assert_aircraft_tier_license(t.tier);
 dest := upper(trim(coalesce(nullif(trim(p_airport_icao),''), c.home_base_icao)));
 SELECT * INTO ap FROM airports WHERE icao=dest;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown delivery airport %', dest; END IF;
 SELECT * INTO z FROM spot_rental_delivery_zone(c.id, dest);
 IF z.zone IS NULL THEN RAISE EXCEPTION 'Delivery airport % is outside operational reach — max % NM from Main Hub or % NM from a Satellite FBO', dest, spot_rental_cfg('spot_main_radius_nm',100), spot_rental_cfg('spot_satellite_radius_nm',60); END IF;
 IF z.zone='EXTENDED' AND ap.longest_runway_ft IS NOT NULL AND t.minimum_runway_ft IS NOT NULL AND ap.longest_runway_ft < t.minimum_runway_ft THEN
   RAISE EXCEPTION 'Runway too short at % (required % ft, airport % ft)', dest, t.minimum_runway_ft, ap.longest_runway_ft; END IF;
 base := spot_rental_price(t.weekly_rate);
 fee := round(base * z.fee_pct, 2);
 deposit := round(base * spot_rental_cfg('spot_rental_deposit_ratio',1),2);
 price := base + fee;
 IF price<0 OR company_balance(c.id)<price+deposit THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF;

 -- Pool reuse only for automatic registrations; a custom request always mints that exact registration.
 IF p_registration IS NULL OR trim(p_registration)='' THEN
  SELECT coalesce(rr.prefix,'VP-') INTO v_prefix FROM airports h LEFT JOIN registration_rules rr ON rr.country=h.country WHERE h.icao=c.home_base_icao;
  v_prefix := coalesce(v_prefix,'VP-');
  SELECT fa.id, fa.registration INTO fid, reg FROM fleet_aircraft fa
   WHERE fa.ownership='RENTAL' AND fa.aircraft_type_id=t.id AND fa.returned_at IS NOT NULL
     AND fa.registration LIKE v_prefix||'%' AND coalesce(fa.lease_deposit,0)=0
     AND (fa.reserved_until IS NULL OR fa.reserved_until<now())
     AND NOT EXISTS(SELECT 1 FROM flights fl WHERE fl.aircraft_id=fa.id AND fl.status IN ('DISPATCHED','EN_ROUTE'))
   ORDER BY fa.airframe_hours ASC, fa.returned_at ASC
   LIMIT 1 FOR UPDATE SKIP LOCKED;
 END IF;

 IF fid IS NOT NULL THEN
  UPDATE fleet_aircraft SET company_id=c.id, location_icao=dest, status='AVAILABLE', returned_at=NULL, leased_at=now(),
   lease_deposit=deposit, weekly_rate=0, purchase_price=0, next_payment_due=now(), current_fuel_gal=0,
   reserved_by=NULL, reserved_until=NULL,
   reliability_pct=100, maintenance_status='OPERATIONAL', hours_since_a_check=0, hours_since_c_check=0, hours_since_d_check=0,
   defect_hours=0, last_hard_landing_fpm=NULL
  WHERE id=fid;
 ELSE
  fid := gen_random_uuid();
  PERFORM pg_advisory_xact_lock(814503); reg:=aircraft_registration(p_type,p_registration);
  INSERT INTO fleet_aircraft(id,company_id,aircraft_type_id,registration,location_icao,ownership,lease_deposit,weekly_rate,purchase_price,next_payment_due)
   VALUES(fid,c.id,t.id,reg,dest,'RENTAL',deposit,0,0,now());
 END IF;
 descr := 'Single-flight rental – '||reg||CASE WHEN z.zone='EXTENDED' THEN ' · Delivery to '||dest||' (+'||round(z.fee_pct*100)||'% positioning fee)' ELSE ' · Base delivery '||dest END;
 PERFORM company_post(c.id,'SPOT_RENTAL','RENTAL_EXPENSE','COMPANY_CASH',-price,descr,reg,'spot_rental:'||fid||':'||tok);
 IF deposit>0 THEN PERFORM company_post(c.id,'LEASE_DEPOSIT','RENTAL_DEPOSIT_ASSET','COMPANY_CASH',-deposit,'Refundable Spot Rental deposit – '||reg,reg,'spot_deposit:'||fid||':'||tok); END IF;
 RETURN fid;
END $function$;
REVOKE ALL ON FUNCTION public.rent_aircraft(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rent_aircraft(text,text,text) TO authenticated, service_role;

-- Each rental session refunds once; the key carries the session's deposit entry id so repeated sessions of one airframe never collide.
CREATE OR REPLACE FUNCTION public.refund_spot_rental_deposit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.ownership='RENTAL' AND OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL AND OLD.lease_deposit>0 THEN
  IF (SELECT entry_type FROM company_ledger WHERE company_id=OLD.company_id ORDER BY id DESC LIMIT 1)='RESTRUCTURE_ASSETS' THEN
   NEW.lease_deposit:=0;
   RETURN NEW;
  END IF;
  PERFORM company_post(OLD.company_id,'LEASE_DEPOSIT_REFUND','COMPANY_CASH','RENTAL_DEPOSIT_ASSET',OLD.lease_deposit,
   'Spot Rental deposit returned – '||OLD.registration,OLD.registration,'spot_deposit_refund:'||OLD.id||':'||coalesce((SELECT max(id) FROM company_ledger WHERE idempotency_key LIKE 'spot_deposit:'||OLD.id||':%')::text,'legacy'));
  NEW.lease_deposit:=0;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.refund_spot_rental_deposit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_spot_rental_deposit() TO service_role;

-- CR-06 severe-landing forfeit must read the latest refund of the current tenant, not an exact legacy key.
DO $patch$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.apply_flight_maintenance()'::regprocedure);
 IF position('spot_deposit_refund:''||a.id||'':%''' IN d)=0 THEN
  n:=replace(d,'(SELECT company_delta FROM company_ledger WHERE idempotency_key=''spot_deposit_refund:''||a.id)',
   '(SELECT company_delta FROM company_ledger WHERE company_id=a.company_id AND (idempotency_key=''spot_deposit_refund:''||a.id OR idempotency_key LIKE ''spot_deposit_refund:''||a.id||'':%'') ORDER BY id DESC LIMIT 1)');
  IF n=d THEN RAISE EXCEPTION 'Maintenance forfeit anchor missing'; END IF;
  EXECUTE n;
 END IF;
END $patch$;
COMMIT;
