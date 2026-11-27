-- Manual deployment after 0083. Existing rentals are not charged retrospectively.
BEGIN;
INSERT INTO public.economy_config(key,value,description) VALUES
('spot_rental_deposit_ratio','1','Refundable Spot Rental deposit / base rental fee (excludes positioning)'),
('secondary_hub_rental_warmup_hours','12','Satellite Spot Rental delivery warmup; fuel/handling discounts remain immediate')
ON CONFLICT(key) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='spot_rental_deposit_warmup_bounds' AND conrelid='public.economy_config'::regclass) THEN
 ALTER TABLE public.economy_config ADD CONSTRAINT spot_rental_deposit_warmup_bounds CHECK (
 key NOT IN ('spot_rental_deposit_ratio','secondary_hub_rental_warmup_hours') OR
 (jsonb_typeof(value)='number' AND CASE WHEN key='spot_rental_deposit_ratio' THEN (value#>>'{}')::numeric BETWEEN 0 AND 5
 ELSE (value#>>'{}')::numeric BETWEEN 0 AND 168 AND mod((value#>>'{}')::numeric,1)=0 END));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.spot_rental_delivery_zone(p_company uuid, p_icao text)
RETURNS TABLE(zone text, fee_pct numeric, anchor_icao text, distance_nm double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH cfg AS (SELECT spot_rental_cfg('spot_positioning_fee_pct',0.10) fee, spot_rental_cfg('spot_main_radius_nm',100) rmain, spot_rental_cfg('spot_satellite_radius_nm',60) rsat),
anchors AS (
  SELECT c.home_base_icao icao, 'MAIN'::text kind FROM companies c WHERE c.id=p_company
  UNION
  SELECT f.airport_icao, 'SATELLITE' FROM company_fobs f JOIN companies c ON c.id=f.company_id
   WHERE f.company_id=p_company AND f.closed_at IS NULL AND f.airport_icao<>c.home_base_icao
   AND f.created_at <= now()-make_interval(secs => (spot_rental_cfg('secondary_hub_rental_warmup_hours',12)*3600)::double precision)
), target AS (SELECT * FROM airports WHERE icao=upper(trim(p_icao))),
cand AS (
  SELECT a.kind, a.icao, airport_distance_nm(b.lat,b.lon,t.lat,t.lon) d
  FROM anchors a JOIN airports b ON b.icao=a.icao CROSS JOIN target t
)
SELECT * FROM (
  SELECT CASE WHEN d<0.01 OR icao=upper(trim(p_icao)) THEN kind ELSE 'EXTENDED' END,
         CASE WHEN icao=upper(trim(p_icao)) THEN 0 ELSE (SELECT fee FROM cfg) END,
         icao, CASE WHEN icao=upper(trim(p_icao)) THEN 0 ELSE d END
  FROM cand, cfg
  WHERE icao=upper(trim(p_icao)) OR d <= CASE WHEN kind='MAIN' THEN cfg.rmain ELSE cfg.rsat END
  ORDER BY (icao=upper(trim(p_icao))) DESC, (kind='MAIN') DESC, d
  LIMIT 1) z
$$;
REVOKE ALL ON FUNCTION public.spot_rental_delivery_zone(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spot_rental_delivery_zone(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rent_aircraft(p_type text, p_registration text DEFAULT NULL, p_airport_icao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE c companies%ROWTYPE; t aircraft_types%ROWTYPE; ap airports%ROWTYPE; z record; base numeric; fee numeric; price numeric; fid uuid:=gen_random_uuid(); reg text; dest text; descr text; deposit numeric;
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
 PERFORM pg_advisory_xact_lock(814503); reg:=aircraft_registration(p_type,p_registration);
 INSERT INTO fleet_aircraft(id,company_id,aircraft_type_id,registration,location_icao,ownership,lease_deposit,weekly_rate,purchase_price,next_payment_due) VALUES(fid,c.id,t.id,reg,dest,'RENTAL',deposit,0,0,now());
 descr := 'Single-flight rental – '||reg||CASE WHEN z.zone='EXTENDED' THEN ' · Delivery to '||dest||' (+'||round(z.fee_pct*100)||'% positioning fee)' ELSE ' · Base delivery '||dest END;
 PERFORM company_post(c.id,'SPOT_RENTAL','RENTAL_EXPENSE','COMPANY_CASH',-price,descr,reg,'spot_rental:'||fid);
 IF deposit>0 THEN PERFORM company_post(c.id,'LEASE_DEPOSIT','RENTAL_DEPOSIT_ASSET','COMPANY_CASH',-deposit,'Refundable Spot Rental deposit – '||reg,reg,'spot_deposit:'||fid); END IF;
 RETURN fid;
END $function$;
REVOKE ALL ON FUNCTION public.rent_aircraft(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rent_aircraft(text,text,text) TO authenticated, service_role;
-- The fleet row remains locked throughout retirement: terminal return releases the snapshot once.
-- DIVERTED and cancelled continuation legs do not retire the aircraft, so the deposit stays locked.
CREATE OR REPLACE FUNCTION public.refund_spot_rental_deposit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.ownership='RENTAL' AND OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL AND OLD.lease_deposit>0 THEN
  -- Existing restructuring already liquidates every deposit in one asset ledger entry.
  -- The company lock serializes this check with all ordinary rental/settlement posts.
  IF (SELECT entry_type FROM company_ledger WHERE company_id=OLD.company_id ORDER BY id DESC LIMIT 1)='RESTRUCTURE_ASSETS' THEN
   NEW.lease_deposit:=0;
   RETURN NEW;
  END IF;
  PERFORM company_post(OLD.company_id,'LEASE_DEPOSIT_REFUND','COMPANY_CASH','RENTAL_DEPOSIT_ASSET',OLD.lease_deposit,
   'Spot Rental deposit returned – '||OLD.registration,OLD.registration,'spot_deposit_refund:'||OLD.id);
  NEW.lease_deposit:=0;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.refund_spot_rental_deposit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_spot_rental_deposit() TO service_role;
DROP TRIGGER IF EXISTS refund_spot_rental_deposit ON public.fleet_aircraft;
CREATE TRIGGER refund_spot_rental_deposit BEFORE UPDATE OF returned_at ON public.fleet_aircraft
FOR EACH ROW EXECUTE FUNCTION public.refund_spot_rental_deposit();
-- Retirement posts the deposit after the expense loop. Read the ledger again for the final snapshot.
DO $patch$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 IF position('''balance_after'',company_balance(c.id)' IN d)=0 THEN
  n:=replace(d,'''balance_after'',bal','''balance_after'',company_balance(c.id)');
  IF n=d THEN RAISE EXCEPTION 'Settlement balance snapshot anchor missing'; END IF;
  EXECUTE n;
 END IF;
END $patch$;
COMMIT;
