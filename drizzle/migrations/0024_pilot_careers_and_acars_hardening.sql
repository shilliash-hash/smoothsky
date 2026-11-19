ALTER TABLE public.profiles ADD COLUMN career_role text CHECK (career_role IN ('ENTREPRENEUR','PILOT_ONLY')),
  ADD COLUMN callsign text CHECK (callsign IS NULL OR callsign ~ '^[A-Za-z0-9 _.-]{3,24}$'),
  ADD COLUMN pilot_home_icao text REFERENCES public.airports(icao),
  ADD COLUMN type_ratings int[] NOT NULL DEFAULT '{1,2}',
  ADD COLUMN roster_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN roster_joined_at timestamptz,
  ADD COLUMN last_position_at timestamptz;
UPDATE public.profiles p SET career_role='ENTREPRENEUR' WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id=p.id);

ALTER TABLE public.companies ADD COLUMN is_hiring boolean NOT NULL DEFAULT false,
  ADD COLUMN roster_commission_pct numeric NOT NULL DEFAULT 40 CHECK (roster_commission_pct BETWEEN 35 AND 50),
  ADD COLUMN freelance_commission_pct numeric NOT NULL DEFAULT 25 CHECK (freelance_commission_pct BETWEEN 20 AND 30);

CREATE TABLE public.pilot_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL CHECK (balance_after >= 0),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pilot_ledger TO authenticated;
GRANT ALL ON public.pilot_ledger TO service_role;
ALTER TABLE public.pilot_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pilot reads own wallet" ON public.pilot_ledger FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE TRIGGER pilot_ledger_immutable BEFORE UPDATE OR DELETE ON public.pilot_ledger FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable();

INSERT INTO public.economy_config(key,value,description) VALUES
 ('type_rating_t3_4','15000','Pilot licence price for Tier 3–4 aircraft (SC)'),
 ('type_rating_t5','60000','Pilot licence price for Tier 5 aircraft (SC)'),
 ('type_rating_t6_7','150000','Pilot licence price for Tier 6–7 aircraft (SC)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pilot_balance(p_user uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce((SELECT balance_after FROM pilot_ledger WHERE user_id=p_user ORDER BY id DESC LIMIT 1),0) $$;
REVOKE ALL ON FUNCTION public.pilot_balance(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_company_entrepreneur() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO profiles(id,career_role) VALUES(NEW.user_id,'ENTREPRENEUR') ON CONFLICT(id) DO UPDATE SET career_role='ENTREPRENEUR', roster_company_id=NULL, roster_joined_at=NULL; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.mark_company_entrepreneur() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER company_owner_is_entrepreneur AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.mark_company_entrepreneur();

CREATE OR REPLACE FUNCTION public.choose_pilot_career(p_callsign text, p_home text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF EXISTS (SELECT 1 FROM companies WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Airline owners already have a career'; END IF;
IF NOT EXISTS (SELECT 1 FROM airports WHERE icao=upper(p_home)) THEN RAISE EXCEPTION 'Unknown airport'; END IF;
INSERT INTO profiles(id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
UPDATE profiles SET career_role='PILOT_ONLY', callsign=trim(p_callsign), pilot_home_icao=upper(p_home) WHERE id=auth.uid() AND (career_role IS NULL OR career_role='PILOT_ONLY');
END $$;

CREATE OR REPLACE FUNCTION public.buy_type_rating(p_group text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tiers int[]; price numeric; bal numeric; uid uuid:=auth.uid(); BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
tiers := CASE p_group WHEN 'T3_4' THEN '{3,4}'::int[] WHEN 'T5' THEN '{5}'::int[] WHEN 'T6_7' THEN '{6,7}'::int[] ELSE NULL END;
IF tiers IS NULL THEN RAISE EXCEPTION 'Unknown licence'; END IF;
PERFORM 1 FROM profiles WHERE id=uid FOR UPDATE;
IF (SELECT type_ratings @> tiers FROM profiles WHERE id=uid) THEN RAISE EXCEPTION 'Licence already held'; END IF;
price := economy_number('type_rating_'||lower(p_group)); bal := pilot_balance(uid);
IF bal < price THEN RAISE EXCEPTION 'Insufficient pilot balance'; END IF;
INSERT INTO pilot_ledger(user_id,entry_type,amount,balance_after,description) VALUES(uid,'TYPE_RATING',-price,bal-price,'Type rating '||replace(p_group,'_','–'));
UPDATE profiles SET type_ratings=ARRAY(SELECT DISTINCT unnest(type_ratings||tiers) ORDER BY 1) WHERE id=uid;
END $$;

CREATE OR REPLACE FUNCTION public.set_company_hiring(p_hiring boolean, p_roster numeric, p_freelance numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE companies SET is_hiring=p_hiring, roster_commission_pct=p_roster, freelance_commission_pct=p_freelance WHERE user_id=auth.uid();
IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.join_roster(p_company uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF (SELECT career_role FROM profiles WHERE id=uid FOR UPDATE) IS DISTINCT FROM 'PILOT_ONLY' THEN RAISE EXCEPTION 'Only Pilot Only careers can sign roster contracts'; END IF;
IF (SELECT roster_company_id FROM profiles WHERE id=uid) IS NOT NULL THEN RAISE EXCEPTION 'End your current contract first'; END IF;
IF NOT EXISTS (SELECT 1 FROM companies WHERE id=p_company AND is_hiring) THEN RAISE EXCEPTION 'Airline is not hiring'; END IF;
UPDATE profiles SET roster_company_id=p_company, roster_joined_at=now() WHERE id=uid; END $$;

CREATE OR REPLACE FUNCTION public.leave_roster() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
UPDATE profiles SET roster_company_id=NULL, roster_joined_at=NULL WHERE id=auth.uid() $$;

CREATE OR REPLACE FUNCTION public.my_pilot_profile() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p profiles; BEGIN SELECT * INTO p FROM profiles WHERE id=auth.uid(); IF NOT FOUND THEN RETURN NULL; END IF;
RETURN jsonb_build_object('career_role',p.career_role,'callsign',p.callsign,'pilot_home_icao',p.pilot_home_icao,'type_ratings',to_jsonb(p.type_ratings),'balance',pilot_balance(p.id),
 'roster',(SELECT jsonb_build_object('company_id',c.id,'name',c.name,'icao_code',c.icao_code,'commission_pct',c.roster_commission_pct,'joined_at',p.roster_joined_at) FROM companies c WHERE c.id=p.roster_company_id),
 'prices',jsonb_build_object('T3_4',economy_number('type_rating_t3_4'),'T5',economy_number('type_rating_t5'),'T6_7',economy_number('type_rating_t6_7'))); END $$;

CREATE OR REPLACE FUNCTION public.hiring_companies() RETURNS TABLE(company_id uuid, name text, icao_code text, home_base_icao text, roster_commission_pct numeric, freelance_commission_pct numeric, fleet_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT c.id,c.name,c.icao_code,c.home_base_icao,c.roster_commission_pct,c.freelance_commission_pct,(SELECT count(*) FROM fleet_aircraft f WHERE f.company_id=c.id AND f.returned_at IS NULL)
FROM companies c WHERE c.is_hiring AND auth.uid() IS NOT NULL ORDER BY c.name $$;

CREATE OR REPLACE FUNCTION public.get_pilot_leaderboard() RETURNS TABLE(pilot_name text, career_role text, flight_hours numeric, flight_count bigint, earned numeric, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce(p.callsign, c.name, 'Pilot '||left(p.id::text,4)), coalesce(p.career_role,'ENTREPRENEUR'),
 coalesce(round(sum(coalesce((f.settlement->>'minutes')::numeric,f.estimated_minutes))/60.0,1),0), count(f.id),
 coalesce((SELECT sum(amount) FROM pilot_ledger l WHERE l.user_id=p.id AND l.amount>0),0)
 + coalesce(sum((f.settlement->>'net')::numeric) FILTER (WHERE (f.settlement->>'net')::numeric>0),0), p.id=auth.uid()
FROM profiles p LEFT JOIN companies c ON c.user_id=p.id LEFT JOIN flights f ON f.company_id=c.id AND f.status='COMPLETED'
WHERE auth.uid() IS NOT NULL AND p.career_role IS NOT NULL GROUP BY p.id,c.name ORDER BY 3 DESC,4 DESC,5 DESC $$;

REVOKE ALL ON FUNCTION public.choose_pilot_career(text,text), public.buy_type_rating(text), public.set_company_hiring(boolean,numeric,numeric), public.join_roster(uuid), public.leave_roster(), public.my_pilot_profile(), public.hiring_companies(), public.get_pilot_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_pilot_career(text,text), public.buy_type_rating(text), public.set_company_hiring(boolean,numeric,numeric), public.join_roster(uuid), public.leave_roster(), public.my_pilot_profile(), public.hiring_companies(), public.get_pilot_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.acars_position(p_key text, p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=acars_pilot(p_key); cid uuid; f flights; n int; last timestamptz; prev jsonb; secs numeric; nm numeric; cap numeric; BEGIN
SELECT last_position_at INTO last FROM profiles WHERE id=uid FOR UPDATE;
IF last IS NOT NULL AND now()-last < interval '3 seconds' THEN RAISE EXCEPTION 'Rate limit: max 1 position report per 3 seconds' USING ERRCODE='P0429'; END IF;
UPDATE profiles SET last_position_at=now() WHERE id=uid;
SELECT id INTO cid FROM companies WHERE user_id=uid FOR UPDATE; IF cid IS NULL THEN RAISE EXCEPTION 'No company'; END IF;
SELECT * INTO f FROM flights WHERE company_id=cid AND status='EN_ROUTE' AND execution_source='ACARS_AGENT' FOR UPDATE;
IF NOT FOUND THEN
  SELECT count(*) INTO n FROM flights WHERE company_id=cid AND status IN('DISPATCHED','EN_ROUTE');
  IF n=0 THEN RAISE EXCEPTION 'No dispatched flight' USING ERRCODE='P0002'; END IF;
  IF n>1 THEN RAISE EXCEPTION 'Only one active flight may be flown via ACARS; cancel or finish the others' USING ERRCODE='P0409'; END IF;
  SELECT * INTO f FROM flights WHERE company_id=cid AND status IN('DISPATCHED','EN_ROUTE') FOR UPDATE;
  UPDATE flights SET execution_source='ACARS_AGENT',status='EN_ROUTE',departed_at=coalesce(departed_at,now()) WHERE id=f.id;
  UPDATE fleet_aircraft SET status='EN_ROUTE' WHERE id=f.aircraft_id;
END IF;
SELECT t.fuel_capacity_gal INTO cap FROM fleet_aircraft a JOIN aircraft_types t ON t.id=a.aircraft_type_id WHERE a.id=f.aircraft_id;
IF (p->>'fuel_gal')::numeric > cap*1.05 THEN RAISE EXCEPTION 'Implausible fuel: exceeds aircraft tank capacity' USING ERRCODE='P0422'; END IF;
prev := f.telemetry->'live';
IF prev IS NOT NULL AND prev ? 'received_at' THEN
  secs := greatest(1, extract(epoch FROM now()-(prev->>'received_at')::timestamptz));
  nm := 3440.065*2*asin(sqrt(power(sin(radians(((p->>'lat')::numeric-(prev->>'lat')::numeric)/2)),2)+cos(radians((prev->>'lat')::numeric))*cos(radians((p->>'lat')::numeric))*power(sin(radians(((p->>'lon')::numeric-(prev->>'lon')::numeric)/2)),2)));
  IF nm/(secs/3600.0) > 800 AND nm > 5 THEN RAISE EXCEPTION 'Implausible position jump' USING ERRCODE='P0422'; END IF;
  IF (p->>'phase') NOT IN ('PREFLIGHT','TAXI','PARKED') AND (p->>'fuel_gal')::numeric > (prev->>'fuel_gal')::numeric + greatest(2,cap*0.01) THEN RAISE EXCEPTION 'Implausible fuel increase in flight' USING ERRCODE='P0422'; END IF;
END IF;
UPDATE flights SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','live',p||jsonb_build_object('received_at',now())) WHERE id=f.id;
RETURN jsonb_build_object('ok',true,'flight_id',f.id,'flight_number',f.flight_number); END $$;

CREATE OR REPLACE FUNCTION public.acars_pirep(p_key text, p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=acars_pilot(p_key); f flights; burn numeric; cap numeric; wall numeric; BEGIN
SELECT x.* INTO f FROM flights x JOIN companies c ON c.id=x.company_id WHERE c.user_id=uid AND x.status='EN_ROUTE' AND x.execution_source='ACARS_AGENT' FOR UPDATE OF x;
IF NOT FOUND THEN
  IF EXISTS (SELECT 1 FROM flights x JOIN companies c ON c.id=x.company_id WHERE c.user_id=uid AND x.execution_source='ACARS_AGENT' AND x.status='COMPLETED' AND x.completed_at > now()-interval '24 hours') THEN
    RAISE EXCEPTION 'PIREP already received: flight is COMPLETED' USING ERRCODE='P0409'; END IF;
  RAISE EXCEPTION 'No ACARS flight en route' USING ERRCODE='P0002'; END IF;
SELECT t.fuel_burn_gph, t.fuel_capacity_gal INTO burn, cap FROM fleet_aircraft a JOIN aircraft_types t ON t.id=a.aircraft_type_id WHERE a.id=f.aircraft_id;
wall := extract(epoch FROM now()-f.departed_at)/3600.0;
IF (p->>'flight_time_hours')::numeric > wall + 0.25 THEN RAISE EXCEPTION 'Implausible flight time: longer than time since departure' USING ERRCODE='P0422'; END IF;
IF (p->>'fuel_used_gal')::numeric > cap*1.05 OR (p->>'fuel_used_gal')::numeric > burn*greatest((p->>'flight_time_hours')::numeric,0.1)*2.5 + 20 THEN RAISE EXCEPTION 'Implausible fuel used for this flight time' USING ERRCODE='P0422'; END IF;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
PERFORM set_config('smoothsky.acars_settlement',f.id::text,true);
RETURN settle_flight(f.id,jsonb_build_object('pirep',p||jsonb_build_object('received_at',now()),'fuel_used_gal',p->'fuel_used_gal','landing_rate_fpm',p->'landing_rate_fpm')); END $$;
REVOKE ALL ON FUNCTION public.acars_position(text,jsonb), public.acars_pirep(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acars_position(text,jsonb), public.acars_pirep(text,jsonb) TO anon, authenticated;