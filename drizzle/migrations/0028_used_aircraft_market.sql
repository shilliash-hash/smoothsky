ALTER TABLE public.fleet_aircraft ADD COLUMN airframe_hours numeric NOT NULL DEFAULT 0 CHECK (airframe_hours >= 0);
ALTER TABLE public.operating_rules
  ADD COLUMN depreciation_pct_per_100h numeric NOT NULL DEFAULT 2.0 CHECK (depreciation_pct_per_100h BETWEEN 0 AND 100),
  ADD COLUMN depreciation_floor_pct numeric NOT NULL DEFAULT 30.0 CHECK (depreciation_floor_pct BETWEEN 0 AND 100);

ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type = ANY (ARRAY['INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND','USED_AIRCRAFT_SALE']));

CREATE OR REPLACE FUNCTION public.depreciated_value(p_price numeric, p_hours numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT round(p_price * greatest(r.depreciation_floor_pct/100, 1 - (greatest(p_hours,0)/100) * (r.depreciation_pct_per_100h/100)), 2) FROM operating_rules r WHERE r.singleton $$;
GRANT EXECUTE ON FUNCTION public.depreciated_value(numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.accrue_airframe_hours() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    UPDATE fleet_aircraft SET airframe_hours = airframe_hours + coalesce((NEW.settlement->>'minutes')::numeric, NEW.estimated_minutes)/60 WHERE id = NEW.aircraft_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flights_accrue_airframe_hours AFTER UPDATE OF status ON public.flights FOR EACH ROW EXECUTE FUNCTION public.accrue_airframe_hours();

UPDATE public.fleet_aircraft fa SET airframe_hours = s.h FROM (SELECT aircraft_id, sum(coalesce((settlement->>'minutes')::numeric, estimated_minutes))/60 h FROM public.flights WHERE status='COMPLETED' GROUP BY aircraft_id) s WHERE fa.id = s.aircraft_id;

CREATE OR REPLACE FUNCTION public.leaderboard_totals()
 RETURNS TABLE(company_id uuid, company_name text, icao_code text, home_base_icao text, home_base_name text, is_supporter boolean, net_worth numeric, flight_count bigint, flight_hours numeric, passengers bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH cash AS (SELECT DISTINCT ON (company_id) company_id,balance_after FROM public.company_ledger ORDER BY company_id,id DESC),
fleet AS (SELECT f.company_id,sum(CASE WHEN f.ownership='OWNED' THEN public.depreciated_value(t.purchase_price,f.airframe_hours) ELSE f.lease_deposit END) AS assets FROM public.fleet_aircraft f JOIN public.aircraft_types t ON t.id=f.aircraft_type_id WHERE f.returned_at IS NULL GROUP BY f.company_id),
bases AS (SELECT b.company_id,sum(l.amount) AS assets FROM public.company_fobs b JOIN public.company_ledger l ON l.company_id=b.company_id AND l.reference=b.id::text AND l.entry_type IN ('FOB_SETUP','FOB_MODULE') WHERE b.closed_at IS NULL GROUP BY b.company_id),
operations AS (SELECT company_id,count(*) AS flights,sum(coalesce((settlement->>'minutes')::numeric,estimated_minutes))/60 AS hours,sum(passengers)::bigint AS pax FROM public.flights WHERE status='COMPLETED' GROUP BY company_id)
SELECT c.id,c.name,c.icao_code,c.home_base_icao,a.name,c.is_supporter,
coalesce(cash.balance_after,0)+coalesce(fleet.assets,0)+coalesce(bases.assets,0),
coalesce(o.flights,0),coalesce(o.hours,0),coalesce(o.pax,0)
FROM public.companies c JOIN public.airports a ON a.icao=c.home_base_icao
LEFT JOIN cash ON cash.company_id=c.id LEFT JOIN fleet ON fleet.company_id=c.id LEFT JOIN bases ON bases.company_id=c.id LEFT JOIN operations o ON o.company_id=c.id
WHERE NOT c.is_personal;
$function$;

CREATE TABLE public.used_aircraft_listings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_broker boolean NOT NULL DEFAULT false,
  seller_company_id uuid REFERENCES public.companies(id),
  fleet_aircraft_id uuid REFERENCES public.fleet_aircraft(id),
  aircraft_type_id text NOT NULL REFERENCES public.aircraft_types(id),
  registration text NOT NULL,
  location_icao text NOT NULL REFERENCES public.airports(icao),
  airframe_hours numeric NOT NULL CHECK (airframe_hours >= 0),
  catalog_price numeric NOT NULL CHECK (catalog_price > 0),
  depreciated_value numeric NOT NULL CHECK (depreciated_value >= 0),
  asking_price numeric NOT NULL CHECK (asking_price > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLD','CANCELLED')),
  buyer_company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (is_broker OR (seller_company_id IS NOT NULL AND fleet_aircraft_id IS NOT NULL))
);
GRANT SELECT ON public.used_aircraft_listings TO authenticated;
GRANT ALL ON public.used_aircraft_listings TO service_role;
ALTER TABLE public.used_aircraft_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read active used listings" ON public.used_aircraft_listings FOR SELECT TO authenticated USING (status='ACTIVE' OR EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id=auth.uid() AND c.id IN (seller_company_id, buyer_company_id)));
CREATE UNIQUE INDEX used_listing_one_active_per_aircraft ON public.used_aircraft_listings(fleet_aircraft_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX used_listing_active_registration ON public.used_aircraft_listings(upper(registration)) WHERE status='ACTIVE';

CREATE OR REPLACE FUNCTION public.replenish_broker_market() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; t aircraft_types; a airports; r registration_rules; reg text; hrs numeric; tries int := 0; j int;
BEGIN
  PERFORM pg_advisory_xact_lock(814503);
  SELECT count(*) INTO n FROM used_aircraft_listings WHERE is_broker AND status='ACTIVE';
  WHILE n < 10 AND tries < 200 LOOP
    tries := tries + 1;
    SELECT * INTO t FROM aircraft_types WHERE active AND tier BETWEEN 1 AND 6 AND purchase_price > 0
      ORDER BY (SELECT count(*) FROM used_aircraft_listings l WHERE l.is_broker AND l.status='ACTIVE' AND l.aircraft_type_id=aircraft_types.id), random() LIMIT 1;
    EXIT WHEN NOT FOUND;
    SELECT ap.* INTO a FROM airports ap JOIN registration_rules rr ON rr.country=ap.country
      WHERE ap.size >= least(t.tier, 5) AND (ap.longest_runway_ft IS NULL OR ap.longest_runway_ft >= t.minimum_runway_ft) AND ap.airport_type NOT IN ('closed','military','military_airport','heliport')
      ORDER BY random() LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    SELECT * INTO r FROM registration_rules WHERE country=a.country;
    reg := r.prefix;
    FOR j IN 1..r.suffix_length LOOP reg := reg || substr(r.alphabet, 1+floor(random()*length(r.alphabet))::int, 1); END LOOP;
    CONTINUE WHEN EXISTS (SELECT 1 FROM fleet_aircraft WHERE upper(trim(registration))=reg) OR EXISTS (SELECT 1 FROM used_aircraft_listings WHERE status='ACTIVE' AND upper(registration)=reg);
    hrs := round((300 + random()*11700)::numeric, 1);
    INSERT INTO used_aircraft_listings(is_broker,aircraft_type_id,registration,location_icao,airframe_hours,catalog_price,depreciated_value,asking_price)
      VALUES(true,t.id,reg,a.icao,hrs,t.purchase_price,depreciated_value(t.purchase_price,hrs),depreciated_value(t.purchase_price,hrs));
    n := n + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.used_market() RETURNS TABLE(id uuid, is_broker boolean, seller_name text, is_mine boolean, aircraft_type_id text, manufacturer text, model text, tier int, registration text, location_icao text, airport_name text, airframe_hours numeric, catalog_price numeric, depreciated_value numeric, asking_price numeric, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM replenish_broker_market();
  RETURN QUERY SELECT l.id,l.is_broker,CASE WHEN l.is_broker THEN 'SmoothSky Aircraft Brokers' ELSE c.name END,coalesce(c.user_id=auth.uid(),false),t.id,t.manufacturer,t.model,t.tier,l.registration,l.location_icao,ap.name,l.airframe_hours,t.purchase_price,depreciated_value(t.purchase_price,l.airframe_hours),l.asking_price,l.created_at
  FROM used_aircraft_listings l JOIN aircraft_types t ON t.id=l.aircraft_type_id JOIN airports ap ON ap.icao=l.location_icao LEFT JOIN companies c ON c.id=l.seller_company_id
  WHERE l.status='ACTIVE' ORDER BY l.is_broker, t.tier, l.asking_price;
END $$;

CREATE OR REPLACE FUNCTION public.list_used_aircraft(p_aircraft uuid, p_price numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fleet_aircraft; t aircraft_types; v numeric; lid uuid;
BEGIN
  SELECT fa.* INTO f FROM fleet_aircraft fa JOIN companies c ON c.id=fa.company_id WHERE fa.id=p_aircraft AND c.user_id=auth.uid() FOR UPDATE OF fa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
  IF f.ownership<>'OWNED' OR f.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Only owned aircraft can be sold'; END IF;
  IF f.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Aircraft must be available (no active flight)'; END IF;
  IF f.reserved_until IS NOT NULL AND f.reserved_until > now() THEN RAISE EXCEPTION 'Aircraft is reserved by a pilot'; END IF;
  IF EXISTS (SELECT 1 FROM flights WHERE aircraft_id=f.id AND status IN ('DISPATCHED','EN_ROUTE')) THEN RAISE EXCEPTION 'Complete or cancel the active flight first'; END IF;
  SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id;
  v := depreciated_value(t.purchase_price, f.airframe_hours);
  IF p_price IS NULL OR p_price < round(v*0.75,2) OR p_price > round(v*1.25,2) THEN RAISE EXCEPTION 'Asking price must be between % and % SC', round(v*0.75,2), round(v*1.25,2); END IF;
  INSERT INTO used_aircraft_listings(seller_company_id,fleet_aircraft_id,aircraft_type_id,registration,location_icao,airframe_hours,catalog_price,depreciated_value,asking_price)
    VALUES(f.company_id,f.id,t.id,f.registration,f.location_icao,f.airframe_hours,t.purchase_price,v,round(p_price,2)) RETURNING id INTO lid;
  UPDATE fleet_aircraft SET status='FOR_SALE' WHERE id=f.id;
  RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_used_listing(p_listing uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l used_aircraft_listings;
BEGIN
  SELECT ul.* INTO l FROM used_aircraft_listings ul JOIN companies c ON c.id=ul.seller_company_id WHERE ul.id=p_listing AND c.user_id=auth.uid() AND ul.status='ACTIVE' FOR UPDATE OF ul;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  UPDATE used_aircraft_listings SET status='CANCELLED', closed_at=now() WHERE id=l.id;
  UPDATE fleet_aircraft SET status='AVAILABLE' WHERE id=l.fleet_aircraft_id AND status='FOR_SALE';
END $$;

CREATE OR REPLACE FUNCTION public.buy_used_aircraft(p_listing uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid(); l used_aircraft_listings; t aircraft_types; p profiles; buyer companies; seller companies; aid uuid; code text; i int := 0; personal boolean := false; f fleet_aircraft;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO l FROM used_aircraft_listings WHERE id=p_listing FOR UPDATE;
  IF NOT FOUND OR l.status<>'ACTIVE' THEN RAISE EXCEPTION 'Listing is no longer available'; END IF;
  SELECT * INTO t FROM aircraft_types WHERE id=l.aircraft_type_id;
  SELECT * INTO buyer FROM companies WHERE user_id=uid AND NOT is_personal FOR UPDATE;
  IF FOUND THEN
    PERFORM sync_lease_payments();
    PERFORM assert_company_investment();
    IF company_balance(buyer.id) < l.asking_price THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF;
  ELSE
    SELECT * INTO p FROM profiles WHERE id=uid FOR UPDATE;
    IF p.career_role IS DISTINCT FROM 'PILOT_ONLY' THEN RAISE EXCEPTION 'Create an airline or choose a pilot career first'; END IF;
    IF t.tier > 3 THEN RAISE EXCEPTION 'Personal aircraft are limited to Tier 1–3'; END IF;
    IF NOT (t.tier = ANY(p.type_ratings)) THEN RAISE EXCEPTION 'Type rating for Tier % required', t.tier; END IF;
    SELECT * INTO buyer FROM companies WHERE user_id=uid AND is_personal FOR UPDATE;
    IF FOUND AND EXISTS (SELECT 1 FROM fleet_aircraft WHERE company_id=buyer.id AND returned_at IS NULL) THEN RAISE EXCEPTION 'You already own a personal aircraft'; END IF;
    IF pilot_balance(uid) < l.asking_price THEN RAISE EXCEPTION 'Insufficient pilot wallet'; END IF;
    IF buyer.id IS NULL THEN
      LOOP
        i := i+1; code := chr(65+floor(random()*26)::int)||chr(65+floor(random()*26)::int)||chr(65+floor(random()*26)::int);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM companies WHERE icao_code=code);
        IF i > 500 THEN RAISE EXCEPTION 'No operator code available'; END IF;
      END LOOP;
      INSERT INTO companies(user_id,name,icao_code,home_base_icao,is_personal) VALUES(uid,left('Private · '||coalesce(p.callsign,'Pilot'),60),code,coalesce(p.pilot_home_icao,'EPWA'),true) RETURNING * INTO buyer;
    END IF;
    personal := true;
    PERFORM pilot_post(uid,'PERSONAL_AIRCRAFT_PURCHASE',-l.asking_price,'Used aircraft purchase – '||l.registration);
    PERFORM company_post(buyer.id,'PILOT_FUNDING','COMPANY_CASH','PILOT_WALLET',l.asking_price,'PILOT_FUNDING – used aircraft '||l.registration,l.registration,'pilot_funding:'||gen_random_uuid());
  END IF;

  IF l.is_broker THEN
    PERFORM pg_advisory_xact_lock(814503);
    IF EXISTS (SELECT 1 FROM fleet_aircraft WHERE upper(trim(registration))=upper(l.registration)) THEN RAISE EXCEPTION 'Registration already assigned'; END IF;
    INSERT INTO fleet_aircraft(company_id,aircraft_type_id,registration,location_icao,ownership,purchase_price,lease_deposit,weekly_rate,next_payment_due,airframe_hours)
      VALUES(buyer.id,t.id,l.registration,l.location_icao,'OWNED',l.asking_price,0,0,now(),l.airframe_hours) RETURNING id INTO aid;
  ELSE
    SELECT * INTO seller FROM companies WHERE id=l.seller_company_id FOR UPDATE;
    IF seller.user_id = uid THEN RAISE EXCEPTION 'You cannot buy your own aircraft'; END IF;
    SELECT * INTO f FROM fleet_aircraft WHERE id=l.fleet_aircraft_id FOR UPDATE;
    IF f.company_id<>seller.id OR f.status<>'FOR_SALE' OR f.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Listing is no longer available'; END IF;
    aid := f.id;
    UPDATE fleet_aircraft SET company_id=buyer.id, status='AVAILABLE', purchase_price=l.asking_price, leased_at=now(), next_payment_due=now(), reserved_by=NULL, reserved_until=NULL WHERE id=f.id;
    PERFORM company_post(seller.id,'USED_AIRCRAFT_SALE','COMPANY_CASH','AIRCRAFT_ASSET',l.asking_price,'Used aircraft sale – '||l.registration,l.registration,'used_sale:'||l.id);
    IF seller.is_personal THEN
      PERFORM company_post(seller.id,'PERSONAL_PAYOUT','PILOT_WALLET','COMPANY_CASH',-l.asking_price,'Sale proceeds to pilot wallet – '||l.registration,l.registration,'used_sale_payout:'||l.id);
      PERFORM pilot_post(seller.user_id,'USED_AIRCRAFT_SALE',l.asking_price,'Used aircraft sale – '||l.registration);
    END IF;
  END IF;
  PERFORM company_post(buyer.id,'AIRCRAFT_PURCHASE','AIRCRAFT_ASSET','COMPANY_CASH',-l.asking_price,'Used aircraft purchase – '||l.registration,l.registration,'used_purchase:'||l.id);
  UPDATE used_aircraft_listings SET status='SOLD', closed_at=now(), buyer_company_id=buyer.id WHERE id=l.id;
  IF l.is_broker THEN PERFORM replenish_broker_market(); END IF;
  RETURN aid;
END $$;

REVOKE ALL ON FUNCTION public.replenish_broker_market(), public.accrue_airframe_hours() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.used_market(), public.list_used_aircraft(uuid,numeric), public.cancel_used_listing(uuid), public.buy_used_aircraft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.used_market(), public.list_used_aircraft(uuid,numeric), public.cancel_used_listing(uuid), public.buy_used_aircraft(uuid) TO authenticated;