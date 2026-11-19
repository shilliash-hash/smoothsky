ALTER TABLE public.operating_rules
  ADD COLUMN IF NOT EXISTS cargo_pax_rate_ratio numeric NOT NULL DEFAULT 0.60 CHECK (cargo_pax_rate_ratio >= 0),
  ADD COLUMN IF NOT EXISTS cargo_airport_fee_discount numeric NOT NULL DEFAULT 0.40 CHECK (cargo_airport_fee_discount BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS all_cargo_capacity_bonus numeric NOT NULL DEFAULT 0.50 CHECK (all_cargo_capacity_bonus BETWEEN 0 AND 5);

CREATE TABLE public.airport_cargo_pools (
  airport_icao text PRIMARY KEY REFERENCES public.airports(icao),
  cargo_pool_kg numeric NOT NULL DEFAULT 0 CHECK (cargo_pool_kg >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.airport_cargo_pools TO authenticated;
GRANT ALL ON public.airport_cargo_pools TO service_role;
ALTER TABLE public.airport_cargo_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read cargo pools" ON public.airport_cargo_pools FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.cargo_capacity(p_airport text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (ARRAY[1500,2500,4000,6000,9000,14000,20000])[least(7,greatest(1,a.size))]::numeric
         * (1 + 0.1*greatest(0,a.development_level-1))
  FROM airports a WHERE a.icao = p_airport
$$;

CREATE OR REPLACE FUNCTION public.cargo_stock(p_airport text) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p airport_cargo_pools%ROWTYPE; cap numeric := coalesce(cargo_capacity(p_airport),0); hours numeric;
BEGIN
  SELECT * INTO p FROM airport_cargo_pools WHERE airport_icao = p_airport;
  IF NOT FOUND THEN RETURN cap; END IF;
  hours := greatest(0, extract(epoch FROM now()-p.updated_at)/3600);
  RETURN least(cap, p.cargo_pool_kg + cap*economy_number_or('cargo_refill_per_hour',0.15)*hours);
END $$;

CREATE TABLE public.special_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('MEDEVAC','AOG')),
  origin_icao text NOT NULL REFERENCES public.airports(icao),
  destination_icao text NOT NULL REFERENCES public.airports(icao),
  distance_nm numeric NOT NULL,
  cargo_kg integer NOT NULL CHECK (cargo_kg > 0),
  payout numeric NOT NULL CHECK (payout > 0),
  deadline_hours numeric NOT NULL CHECK (deadline_hours > 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','COMPLETED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '6 hours',
  accepted_by uuid,
  accepted_at timestamptz,
  deadline_at timestamptz,
  flight_id uuid REFERENCES public.flights(id),
  completed_at timestamptz,
  final_payout numeric,
  delivered_late boolean NOT NULL DEFAULT false
);
CREATE INDEX special_missions_status_idx ON public.special_missions(status);
CREATE UNIQUE INDEX special_missions_flight_idx ON public.special_missions(flight_id) WHERE flight_id IS NOT NULL;
GRANT SELECT ON public.special_missions TO authenticated;
GRANT ALL ON public.special_missions TO service_role;
ALTER TABLE public.special_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open or own missions are visible" ON public.special_missions FOR SELECT TO authenticated
  USING (status = 'OPEN' OR accepted_by = auth.uid());

CREATE OR REPLACE FUNCTION public.refresh_special_missions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_count int; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; cat text; tries int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('smoothsky.special_missions'));
  UPDATE special_missions SET status='EXPIRED' WHERE status='OPEN' AND expires_at < now();
  SELECT count(*) INTO open_count FROM special_missions WHERE status='OPEN';
  WHILE open_count < 12 AND tries < 60 LOOP
    tries := tries + 1;
    cat := CASE WHEN random() < 0.5 THEN 'MEDEVAC' ELSE 'AOG' END;
    SELECT * INTO a FROM airports
      WHERE size >= CASE WHEN cat='AOG' THEN 3 ELSE 2 END
        AND coalesce(longest_runway_ft, 4000) >= CASE WHEN cat='AOG' THEN 3000 ELSE 1500 END
        AND airport_type NOT IN ('closed','heliport')
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;
    SELECT x.* INTO b FROM airports x
      WHERE x.icao <> a.icao AND x.size >= 2
        AND x.airport_type NOT IN ('closed','heliport')
        AND coalesce(x.longest_runway_ft, 4000) >= CASE WHEN cat='AOG' THEN 3000 ELSE 1500 END
        AND x.lat BETWEEN a.lat-6 AND a.lat+6 AND x.lon BETWEEN a.lon-10 AND a.lon+10
        AND 3440.065*2*asin(sqrt(least(1,power(sin(radians(x.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(x.lat))*power(sin(radians(x.lon-a.lon)/2),2)))) BETWEEN 80 AND CASE WHEN cat='AOG' THEN 600 ELSE 350 END
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    nm := 3440.065*2*asin(sqrt(least(1,power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lon-a.lon)/2),2))));
    INSERT INTO special_missions(category,origin_icao,destination_icao,distance_nm,cargo_kg,payout,deadline_hours)
    VALUES (cat, a.icao, b.icao, round(nm,1),
      CASE WHEN cat='MEDEVAC' THEN 150 + floor(random()*151)::int ELSE 1500 + floor(random()*1501)::int END,
      CASE WHEN cat='MEDEVAC' THEN round(1800 + nm*9 + random()*800) ELSE round(6000 + nm*28 + random()*3000) END,
      CASE WHEN cat='MEDEVAC' THEN 2 + floor(random()*3)/2 ELSE 4 END);
    open_count := open_count + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.accept_special_mission(p_mission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m special_missions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
  IF EXISTS (SELECT 1 FROM special_missions WHERE accepted_by=auth.uid() AND status='ACCEPTED') THEN
    RAISE EXCEPTION 'Complete your current special mission first';
  END IF;
  SELECT * INTO m FROM special_missions WHERE id=p_mission FOR UPDATE;
  IF NOT FOUND OR m.status <> 'OPEN' OR m.expires_at < now() THEN RAISE EXCEPTION 'Mission is no longer available'; END IF;
  UPDATE special_missions SET status='ACCEPTED', accepted_by=auth.uid(), accepted_at=now(),
    deadline_at = now() + make_interval(secs => (m.deadline_hours*3600)::double precision)
  WHERE id=m.id;
END $$;

CREATE OR REPLACE FUNCTION public.flight_quote_cargo(p_aircraft uuid, p_destination text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q jsonb; opt jsonb := nullif(current_setting('smoothsky.cargo', true),'')::jsonb; r operating_rules%ROWTYPE;
  f fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; m special_missions%ROWTYPE; all_cargo boolean; want numeric; cap numeric; kg numeric := 0;
  pax int; fare numeric; cargo_rev numeric := 0; revenue numeric; landing numeric; handling numeric; hd numeric; mission uuid;
BEGIN
  q := flight_quote(p_aircraft, p_destination);
  IF opt IS NULL THEN RETURN q || jsonb_build_object('cargo_kg',0,'cargo_revenue',0,'ticket_revenue',q->'revenue','all_cargo',false); END IF;
  SELECT * INTO r FROM operating_rules WHERE singleton;
  SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft;
  SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id;
  mission := nullif(opt->>'mission','')::uuid;
  hd := ((coalesce((q->'fob_discounts'->>'handling_origin')::numeric,0)+coalesce((q->'fob_discounts'->>'handling_destination')::numeric,0))/2);
  IF mission IS NOT NULL THEN
    SELECT * INTO m FROM special_missions WHERE id=mission AND accepted_by=auth.uid();
    IF NOT FOUND OR m.status <> 'ACCEPTED' THEN RAISE EXCEPTION 'Mission not accepted by you'; END IF;
    IF m.origin_icao <> f.location_icao OR m.destination_icao <> p_destination THEN RAISE EXCEPTION 'Aircraft must fly % → % for this mission', m.origin_icao, m.destination_icao; END IF;
    IF t.cargo_kg*(1+r.all_cargo_capacity_bonus) < m.cargo_kg THEN RAISE EXCEPTION 'Aircraft cargo capacity is too small for this mission (% kg needed)', m.cargo_kg; END IF;
    landing := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2) END;
    handling := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round(m.payout*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2) END;
    RETURN q || jsonb_build_object('passengers',0,'cargo_kg',m.cargo_kg,'cargo_revenue',m.payout,'ticket_revenue',0,'revenue',m.payout,'all_cargo',true,
      'mission_id',m.id,'mission_category',m.category,'landing_fee',landing,'handling_fee',handling,
      'net',m.payout-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric);
  END IF;
  all_cargo := coalesce((opt->>'all_cargo')::boolean,false);
  want := greatest(0, coalesce((opt->>'cargo_kg')::numeric,0));
  cap := t.cargo_kg * CASE WHEN all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END;
  kg := floor(least(want, cap, cargo_stock(f.location_icao)));
  fare := (q->>'distance_nm')::numeric*(q->'rules'->>'fare_per_nm')::numeric + coalesce((q->'rules'->'charter_by_tier'->>(t.tier-1))::numeric,0);
  cargo_rev := round(kg/100*r.cargo_pax_rate_ratio*fare,2);
  pax := CASE WHEN all_cargo THEN 0 ELSE (q->>'passengers')::int END;
  revenue := CASE WHEN all_cargo THEN cargo_rev ELSE (q->>'revenue')::numeric + cargo_rev END;
  IF all_cargo THEN
    landing := round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2);
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2);
  ELSE
    landing := (q->>'landing_fee')::numeric;
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd),2);
  END IF;
  RETURN q || jsonb_build_object('passengers',pax,'cargo_kg',kg,'cargo_capacity_kg',cap,'cargo_revenue',cargo_rev,
    'ticket_revenue',CASE WHEN all_cargo THEN 0 ELSE (q->>'revenue')::numeric END,'revenue',revenue,'all_cargo',all_cargo,
    'landing_fee',landing,'handling_fee',handling,
    'net',revenue-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric);
END $$;

CREATE OR REPLACE FUNCTION public.flight_quote_full(p_aircraft uuid, p_destination text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('smoothsky.cargo', jsonb_build_object('cargo_kg',coalesce(p_cargo_kg,0),'all_cargo',coalesce(p_all_cargo,false),'mission',p_mission)::text, true);
  RETURN flight_quote_cargo(p_aircraft, p_destination);
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_flight_full(p_aircraft uuid, p_destination text, p_flight_number text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fid uuid; origin text; est jsonb;
BEGIN
  SELECT location_icao INTO origin FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN (SELECT id FROM companies WHERE user_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
  IF p_mission IS NOT NULL THEN
    PERFORM 1 FROM special_missions WHERE id=p_mission AND accepted_by=auth.uid() AND status='ACCEPTED' AND flight_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mission not available for dispatch'; END IF;
  ELSE
    INSERT INTO airport_cargo_pools(airport_icao,cargo_pool_kg) VALUES (origin, cargo_stock(origin)) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM airport_cargo_pools WHERE airport_icao=origin FOR UPDATE;
  END IF;
  PERFORM set_config('smoothsky.cargo', jsonb_build_object('cargo_kg',coalesce(p_cargo_kg,0),'all_cargo',coalesce(p_all_cargo,false),'mission',p_mission)::text, true);
  fid := dispatch_flight(p_aircraft, p_destination, p_flight_number);
  PERFORM set_config('smoothsky.cargo', '', true);
  SELECT estimate INTO est FROM flights WHERE id=fid;
  IF p_mission IS NOT NULL THEN
    UPDATE special_missions SET flight_id=fid WHERE id=p_mission;
  ELSIF coalesce((est->>'cargo_kg')::numeric,0) > 0 THEN
    UPDATE airport_cargo_pools SET cargo_pool_kg=greatest(0,cargo_stock(origin)-(est->>'cargo_kg')::numeric), updated_at=now() WHERE airport_icao=origin;
  END IF;
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.release_cancelled_mission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status='CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    UPDATE special_missions SET flight_id=NULL WHERE flight_id=NEW.id AND status='ACCEPTED';
    IF coalesce((OLD.estimate->>'cargo_kg')::numeric,0) > 0 AND OLD.estimate->>'mission_id' IS NULL THEN
      UPDATE airport_cargo_pools SET cargo_pool_kg=least(cargo_capacity(airport_icao), cargo_stock(airport_icao)+(OLD.estimate->>'cargo_kg')::numeric), updated_at=now() WHERE airport_icao=OLD.origin_icao;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_cancelled_mission AFTER UPDATE OF status ON public.flights FOR EACH ROW EXECUTE FUNCTION public.release_cancelled_mission();

CREATE OR REPLACE FUNCTION public.world_telemetry() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'airports', (SELECT count(*) FROM airports),
    'airlines', (SELECT count(*) FROM companies WHERE NOT is_personal),
    'pilots', (SELECT count(*) FROM profiles WHERE career_role IS NOT NULL),
    'flights', (SELECT count(*) FROM flights WHERE status='COMPLETED'))
$$;

REVOKE ALL ON FUNCTION public.refresh_special_missions(), public.accept_special_mission(uuid), public.flight_quote_cargo(uuid,text),
  public.flight_quote_full(uuid,text,integer,boolean,uuid), public.dispatch_flight_full(uuid,text,text,integer,boolean,uuid),
  public.cargo_capacity(text), public.cargo_stock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_special_missions(), public.accept_special_mission(uuid),
  public.flight_quote_full(uuid,text,integer,boolean,uuid), public.dispatch_flight_full(uuid,text,text,integer,boolean,uuid),
  public.cargo_capacity(text), public.cargo_stock(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.world_telemetry() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_flight(p_aircraft uuid, p_destination text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f fleet_aircraft%ROWTYPE; q jsonb; fid uuid; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; IF NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN RAISE EXCEPTION 'Web simulation is disabled; ACARS connection required'; END IF; SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF; INSERT INTO airport_passenger_pools(airport_icao,stock) SELECT icao,passenger_stock(icao) FROM airports WHERE icao IN(f.location_icao,p_destination) ON CONFLICT DO NOTHING; PERFORM 1 FROM airport_passenger_pools WHERE airport_icao IN(f.location_icao,p_destination) ORDER BY airport_icao FOR UPDATE; q:=flight_quote_cargo(p_aircraft,p_destination); IF (q->>'passengers')::int<=0 AND coalesce((q->>'cargo_kg')::numeric,0)<=0 THEN RAISE EXCEPTION 'No passengers or cargo available for this route'; END IF; IF company_balance(c.id)<(q->>'fuel_cost')::numeric+(q->>'landing_fee')::numeric+(q->>'handling_fee')::numeric+(q->>'maintenance')::numeric THEN RAISE EXCEPTION 'Insufficient operating reserve'; END IF; UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)-(q->>'passengers')::integer,updated_at=now(),last_departure_at=now() WHERE airport_icao=f.location_icao; INSERT INTO flights(company_id,aircraft_id,origin_icao,destination_icao,passengers,distance_nm,estimated_minutes,estimate,rules_snapshot) VALUES(c.id,f.id,f.location_icao,p_destination,(q->>'passengers')::int,(q->>'distance_nm')::numeric,(q->>'minutes')::numeric,q-'rules',q->'rules') RETURNING id INTO fid; UPDATE fleet_aircraft SET status='DISPATCHED' WHERE id=f.id; RETURN fid; END $function$;

CREATE OR REPLACE FUNCTION public.settle_flight(p_flight uuid, p_telemetry jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c companies%ROWTYPE; f flights%ROWTYPE; q jsonb; bal numeric; delta numeric; item record; dissolving integer; remaining numeric; m special_missions%ROWTYPE; cut numeric:=0; BEGIN SELECT * INTO c FROM companies WHERE user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; SELECT * INTO f FROM flights WHERE id=p_flight AND company_id=c.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Flight not found'; END IF; IF f.status='COMPLETED' THEN RETURN f.settlement; END IF; IF f.execution_source='ACARS_AGENT' THEN IF coalesce(current_setting('smoothsky.acars_settlement',true),'')<>f.id::text THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; ELSE IF f.execution_source<>'WEB_MANUAL' THEN RAISE EXCEPTION 'ACARS flights require verified telemetry ingestion'; END IF; IF NOT coalesce((SELECT (value #>> '{}')::boolean FROM economy_config WHERE key='web_simulation_enabled'),false) THEN RAISE EXCEPTION 'Test simulation disabled'; END IF; IF f.status<>'EN_ROUTE' THEN RAISE EXCEPTION 'Flight must be airborne before settlement'; END IF; IF now()<f.departed_at+make_interval(secs=>((f.estimated_minutes*60)/greatest(1,(f.rules_snapshot->>'simulation_time_scale')::numeric))::double precision) THEN RAISE EXCEPTION 'Flight has not arrived yet'; END IF; END IF; q:=f.estimate; SELECT * INTO m FROM special_missions WHERE flight_id=f.id FOR UPDATE; IF FOUND AND m.status='ACCEPTED' THEN IF now()>m.deadline_at THEN cut:=round((q->>'revenue')::numeric*0.5,2); q:=q||jsonb_build_object('revenue',(q->>'revenue')::numeric-cut,'net',(q->>'net')::numeric-cut,'late_penalty',cut); END IF; UPDATE special_missions SET status='COMPLETED',completed_at=now(),final_payout=(q->>'revenue')::numeric,delivered_late=cut>0 WHERE id=m.id; END IF; bal:=company_balance(c.id); FOR item IN SELECT * FROM (VALUES('TICKET_REVENUE','COMPANY_CASH','PASSENGER_REVENUE',(q->>'revenue')::numeric),('FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-(q->>'fuel_cost')::numeric),('AIRPORT_FEES','AIRPORT_EXPENSE','COMPANY_CASH',-(q->>'landing_fee')::numeric),('HANDLING_FEES','HANDLING_EXPENSE','COMPANY_CASH',-(q->>'handling_fee')::numeric),('MAINTENANCE_RESERVE','MAINTENANCE_EXPENSE','COMPANY_CASH',-(q->>'maintenance')::numeric)) AS v(kind,debit,credit,change) LOOP delta:=item.change; bal:=bal+delta; INSERT INTO company_ledger(company_id,entry_type,debit_account,credit_account,amount,company_delta,balance_after,description,reference,idempotency_key) VALUES(c.id,item.kind,item.debit,item.credit,abs(delta),delta,bal,item.kind||' – '||f.flight_number||' · '||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||' · '||f.origin_icao||' → '||f.destination_icao,f.id::text,'flight:'||f.id||':'||item.kind); END LOOP; PERFORM 1 FROM airport_passenger_pools WHERE airport_icao=f.destination_icao FOR UPDATE; dissolving:=round(f.passengers*((f.rules_snapshot->>'dissolve_min')::numeric+((f.rules_snapshot->>'dissolve_max')::numeric-(f.rules_snapshot->>'dissolve_min')::numeric)*random())); remaining:=passenger_stock(f.destination_icao)+f.passengers-dissolving; UPDATE airport_passenger_pools SET stock=least(passenger_capacity(f.destination_icao)*economy_number('transit_cap'),remaining),updated_at=now() WHERE airport_icao=f.destination_icao; UPDATE fleet_aircraft SET status='AVAILABLE',location_icao=f.destination_icao WHERE id=f.aircraft_id; q:=q||jsonb_build_object('balance_after',bal,'dissolved_passengers',dissolving); UPDATE flights SET status='COMPLETED',completed_at=now(),telemetry=CASE WHEN f.execution_source='ACARS_AGENT' THEN coalesce(f.telemetry,'{}'::jsonb)||p_telemetry||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','destination',f.destination_icao) ELSE jsonb_build_object('schema_version',1,'source','WEB_MANUAL','fuel_used_gal',f.estimate->'fuel_gal','destination',f.destination_icao) END,settlement=q WHERE id=f.id; RETURN q; END $function$;