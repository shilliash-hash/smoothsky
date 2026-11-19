ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stake_offer_pct numeric NOT NULL DEFAULT 0 CHECK (stake_offer_pct >= 0 AND stake_offer_pct <= 30);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS next_dividend_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');
ALTER TABLE public.fleet_aircraft ADD COLUMN IF NOT EXISTS reserved_by uuid;
ALTER TABLE public.fleet_aircraft ADD COLUMN IF NOT EXISTS reserved_until timestamptz;
ALTER TABLE public.flights ADD COLUMN IF NOT EXISTS pilot_id uuid;
ALTER TABLE public.flights ADD COLUMN IF NOT EXISTS pilot_mode text CHECK (pilot_mode IN ('ROSTER','FREELANCE','PERSONAL'));
ALTER TABLE public.flights ADD COLUMN IF NOT EXISTS pilot_commission_pct numeric;
ALTER TABLE public.flights ADD COLUMN IF NOT EXISTS pilot_funding numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS flights_pilot_idx ON public.flights(pilot_id, created_at DESC) WHERE pilot_id IS NOT NULL;

ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type = ANY (ARRAY['INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND']));

CREATE TABLE public.company_stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  holder_id uuid NOT NULL REFERENCES public.profiles(id),
  pct numeric NOT NULL CHECK (pct > 0 AND pct <= 30),
  price_paid numeric NOT NULL CHECK (price_paid >= 0),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  sold_at timestamptz,
  sale_price numeric
);
GRANT SELECT ON public.company_stakes TO authenticated;
GRANT ALL ON public.company_stakes TO service_role;
ALTER TABLE public.company_stakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Holder reads own stakes" ON public.company_stakes FOR SELECT TO authenticated USING (holder_id = auth.uid());
CREATE POLICY "Owner reads stakes in own airline" ON public.company_stakes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_stakes.company_id AND c.user_id = auth.uid()));
CREATE INDEX company_stakes_company_idx ON public.company_stakes(company_id) WHERE sold_at IS NULL;

CREATE OR REPLACE FUNCTION public.pilot_post(p_user uuid, p_type text, p_amount numeric, p_desc text) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE bal numeric; BEGIN
PERFORM 1 FROM profiles WHERE id=p_user FOR UPDATE;
bal := pilot_balance(p_user) + p_amount;
IF bal < 0 THEN RAISE EXCEPTION 'Insufficient pilot wallet'; END IF;
INSERT INTO pilot_ledger(user_id,entry_type,amount,balance_after,description) VALUES(p_user,p_type,p_amount,bal,p_desc);
RETURN bal; END $$;

CREATE OR REPLACE FUNCTION public.company_post(p_company uuid, p_type text, p_debit text, p_credit text, p_delta numeric, p_desc text, p_ref text, p_key text) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE bal numeric; BEGIN
bal := company_balance(p_company) + p_delta;
INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key)
VALUES(p_company,p_type,p_debit,p_credit,abs(p_delta),p_delta,bal,p_desc,p_ref,p_key);
RETURN bal; END $$;

CREATE OR REPLACE FUNCTION public.act_as(p_user uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE old text := current_setting('request.jwt.claims', true); BEGIN
PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',p_user,'role','authenticated')::text, true);
RETURN coalesce(old,''); END $$;

CREATE OR REPLACE FUNCTION public.mark_company_entrepreneur() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NEW.is_personal THEN RETURN NEW; END IF;
INSERT INTO profiles(id,career_role) VALUES(NEW.user_id,'ENTREPRENEUR') ON CONFLICT(id) DO UPDATE SET career_role='ENTREPRENEUR', roster_company_id=NULL, roster_joined_at=NULL; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.leaderboard_totals()
 RETURNS TABLE(company_id uuid, company_name text, icao_code text, home_base_icao text, home_base_name text, is_supporter boolean, net_worth numeric, flight_count bigint, flight_hours numeric, passengers bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH cash AS (SELECT DISTINCT ON (company_id) company_id,balance_after FROM public.company_ledger ORDER BY company_id,id DESC),
fleet AS (SELECT company_id,sum(CASE WHEN ownership='OWNED' THEN purchase_price ELSE lease_deposit END) AS assets FROM public.fleet_aircraft WHERE returned_at IS NULL GROUP BY company_id),
bases AS (SELECT b.company_id,sum(l.amount) AS assets FROM public.company_fobs b JOIN public.company_ledger l ON l.company_id=b.company_id AND l.reference=b.id::text AND l.entry_type IN ('FOB_SETUP','FOB_MODULE') WHERE b.closed_at IS NULL GROUP BY b.company_id),
operations AS (SELECT company_id,count(*) AS flights,sum(coalesce((settlement->>'minutes')::numeric,estimated_minutes))/60 AS hours,sum(passengers)::bigint AS pax FROM public.flights WHERE status='COMPLETED' GROUP BY company_id)
SELECT c.id,c.name,c.icao_code,c.home_base_icao,a.name,c.is_supporter,
coalesce(cash.balance_after,0)+coalesce(fleet.assets,0)+coalesce(bases.assets,0),
coalesce(o.flights,0),coalesce(o.hours,0),coalesce(o.pax,0)
FROM public.companies c JOIN public.airports a ON a.icao=c.home_base_icao
LEFT JOIN cash ON cash.company_id=c.id LEFT JOIN fleet ON fleet.company_id=c.id LEFT JOIN bases ON bases.company_id=c.id LEFT JOIN operations o ON o.company_id=c.id
WHERE NOT c.is_personal;
$function$;

CREATE OR REPLACE FUNCTION public.company_net_worth(p_company uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce((SELECT net_worth FROM leaderboard_totals() WHERE company_id=p_company),0) $$;

CREATE OR REPLACE FUNCTION public.hiring_companies() RETURNS TABLE(company_id uuid, name text, icao_code text, home_base_icao text, roster_commission_pct numeric, freelance_commission_pct numeric, fleet_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT c.id,c.name,c.icao_code,c.home_base_icao,c.roster_commission_pct,c.freelance_commission_pct,(SELECT count(*) FROM fleet_aircraft f WHERE f.company_id=c.id AND f.returned_at IS NULL)
FROM companies c WHERE c.is_hiring AND NOT c.is_personal AND auth.uid() IS NOT NULL ORDER BY c.name $$;

CREATE OR REPLACE FUNCTION public.attach_flight_pilot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid text := nullif(current_setting('smoothsky.pilot_id', true),''); r uuid; ru timestamptz; BEGIN
IF pid IS NOT NULL THEN
  NEW.pilot_id := pid::uuid;
  NEW.pilot_mode := nullif(current_setting('smoothsky.pilot_mode', true),'');
  NEW.pilot_commission_pct := nullif(current_setting('smoothsky.pilot_pct', true),'')::numeric;
  NEW.pilot_funding := coalesce(nullif(current_setting('smoothsky.pilot_funding', true),'')::numeric,0);
END IF;
SELECT reserved_by,reserved_until INTO r,ru FROM fleet_aircraft WHERE id=NEW.aircraft_id;
IF r IS NOT NULL AND ru > now() AND r IS DISTINCT FROM NEW.pilot_id THEN RAISE EXCEPTION 'Aircraft is reserved by a pilot until %', to_char(ru,'HH24:MI "UTC"'); END IF;
UPDATE fleet_aircraft SET reserved_by=NULL, reserved_until=NULL WHERE id=NEW.aircraft_id AND reserved_by IS NOT NULL;
RETURN NEW; END $$;
CREATE TRIGGER attach_flight_pilot BEFORE INSERT ON public.flights FOR EACH ROW EXECUTE FUNCTION public.attach_flight_pilot();

CREATE OR REPLACE FUNCTION public.split_pilot_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE net numeric; amt numeric; label text; BEGIN
IF NEW.pilot_id IS NULL OR NEW.status<>'COMPLETED' OR OLD.status='COMPLETED' THEN RETURN NEW; END IF;
label := NEW.flight_number||' · '||NEW.origin_icao||' → '||NEW.destination_icao;
net := coalesce((NEW.settlement->>'net')::numeric,0);
IF NEW.pilot_mode IN ('ROSTER','FREELANCE') THEN
  IF net > 0 THEN
    amt := round(net*coalesce(NEW.pilot_commission_pct,0)/100,2);
    IF amt > 0 THEN
      PERFORM company_post(NEW.company_id,'PILOT_COMMISSION','CREW_EXPENSE','COMPANY_CASH',-amt,'PILOT_COMMISSION – '||label,NEW.id::text,'flight:'||NEW.id||':PILOT_COMMISSION');
      PERFORM pilot_post(NEW.pilot_id,'FLIGHT_COMMISSION',amt,initcap(NEW.pilot_mode)||' commission – '||label);
    END IF;
  END IF;
ELSIF NEW.pilot_mode='PERSONAL' THEN
  amt := greatest(company_balance(NEW.company_id),0);
  IF amt > 0 THEN
    PERFORM company_post(NEW.company_id,'PERSONAL_PAYOUT','PILOT_WALLET','COMPANY_CASH',-amt,'PERSONAL_PAYOUT – '||label,NEW.id::text,'flight:'||NEW.id||':PERSONAL_PAYOUT');
    PERFORM pilot_post(NEW.pilot_id,'PERSONAL_FLIGHT_REVENUE',amt,'Private flight revenue – '||label);
  END IF;
END IF;
RETURN NEW; END $$;
CREATE TRIGGER split_pilot_result AFTER UPDATE OF status ON public.flights FOR EACH ROW EXECUTE FUNCTION public.split_pilot_result();

CREATE OR REPLACE FUNCTION public.pilot_mode_for(p_user uuid, p_aircraft uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT CASE WHEN c.is_personal AND c.user_id=p_user THEN 'PERSONAL'
 WHEN NOT c.is_personal AND c.user_id<>p_user AND c.id=p.roster_company_id THEN 'ROSTER'
 WHEN NOT c.is_personal AND c.user_id<>p_user AND p.roster_company_id IS NULL AND c.is_hiring THEN 'FREELANCE' END
FROM fleet_aircraft a JOIN companies c ON c.id=a.company_id JOIN profiles p ON p.id=p_user
WHERE a.id=p_aircraft AND a.returned_at IS NULL AND p.career_role='PILOT_ONLY' $$;

CREATE OR REPLACE FUNCTION public.pilot_flight_action(p_action text, p_aircraft uuid DEFAULT NULL, p_destination text DEFAULT NULL, p_flight_number text DEFAULT NULL, p_flight uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid(); p profiles; a fleet_aircraft; c companies; t aircraft_types; f flights; mode text; pct numeric; q jsonb; costs numeric; old text; fid uuid; BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
SELECT * INTO p FROM profiles WHERE id=uid;
IF p.career_role IS DISTINCT FROM 'PILOT_ONLY' THEN RAISE EXCEPTION 'Pilot operations are available to Pilot Only careers'; END IF;
IF p_action='release' THEN UPDATE fleet_aircraft SET reserved_by=NULL,reserved_until=NULL WHERE reserved_by=uid; RETURN jsonb_build_object('ok',true); END IF;
IF p_action IN ('reserve','quote','dispatch') THEN
  SELECT * INTO a FROM fleet_aircraft WHERE id=p_aircraft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
  mode := pilot_mode_for(uid,a.id);
  IF mode IS NULL THEN RAISE EXCEPTION 'You are not cleared to fly this aircraft'; END IF;
  SELECT * INTO c FROM companies WHERE id=a.company_id;
  SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
  IF NOT (t.tier = ANY(p.type_ratings)) THEN RAISE EXCEPTION 'Type rating for Tier % required', t.tier; END IF;
  IF a.reserved_by IS NOT NULL AND a.reserved_by<>uid AND a.reserved_until>now() THEN RAISE EXCEPTION 'Aircraft is reserved by another pilot'; END IF;
  pct := CASE mode WHEN 'ROSTER' THEN c.roster_commission_pct WHEN 'FREELANCE' THEN c.freelance_commission_pct ELSE 100 END;
  IF p_action='reserve' THEN
    IF a.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Aircraft is not available'; END IF;
    UPDATE fleet_aircraft SET reserved_by=NULL,reserved_until=NULL WHERE reserved_by=uid AND id<>a.id;
    UPDATE fleet_aircraft SET reserved_by=uid,reserved_until=now()+make_interval(mins=>greatest(1,coalesce(economy_number('aircraft_reservation_minutes'),20))::int) WHERE id=a.id;
    RETURN jsonb_build_object('ok',true,'mode',mode);
  END IF;
  old := act_as(c.user_id);
  q := flight_quote(a.id,upper(p_destination));
  PERFORM set_config('request.jwt.claims',old,true);
  costs := (q->>'fuel_cost')::numeric+(q->>'landing_fee')::numeric+(q->>'handling_fee')::numeric+(q->>'maintenance')::numeric;
  IF p_action='quote' THEN
    RETURN q||jsonb_build_object('pilot_mode',mode,'commission_pct',pct,'operating_costs',costs,
      'pilot_share',CASE WHEN mode='PERSONAL' THEN (q->>'net')::numeric ELSE greatest(round((q->>'net')::numeric*pct/100,2),0) END);
  END IF;
  IF mode='PERSONAL' THEN
    PERFORM pilot_post(uid,'PRIVATE_FLIGHT_FUNDING',-costs,'Operating costs advance – '||a.registration||' · '||a.location_icao||' → '||upper(p_destination));
    PERFORM company_post(c.id,'PILOT_FUNDING','COMPANY_CASH','PILOT_WALLET',costs,'PILOT_FUNDING – '||a.registration,a.id::text,'pilot_funding:'||gen_random_uuid());
  END IF;
  PERFORM set_config('smoothsky.pilot_id',uid::text,true);
  PERFORM set_config('smoothsky.pilot_mode',mode,true);
  PERFORM set_config('smoothsky.pilot_pct',pct::text,true);
  PERFORM set_config('smoothsky.pilot_funding',(CASE WHEN mode='PERSONAL' THEN costs ELSE 0 END)::text,true);
  old := act_as(c.user_id);
  fid := dispatch_flight(a.id,upper(p_destination),coalesce(p_flight_number,''));
  PERFORM set_config('request.jwt.claims',old,true);
  PERFORM set_config('smoothsky.pilot_id','',true);
  RETURN jsonb_build_object('flight_id',fid,'mode',mode);
END IF;
IF p_action IN ('start','settle','cancel') THEN
  SELECT * INTO f FROM flights WHERE id=p_flight AND pilot_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF;
  SELECT * INTO c FROM companies WHERE id=f.company_id;
  old := act_as(c.user_id);
  IF p_action='start' THEN PERFORM start_test_flight(f.id);
  ELSIF p_action='settle' THEN q := settle_flight(f.id,'{}'::jsonb);
  ELSE
    PERFORM cancel_test_flight(f.id);
    IF f.pilot_mode='PERSONAL' AND f.pilot_funding>0 THEN
      PERFORM company_post(c.id,'PILOT_FUNDING_REFUND','PILOT_WALLET','COMPANY_CASH',-f.pilot_funding,'PILOT_FUNDING_REFUND – '||f.flight_number,f.id::text,'flight:'||f.id||':FUNDING_REFUND');
      PERFORM pilot_post(uid,'PRIVATE_FLIGHT_REFUND',f.pilot_funding,'Cancelled flight refund – '||f.flight_number);
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claims',old,true);
  RETURN coalesce(q,jsonb_build_object('ok',true));
END IF;
RAISE EXCEPTION 'Unknown action'; END $$;

CREATE OR REPLACE FUNCTION public.pay_due_dividends(p_company uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c companies; profit numeric; s company_stakes; amt numeric; payout numeric := coalesce(economy_number('stake_dividend_payout'),0.5); BEGIN
SELECT * INTO c FROM companies WHERE id=p_company FOR UPDATE;
IF NOT FOUND OR c.next_dividend_at>now() THEN RETURN; END IF;
WHILE c.next_dividend_at<=now() LOOP
  IF EXISTS (SELECT 1 FROM company_stakes WHERE company_id=c.id AND sold_at IS NULL AND acquired_at<c.next_dividend_at) THEN
    SELECT coalesce(sum(company_delta),0) INTO profit FROM company_ledger WHERE company_id=c.id AND created_at>=c.next_dividend_at-interval '7 days' AND created_at<c.next_dividend_at
      AND entry_type IN ('TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','LEASE_PAYMENT','FOB_UPKEEP','PILOT_COMMISSION');
    IF profit>0 THEN
      FOR s IN SELECT * FROM company_stakes WHERE company_id=c.id AND sold_at IS NULL AND acquired_at<c.next_dividend_at ORDER BY id LOOP
        amt := round(profit*payout*s.pct/100,2);
        IF amt>0 THEN
          PERFORM company_post(c.id,'DIVIDEND','EQUITY','COMPANY_CASH',-amt,'DIVIDEND – '||s.pct||'% stake · week to '||to_char(c.next_dividend_at,'YYYY-MM-DD'),s.id::text,'dividend:'||s.id||':'||c.next_dividend_at::text);
          PERFORM pilot_post(s.holder_id,'DIVIDEND',amt,'Dividend – '||c.name||' ('||s.pct||'%)');
        END IF;
      END LOOP;
    END IF;
  END IF;
  c.next_dividend_at := c.next_dividend_at+interval '7 days';
END LOOP;
UPDATE companies SET next_dividend_at=c.next_dividend_at WHERE id=c.id; END $$;

ALTER FUNCTION public.process_due_obligations() RENAME TO process_due_obligations_core;
CREATE FUNCTION public.process_due_obligations() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; BEGIN PERFORM process_due_obligations_core(); SELECT id INTO cid FROM companies WHERE user_id=auth.uid(); IF cid IS NOT NULL THEN PERFORM pay_due_dividends(cid); END IF; END $$;

CREATE OR REPLACE FUNCTION public.set_stake_offer(p_pct numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c companies; sold numeric; BEGIN
SELECT * INTO c FROM companies WHERE user_id=auth.uid() AND NOT is_personal FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'No airline'; END IF;
IF p_pct<0 OR p_pct>30 THEN RAISE EXCEPTION 'Offer must be between 0 and 30 percent'; END IF;
SELECT coalesce(sum(pct),0) INTO sold FROM company_stakes WHERE company_id=c.id AND sold_at IS NULL;
IF p_pct<sold THEN RAISE EXCEPTION 'Offer cannot be below the % percent already held by pilots', sold; END IF;
UPDATE companies SET stake_offer_pct=p_pct WHERE id=c.id; END $$;

CREATE OR REPLACE FUNCTION public.stake_market() RETURNS TABLE(company_id uuid, name text, icao_code text, net_worth numeric, offered_pct numeric, sold_pct numeric, price_per_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT c.id,c.name,c.icao_code,greatest(t.net_worth,0),c.stake_offer_pct,
 coalesce((SELECT sum(pct) FROM company_stakes s WHERE s.company_id=c.id AND s.sold_at IS NULL),0), round(greatest(t.net_worth,0)/100,2)
FROM companies c JOIN leaderboard_totals() t ON t.company_id=c.id
WHERE auth.uid() IS NOT NULL AND c.stake_offer_pct>0 AND c.user_id<>auth.uid() ORDER BY c.name $$;

CREATE OR REPLACE FUNCTION public.buy_stake(p_company uuid, p_pct numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); c companies; sold numeric; nw numeric; price numeric; sid uuid; BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
PERFORM ensure_my_profile();
SELECT * INTO c FROM companies WHERE id=p_company AND NOT is_personal FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Airline not found'; END IF;
IF c.user_id=uid THEN RAISE EXCEPTION 'You cannot buy stakes in your own airline'; END IF;
IF p_pct IS NULL OR p_pct<=0 THEN RAISE EXCEPTION 'Choose a stake size'; END IF;
SELECT coalesce(sum(pct),0) INTO sold FROM company_stakes WHERE company_id=c.id AND sold_at IS NULL;
IF sold+p_pct>c.stake_offer_pct THEN RAISE EXCEPTION 'Only % percent available', c.stake_offer_pct-sold; END IF;
nw := company_net_worth(c.id);
IF nw<=0 THEN RAISE EXCEPTION 'Airline has no positive valuation'; END IF;
price := round(nw*p_pct/100,2);
PERFORM pilot_post(uid,'STAKE_PURCHASE',-price,'Stake purchase – '||p_pct||'% of '||c.name);
INSERT INTO company_stakes(company_id,holder_id,pct,price_paid) VALUES(c.id,uid,p_pct,price) RETURNING id INTO sid;
PERFORM company_post(c.id,'STAKE_SALE','COMPANY_CASH','EQUITY',price,'STAKE_SALE – '||p_pct||'% to pilot',sid::text,'stake_sale:'||sid);
RETURN sid; END $$;

CREATE OR REPLACE FUNCTION public.sell_stake(p_stake uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); s company_stakes; c companies; price numeric; BEGIN
SELECT * INTO s FROM company_stakes WHERE id=p_stake AND holder_id=uid AND sold_at IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'Stake not found'; END IF;
SELECT * INTO c FROM companies WHERE id=s.company_id FOR UPDATE;
SELECT * INTO s FROM company_stakes WHERE id=p_stake FOR UPDATE;
IF s.sold_at IS NOT NULL THEN RAISE EXCEPTION 'Stake already sold'; END IF;
IF s.locked_until>now() THEN RAISE EXCEPTION 'Stake is locked until %', to_char(s.locked_until,'YYYY-MM-DD HH24:MI "UTC"'); END IF;
price := round(greatest(company_net_worth(c.id),0)*s.pct/100,2);
IF company_balance(c.id)<price THEN RAISE EXCEPTION 'The airline lacks cash to buy back this stake right now'; END IF;
PERFORM company_post(c.id,'STAKE_BUYBACK','EQUITY','COMPANY_CASH',-price,'STAKE_BUYBACK – '||s.pct||'% from pilot',s.id::text,'stake_buyback:'||s.id);
PERFORM pilot_post(uid,'STAKE_SALE',price,'Stake sold – '||s.pct||'% of '||c.name);
UPDATE company_stakes SET sold_at=now(),sale_price=price WHERE id=s.id;
RETURN price; END $$;

CREATE OR REPLACE FUNCTION public.buy_personal_aircraft(p_type text, p_registration text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p profiles; t aircraft_types; cid uuid; code text; i int:=0; aid uuid; BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
SELECT * INTO p FROM profiles WHERE id=uid FOR UPDATE;
IF p.career_role IS DISTINCT FROM 'PILOT_ONLY' THEN RAISE EXCEPTION 'Personal hangar is available to Pilot Only careers'; END IF;
SELECT * INTO t FROM aircraft_types WHERE id=p_type AND active;
IF NOT FOUND OR t.tier>3 OR t.purchase_price<=0 THEN RAISE EXCEPTION 'Choose an active Tier 1–3 aircraft'; END IF;
IF NOT (t.tier=ANY(p.type_ratings)) THEN RAISE EXCEPTION 'Type rating for Tier % required', t.tier; END IF;
SELECT id INTO cid FROM companies WHERE user_id=uid AND is_personal;
IF cid IS NULL AND EXISTS (SELECT 1 FROM companies WHERE user_id=uid) THEN RAISE EXCEPTION 'Airline owners cannot open a personal hangar'; END IF;
IF cid IS NOT NULL AND EXISTS (SELECT 1 FROM fleet_aircraft WHERE company_id=cid AND returned_at IS NULL) THEN RAISE EXCEPTION 'You already own a personal aircraft'; END IF;
IF pilot_balance(uid)<t.purchase_price THEN RAISE EXCEPTION 'Insufficient pilot wallet'; END IF;
IF cid IS NULL THEN
  LOOP
    i:=i+1; code := chr(65+floor(random()*26)::int)||chr(65+floor(random()*26)::int)||chr(65+floor(random()*26)::int);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM companies WHERE icao_code=code);
    IF i>500 THEN RAISE EXCEPTION 'No operator code available'; END IF;
  END LOOP;
  INSERT INTO companies(user_id,name,icao_code,home_base_icao,is_personal) VALUES(uid,left('Private · '||coalesce(p.callsign,'Pilot'),60),code,coalesce(p.pilot_home_icao,'EPWA')) RETURNING id INTO cid;
END IF;
PERFORM pilot_post(uid,'PERSONAL_AIRCRAFT_PURCHASE',-t.purchase_price,'Personal aircraft purchase – '||t.manufacturer||' '||t.model);
PERFORM company_post(cid,'PILOT_FUNDING','COMPANY_CASH','PILOT_WALLET',t.purchase_price,'PILOT_FUNDING – aircraft purchase',t.id,'pilot_funding:'||gen_random_uuid());
aid := purchase_aircraft(p_type,p_registration);
RETURN aid; END $$;

CREATE OR REPLACE FUNCTION public.pilot_operations() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p profiles; r record; old text; BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
SELECT * INTO p FROM profiles WHERE id=uid;
FOR r IN SELECT DISTINCT company_id FROM company_stakes WHERE holder_id=uid AND sold_at IS NULL LOOP PERFORM pay_due_dividends(r.company_id); END LOOP;
IF coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN
  FOR r IN SELECT f.id, c.user_id FROM flights f JOIN companies c ON c.id=f.company_id WHERE f.pilot_id=uid AND f.status='EN_ROUTE' AND f.execution_source='WEB_MANUAL'
    AND now()>=f.departed_at+make_interval(secs=>((f.estimated_minutes*60)/greatest(1,(f.rules_snapshot->>'simulation_time_scale')::numeric))::double precision) LOOP
    old := act_as(r.user_id); PERFORM settle_flight(r.id,'{}'::jsonb); PERFORM set_config('request.jwt.claims',old,true);
  END LOOP;
END IF;
RETURN jsonb_build_object(
 'career_role',p.career_role,'type_ratings',to_jsonb(p.type_ratings),'balance',pilot_balance(uid),'server_time',now(),
 'aircraft',coalesce((SELECT jsonb_agg(x ORDER BY x->>'mode', x->>'registration') FROM (
   SELECT jsonb_build_object('id',a.id,'registration',a.registration,'location_icao',a.location_icao,'status',a.status,'mode',pilot_mode_for(uid,a.id),
     'company_name',c.name,'company_icao',c.icao_code,'commission_pct',CASE pilot_mode_for(uid,a.id) WHEN 'ROSTER' THEN c.roster_commission_pct WHEN 'FREELANCE' THEN c.freelance_commission_pct ELSE 100 END,
     'type_id',t.id,'model',t.manufacturer||' '||t.model,'tier',t.tier,'pax',t.pax,'range_nm',t.range_nm,'cruise_kts',t.cruise_kts,'minimum_runway_ft',t.minimum_runway_ft,
     'rated',t.tier=ANY(p.type_ratings),'reserved_by_me',coalesce(a.reserved_by=uid AND a.reserved_until>now(),false),'reserved_by_other',coalesce(a.reserved_by<>uid AND a.reserved_until>now(),false),'reserved_until',a.reserved_until) x
   FROM fleet_aircraft a JOIN companies c ON c.id=a.company_id JOIN aircraft_types t ON t.id=a.aircraft_type_id
   WHERE a.returned_at IS NULL AND pilot_mode_for(uid,a.id) IS NOT NULL
     AND (a.ownership='OWNED' OR EXISTS (SELECT 1 FROM lease_contracts k WHERE k.aircraft_id=a.id AND now()>=k.starts_at AND now()<k.ends_at))
   LIMIT 300) s),'[]'::jsonb),
 'flights',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'flight_number',f.flight_number,'status',f.status,'mode',f.pilot_mode,'commission_pct',f.pilot_commission_pct,
     'origin_icao',f.origin_icao,'destination_icao',f.destination_icao,'distance_nm',f.distance_nm,'passengers',f.passengers,'estimated_minutes',f.estimated_minutes,
     'departed_at',f.departed_at,'completed_at',f.completed_at,'time_scale',f.rules_snapshot->'simulation_time_scale','net',coalesce(f.settlement->'net',f.estimate->'net'),
     'registration',a.registration,'company_name',c.name) ORDER BY f.created_at DESC)
   FROM (SELECT * FROM flights WHERE pilot_id=uid ORDER BY created_at DESC LIMIT 50) f JOIN fleet_aircraft a ON a.id=f.aircraft_id JOIN companies c ON c.id=f.company_id),'[]'::jsonb),
 'stakes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'company_name',c.name,'icao_code',c.icao_code,'pct',s.pct,'price_paid',s.price_paid,'acquired_at',s.acquired_at,'locked_until',s.locked_until,
     'current_value',round(greatest(company_net_worth(c.id),0)*s.pct/100,2),'next_dividend_at',c.next_dividend_at) ORDER BY s.acquired_at DESC)
   FROM company_stakes s JOIN companies c ON c.id=s.company_id WHERE s.holder_id=uid AND s.sold_at IS NULL),'[]'::jsonb),
 'dividends_total',coalesce((SELECT sum(amount) FROM pilot_ledger WHERE user_id=uid AND entry_type='DIVIDEND'),0),
 'personal_types',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'model',manufacturer||' '||model,'tier',tier,'pax',pax,'range_nm',range_nm,'purchase_price',purchase_price) ORDER BY tier,purchase_price)
   FROM aircraft_types WHERE active AND tier<=3 AND purchase_price>0),'[]'::jsonb),
 'has_personal',EXISTS (SELECT 1 FROM fleet_aircraft a JOIN companies c ON c.id=a.company_id WHERE c.user_id=uid AND c.is_personal AND a.returned_at IS NULL)
); END $$;

CREATE OR REPLACE FUNCTION public.get_pilot_leaderboard() RETURNS TABLE(pilot_name text, career_role text, flight_hours numeric, flight_count bigint, earned numeric, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce(p.callsign, c.name, 'Pilot '||left(p.id::text,4)), coalesce(p.career_role,'ENTREPRENEUR'),
 coalesce(round(sum(coalesce((f.settlement->>'minutes')::numeric,f.estimated_minutes))/60.0,1),0), count(f.id),
 coalesce((SELECT sum(amount) FROM pilot_ledger l WHERE l.user_id=p.id AND l.entry_type IN ('FLIGHT_COMMISSION','DIVIDEND')),0)
 + coalesce(sum(greatest((f.settlement->>'net')::numeric,0)) FILTER (WHERE f.pilot_mode IS NULL OR f.pilot_mode='PERSONAL'),0), p.id=auth.uid()
FROM profiles p LEFT JOIN companies c ON c.user_id=p.id AND NOT c.is_personal
LEFT JOIN flights f ON f.status='COMPLETED' AND (f.pilot_id=p.id OR (f.pilot_id IS NULL AND f.company_id=c.id))
WHERE auth.uid() IS NOT NULL AND p.career_role IS NOT NULL GROUP BY p.id,c.name ORDER BY 3 DESC,4 DESC,5 DESC $$;

REVOKE ALL ON FUNCTION public.pilot_post(uuid,text,numeric,text), public.company_post(uuid,text,text,text,numeric,text,text,text), public.act_as(uuid), public.pay_due_dividends(uuid), public.process_due_obligations_core(), public.company_net_worth(uuid), public.pilot_mode_for(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_flight_action(text,uuid,text,text,uuid), public.process_due_obligations(), public.set_stake_offer(numeric), public.stake_market(), public.buy_stake(uuid,numeric), public.sell_stake(uuid), public.buy_personal_aircraft(text,text), public.pilot_operations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_flight_action(text,uuid,text,text,uuid), public.process_due_obligations(), public.set_stake_offer(numeric), public.stake_market(), public.buy_stake(uuid,numeric), public.sell_stake(uuid), public.buy_personal_aircraft(text,text), public.pilot_operations() TO authenticated;