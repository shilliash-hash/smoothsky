CREATE TABLE public.airports (
  icao text PRIMARY KEY CHECK (icao ~ '^[A-Z0-9]{4}$'),
  iata text, name text NOT NULL, city text NOT NULL, country text NOT NULL,
  lat double precision NOT NULL, lon double precision NOT NULL
);
GRANT SELECT ON public.airports TO anon, authenticated;
GRANT ALL ON public.airports TO service_role;
ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Airports are public" ON public.airports FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.aircraft_types (
  id text PRIMARY KEY, tier int NOT NULL, manufacturer text NOT NULL, model text NOT NULL,
  pax int NOT NULL, cargo_kg int NOT NULL, range_nm int NOT NULL, cruise_kts int NOT NULL,
  engine text NOT NULL, security_deposit numeric(14,2) NOT NULL, weekly_rate numeric(14,2) NOT NULL
);
GRANT SELECT ON public.aircraft_types TO anon, authenticated;
GRANT ALL ON public.aircraft_types TO service_role;
ALTER TABLE public.aircraft_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aircraft catalogue is public" ON public.aircraft_types FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.aircraft_types VALUES
('C172',1,'Cessna','172 Skyhawk',3,0,640,122,'Single piston',5000,1500),
('BE58',2,'Beechcraft','Baron 58',5,150,1480,200,'Twin piston',12000,3800),
('B350',3,'Beechcraft','King Air 350',9,400,1800,312,'Twin turboprop',35000,9500);

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 60),
  icao_code text NOT NULL UNIQUE CHECK (icao_code ~ '^[A-Z]{3}$'),
  home_base_icao text NOT NULL REFERENCES public.airports(icao),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own company" ON public.companies FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.company_ledger (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT')),
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  company_delta numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL,
  description text NOT NULL,
  reference text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_ledger_company_idx ON public.company_ledger(company_id, id DESC);
GRANT SELECT ON public.company_ledger TO authenticated;
GRANT ALL ON public.company_ledger TO service_role;
ALTER TABLE public.company_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own ledger" ON public.company_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Ledger entries are immutable'; END; $$;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON public.company_ledger
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION public.ledger_immutable();

CREATE TABLE public.fleet_aircraft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  aircraft_type_id text NOT NULL REFERENCES public.aircraft_types(id),
  registration text NOT NULL UNIQUE,
  location_icao text NOT NULL REFERENCES public.airports(icao),
  status text NOT NULL DEFAULT 'AVAILABLE',
  lease_deposit numeric(14,2) NOT NULL,
  weekly_rate numeric(14,2) NOT NULL,
  leased_at timestamptz NOT NULL DEFAULT now(),
  next_payment_due timestamptz NOT NULL
);
GRANT SELECT ON public.fleet_aircraft TO authenticated;
GRANT ALL ON public.fleet_aircraft TO service_role;
ALTER TABLE public.fleet_aircraft ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own fleet" ON public.fleet_aircraft FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.company_balance(p_company uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT balance_after FROM public.company_ledger WHERE company_id = p_company AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company AND c.user_id = auth.uid()) ORDER BY id DESC LIMIT 1), 0);
$$;

CREATE OR REPLACE FUNCTION public.is_company_code_available(p_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(p_code) ~ '^[A-Z]{3}$' AND NOT EXISTS (SELECT 1 FROM public.companies WHERE icao_code = upper(p_code));
$$;

CREATE OR REPLACE FUNCTION public.create_company(p_name text, p_icao_code text, p_home_base text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_code text := upper(trim(p_icao_code));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE user_id = v_uid) THEN RAISE EXCEPTION 'Company already exists'; END IF;
  IF v_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'ICAO code must be exactly 3 letters'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE icao_code = v_code) THEN RAISE EXCEPTION 'ICAO code already taken'; END IF;
  IF NOT EXISTS (SELECT 1 FROM airports WHERE icao = upper(p_home_base)) THEN RAISE EXCEPTION 'Unknown home base airport'; END IF;
  INSERT INTO companies(user_id, name, icao_code, home_base_icao)
    VALUES (v_uid, trim(p_name), v_code, upper(p_home_base)) RETURNING id INTO v_id;
  INSERT INTO company_ledger(company_id, entry_type, debit_account, credit_account, amount, company_delta, balance_after, description, idempotency_key)
    VALUES (v_id, 'INITIAL_GRANT', 'COMPANY_CASH', 'SYSTEM_TREASURY', 50000, 50000, 50000, 'Initial capital grant', 'initial_grant:' || v_id);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.lease_aircraft(p_type text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c companies%ROWTYPE; v_t aircraft_types%ROWTYPE; v_bal numeric; v_total numeric;
  v_id uuid := gen_random_uuid(); v_reg text; v_count int;
BEGIN
  SELECT * INTO v_c FROM companies WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF;
  SELECT * INTO v_t FROM aircraft_types WHERE id = p_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown aircraft type'; END IF;
  SELECT count(*) INTO v_count FROM fleet_aircraft WHERE company_id = v_c.id;
  IF v_count >= 3 THEN RAISE EXCEPTION 'Lease limit reached (max 3 aircraft)'; END IF;
  v_bal := company_balance(v_c.id);
  v_total := v_t.security_deposit + v_t.weekly_rate;
  IF v_bal < v_total THEN RAISE EXCEPTION 'Insufficient funds: need % Cr, have % Cr', v_total, v_bal; END IF;
  LOOP
    v_reg := 'SS-' || v_c.icao_code || lpad((floor(random()*100))::int::text, 2, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM fleet_aircraft WHERE registration = v_reg);
  END LOOP;
  INSERT INTO fleet_aircraft(id, company_id, aircraft_type_id, registration, location_icao, lease_deposit, weekly_rate, next_payment_due)
    VALUES (v_id, v_c.id, v_t.id, v_reg, v_c.home_base_icao, v_t.security_deposit, v_t.weekly_rate, now() + interval '7 days');
  INSERT INTO company_ledger(company_id, entry_type, debit_account, credit_account, amount, company_delta, balance_after, description, reference, idempotency_key)
    VALUES (v_c.id, 'LEASE_DEPOSIT', 'LESSOR_DEPOSITS', 'COMPANY_CASH', v_t.security_deposit, -v_t.security_deposit, v_bal - v_t.security_deposit,
      'Security deposit – ' || v_t.manufacturer || ' ' || v_t.model || ' ' || v_reg, v_reg, 'lease_deposit:' || v_id),
    (v_c.id, 'LEASE_PAYMENT', 'LESSOR_REVENUE', 'COMPANY_CASH', v_t.weekly_rate, -v_t.weekly_rate, v_bal - v_total,
      'First weekly lease payment – ' || v_reg, v_reg, 'lease_payment:' || v_id || ':1');
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_company(text,text,text), public.lease_aircraft(text), public.company_balance(uuid), public.is_company_code_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(text,text,text), public.lease_aircraft(text), public.company_balance(uuid), public.is_company_code_available(text) TO authenticated;