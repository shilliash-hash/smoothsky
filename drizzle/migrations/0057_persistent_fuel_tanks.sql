ALTER TABLE public.fleet_aircraft ADD COLUMN IF NOT EXISTS current_fuel_gal numeric NOT NULL DEFAULT 0;
UPDATE public.fleet_aircraft f SET current_fuel_gal = round(t.fuel_capacity_gal*0.5,2) FROM public.aircraft_types t WHERE t.id=f.aircraft_type_id AND f.ownership<>'RENTAL' AND f.status<>'RETURNED';
ALTER TABLE public.fleet_aircraft ADD CONSTRAINT fleet_aircraft_current_fuel_nonneg CHECK (current_fuel_gal >= 0);
INSERT INTO public.economy_config(key,value,description) VALUES ('initial_fuel_capacity_pct','0.5','Share of tank capacity delivered with newly bought or leased aircraft (0–1)') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.init_aircraft_fuel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.ownership='RENTAL' THEN NEW.current_fuel_gal:=0;
 ELSIF coalesce(NEW.current_fuel_gal,0)=0 THEN
  SELECT round(fuel_capacity_gal*least(1,greatest(0,economy_number_or('initial_fuel_capacity_pct',0.5))),2) INTO NEW.current_fuel_gal FROM aircraft_types WHERE id=NEW.aircraft_type_id;
 END IF;
 NEW.current_fuel_gal:=coalesce(NEW.current_fuel_gal,0); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS init_aircraft_fuel ON public.fleet_aircraft;
CREATE TRIGGER init_aircraft_fuel BEFORE INSERT ON public.fleet_aircraft FOR EACH ROW EXECUTE FUNCTION public.init_aircraft_fuel();

CREATE OR REPLACE FUNCTION public.flight_weight_budget(p_type text, p_distance_nm numeric)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t aircraft_types%ROWTYPE; r operating_rules%ROWTYPE; trip numeric; reserve numeric; density numeric; fuel_mass numeric; available numeric; pax_mass numeric; floor_pct numeric; landing_rate numeric; planned numeric; tgt numeric;
BEGIN
 SELECT * INTO t FROM aircraft_types WHERE id=p_type;
 IF NOT FOUND OR t.empty_weight_kg<=0 OR t.mtow_kg<=t.empty_weight_kg OR t.cruise_kts<=0 OR t.fuel_burn_gph<=0 THEN RAISE EXCEPTION 'Configure valid aircraft empty weight, MTOW, speed and fuel burn'; END IF;
 IF p_distance_nm IS NULL OR p_distance_nm<0 THEN RAISE EXCEPTION 'Invalid flight distance'; END IF;
 SELECT * INTO r FROM operating_rules WHERE singleton;
 density:=CASE WHEN t.fuel_type='100LL' THEN r.avgas_kg_per_litre ELSE r.jeta_kg_per_litre END * 3.785411784;
 IF density IS NULL OR density<=0 THEN RAISE EXCEPTION 'Invalid fuel density'; END IF;
 trip:=p_distance_nm/t.cruise_kts*t.fuel_burn_gph;
 reserve:=economy_number('fuel_reserve_minutes')/60*t.fuel_burn_gph;
 IF trip+reserve>t.fuel_capacity_gal THEN RAISE EXCEPTION 'Insufficient fuel capacity with reserve'; END IF;
 tgt:=nullif(current_setting('smoothsky.target_fuel',true),'')::numeric;
 planned:=greatest(trip+reserve,coalesce(tgt,0));
 IF planned>t.fuel_capacity_gal+0.01 THEN RAISE EXCEPTION 'Target fuel exceeds tank capacity (% gal)', round(t.fuel_capacity_gal); END IF;
 planned:=least(planned,t.fuel_capacity_gal);
 fuel_mass:=planned*density;
 IF t.empty_weight_kg+fuel_mass>t.mtow_kg THEN RAISE EXCEPTION 'Fuel on board exceeds MTOW even with no payload'; END IF;
 available:=greatest(0,t.mtow_kg-t.empty_weight_kg-fuel_mass);
 pax_mass:=economy_number_or('passenger_weight_kg',80);
 floor_pct:=economy_number_or('fuel_billing_floor_pct',0.80);
 landing_rate:=economy_number_or('landing_fee_per_ton_mtow',2.5);
 IF pax_mass<=0 OR floor_pct<0 OR floor_pct>1 OR landing_rate<0 THEN RAISE EXCEPTION 'Invalid weight-budget economy settings'; END IF;
 RETURN jsonb_build_object('version',1,'empty_weight_kg',t.empty_weight_kg,'mtow_kg',t.mtow_kg,'trip_fuel_gal',trip,'reserve_fuel_gal',reserve,'planned_fuel_gal',planned,'min_safe_fuel_gal',trip+reserve,'fuel_capacity_gal',t.fuel_capacity_gal,'fuel_kg_per_gal',density,'planned_fuel_kg',fuel_mass,'available_payload_kg',available,'passenger_weight_kg',pax_mass,'fuel_billing_floor_pct',floor_pct,'landing_fee_per_ton_mtow',landing_rate);
END $function$;

CREATE OR REPLACE FUNCTION public.flight_tank_plan(q jsonb, p_current numeric, p_persistent boolean) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE wb jsonb:=q->'weight_budget'; target numeric; added numeric; price numeric; payload numeric; mx numeric;
BEGIN
 IF wb IS NULL THEN RETURN q; END IF;
 target:=(wb->>'planned_fuel_gal')::numeric;
 price:=(q->>'fuel_price_per_gal')::numeric*(1-coalesce((q->'fob_discounts'->>'fuel')::numeric,0));
 payload:=coalesce((wb->>'payload_kg')::numeric,0);
 mx:=least((wb->>'fuel_capacity_gal')::numeric,((wb->>'mtow_kg')::numeric-(wb->>'empty_weight_kg')::numeric-payload)/(wb->>'fuel_kg_per_gal')::numeric);
 IF p_persistent THEN added:=greatest(0,target-p_current); ELSE added:=target; END IF;
 RETURN q||jsonb_build_object('tank',jsonb_build_object('persistent',p_persistent,'current_fuel_gal',CASE WHEN p_persistent THEN p_current ELSE 0 END,'min_target_gal',CASE WHEN p_persistent THEN greatest((wb->>'min_safe_fuel_gal')::numeric,p_current) ELSE (wb->>'min_safe_fuel_gal')::numeric END,'target_fuel_gal',target,'max_target_gal',greatest(target,mx),'added_fuel_gal',added,'uplift_cost',CASE WHEN p_persistent THEN round(added*price,2) ELSE 0 END,'fuel_price_effective_per_gal',price));
END $$;

CREATE OR REPLACE FUNCTION public.set_target_fuel(p_aircraft uuid, p_target numeric) RETURNS TABLE(cur numeric, persistent boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f fleet_aircraft%ROWTYPE;
BEGIN
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN (SELECT id FROM companies WHERE user_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 IF p_target IS NOT NULL AND (p_target<0 OR p_target::text IN ('NaN','Infinity')) THEN RAISE EXCEPTION 'Invalid target fuel'; END IF;
 persistent:=f.ownership<>'RENTAL'; cur:=f.current_fuel_gal;
 IF persistent THEN PERFORM set_config('smoothsky.target_fuel',greatest(coalesce(p_target,0),f.current_fuel_gal)::text,true);
 ELSE PERFORM set_config('smoothsky.target_fuel','',true); END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.set_target_fuel(uuid,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.flight_quote_fueled(p_aircraft uuid, p_destination text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; q jsonb;
BEGIN
 SELECT * INTO s FROM set_target_fuel(p_aircraft,p_target_fuel_gal);
 q:=flight_quote_full(p_aircraft,p_destination,p_cargo_kg,p_all_cargo,p_mission);
 PERFORM set_config('smoothsky.target_fuel','',true);
 RETURN flight_tank_plan(q,s.cur,s.persistent);
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_flight_fueled(p_aircraft uuid, p_destination text, p_flight_number text, p_cargo_kg integer DEFAULT 0, p_all_cargo boolean DEFAULT false, p_mission uuid DEFAULT NULL, p_target_fuel_gal numeric DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; fid uuid;
BEGIN
 SELECT * INTO s FROM set_target_fuel(p_aircraft,p_target_fuel_gal);
 fid:=dispatch_flight_full(p_aircraft,p_destination,p_flight_number,p_cargo_kg,p_all_cargo,p_mission);
 PERFORM set_config('smoothsky.target_fuel','',true);
 RETURN fid;
END $$;
GRANT EXECUTE ON FUNCTION public.flight_quote_fueled(uuid,text,integer,boolean,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_flight_fueled(uuid,text,text,integer,boolean,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_dispatch_fuel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE fuel text; needed numeric; available numeric; a fleet_aircraft%ROWTYPE; target numeric; price numeric; cost numeric:=0; persistent boolean;
BEGIN
 SELECT * INTO a FROM fleet_aircraft WHERE id=NEW.aircraft_id;
 SELECT t.fuel_type INTO fuel FROM aircraft_types t WHERE t.id=a.aircraft_type_id;
 persistent:=a.ownership<>'RENTAL' AND NEW.estimate ? 'weight_budget';
 IF persistent THEN
  target:=greatest((NEW.estimate->'weight_budget'->>'planned_fuel_gal')::numeric,a.current_fuel_gal);
  needed:=round(greatest(0,target-a.current_fuel_gal),4);
  price:=(NEW.estimate->>'fuel_price_per_gal')::numeric*(1-coalesce((NEW.estimate->'fob_discounts'->>'fuel')::numeric,0));
  cost:=round(needed*price,2);
 ELSE needed:=(NEW.estimate->>'fuel_gal')::numeric; END IF;
 INSERT INTO airport_fuel_pools(airport_icao,fuel_type,stock_gal) VALUES(NEW.origin_icao,fuel,airport_fuel_stock(NEW.origin_icao,fuel)) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM airport_fuel_pools WHERE airport_icao=NEW.origin_icao AND fuel_type=fuel FOR UPDATE;
 available:=airport_fuel_stock(NEW.origin_icao,fuel);
 IF needed IS NULL OR needed<0 OR available<needed THEN RAISE EXCEPTION 'Insufficient airport fuel stock'; END IF;
 UPDATE airport_fuel_pools SET stock_gal=available-needed,updated_at=now() WHERE airport_icao=NEW.origin_icao AND fuel_type=fuel;
 NEW.estimate:=NEW.estimate||jsonb_build_object('fuel_type',fuel,'fuel_reserved_gal',needed);
 IF persistent THEN
  IF cost>0 THEN
   IF company_balance(NEW.company_id)<cost THEN RAISE EXCEPTION 'Insufficient funds for fuel uplift'; END IF;
   PERFORM company_post(NEW.company_id,'FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-cost,'Fuel uplift – '||round(needed,1)||' gal · '||a.registration||' · '||NEW.origin_icao,NEW.id::text,'flight:'||NEW.id||':FUEL_UPLIFT');
  END IF;
  NEW.estimate:=NEW.estimate||jsonb_build_object('initial_fuel_gal',a.current_fuel_gal,'target_fuel_gal',target,'fuel_uplift_gal',needed,'fuel_uplift_cost',cost,'fuel_uplift_price_per_gal',price);
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.return_cancelled_fuel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE fuel text; amount numeric; cost numeric; persistent boolean;
BEGIN
 IF NEW.status='CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
  persistent:=OLD.estimate ? 'fuel_uplift_gal';
  IF OLD.status='DISPATCHED' OR (persistent AND OLD.status='EN_ROUTE') THEN
   fuel:=OLD.estimate->>'fuel_type'; amount:=(OLD.estimate->>'fuel_reserved_gal')::numeric;
   IF fuel IS NOT NULL AND amount IS NOT NULL AND amount>0 THEN
    PERFORM 1 FROM airport_fuel_pools WHERE airport_icao=OLD.origin_icao AND fuel_type=fuel FOR UPDATE;
    UPDATE airport_fuel_pools SET stock_gal=least(airport_fuel_capacity(OLD.origin_icao,fuel),airport_fuel_stock(OLD.origin_icao,fuel)+amount),updated_at=now() WHERE airport_icao=OLD.origin_icao AND fuel_type=fuel;
   END IF;
   cost:=coalesce((OLD.estimate->>'fuel_uplift_cost')::numeric,0);
   IF persistent AND cost>0 AND NOT EXISTS(SELECT 1 FROM company_ledger WHERE idempotency_key='flight:'||OLD.id||':FUEL_REFUND') THEN
    PERFORM company_post(OLD.company_id,'FUEL_REFUND','COMPANY_CASH','FUEL_EXPENSE',cost,'Fuel uplift refund – cancelled '||coalesce(OLD.flight_number,'flight')||' · '||OLD.origin_icao,OLD.id::text,'flight:'||OLD.id||':FUEL_REFUND');
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;

DO $do$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 n:=replace(d,$$('FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-(q->>'fuel_cost')::numeric)$$,$$('FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',CASE WHEN q ? 'fuel_uplift_gal' THEN 0 ELSE -(q->>'fuel_cost')::numeric END)$$);
 n:=replace(n,$$location_icao=f.destination_icao WHERE id=f.aircraft_id$$,$$location_icao=f.destination_icao,current_fuel_gal=CASE WHEN ownership='RENTAL' THEN 0 WHEN q ? 'fuel_uplift_gal' THEN greatest(0,round((q->>'target_fuel_gal')::numeric-coalesce((q->>'billed_fuel_gal')::numeric,(q->>'fuel_gal')::numeric,0),4)) ELSE current_fuel_gal END WHERE id=f.aircraft_id$$);
 IF n=d OR position('fuel_uplift_gal'' THEN greatest' in n)=0 OR position('THEN 0 ELSE -(q->>''fuel_cost'')' in n)=0 THEN RAISE EXCEPTION 'settle_flight patch failed'; END IF;
 EXECUTE n;
 d:=pg_get_functiondef('public.company_daily_results'::regproc);
 n:=replace(d,$$'SPOT_RENTAL','TYPE_RATING','LEASE_TERMINATION_FEE')),0)$$,$$'SPOT_RENTAL','TYPE_RATING','LEASE_TERMINATION_FEE')),0)-coalesce(sum(amount) FILTER(WHERE entry_type='FUEL_REFUND'),0)$$);
 IF n=d THEN RAISE EXCEPTION 'daily results patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.aircraft_finance'::regproc);
 n:=replace(d,$$'fuel',coalesce(sum(amount) FILTER(WHERE entry_type='FUEL_EXPENSE'),0)$$,$$'fuel',coalesce(sum(amount) FILTER(WHERE entry_type='FUEL_EXPENSE'),0)-coalesce(sum(amount) FILTER(WHERE entry_type='FUEL_REFUND'),0)$$);
 IF n=d THEN RAISE EXCEPTION 'aircraft finance patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.pay_due_dividends'::regproc);
 n:=replace(d,$$'SPOT_RENTAL','TYPE_RATING');$$,$$'SPOT_RENTAL','TYPE_RATING','FUEL_REFUND');$$);
 IF n=d THEN RAISE EXCEPTION 'dividends patch failed'; END IF; EXECUTE n;
END $do$;