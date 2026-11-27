-- CR-06 Maintenance, Reliability, Scheduled Checks & AOG. Manual deployment after 0089.
-- Additive: existing aircraft start at 100% Optimal with zeroed check counters (no surprise grounding).
ALTER TABLE public.fleet_aircraft
  ADD COLUMN IF NOT EXISTS reliability_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS hours_since_a_check numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_since_c_check numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_since_d_check numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_status text NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS defect_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_hard_landing_fpm numeric;
DO $$ BEGIN
  ALTER TABLE public.fleet_aircraft ADD CONSTRAINT fleet_maintenance_status_chk CHECK (maintenance_status IN ('OPERATIONAL','MINOR_DEFECT','MAJOR_DEFECT','AOG'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.fleet_aircraft ADD CONSTRAINT fleet_reliability_range_chk CHECK (reliability_pct BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.economy_config(key,value,description) VALUES
 ('maintenance_a_check_by_tier','[400,1500,4000,9000,18000,40000,75000]','A-Check base cost per aircraft tier T1–T7 (SC)'),
 ('maintenance_c_check_by_tier','[2400,9000,24000,54000,108000,240000,450000]','C-Check base cost per aircraft tier T1–T7 (SC)'),
 ('maintenance_d_check_by_tier','[8000,30000,80000,180000,360000,800000,1500000]','D-Check base cost per aircraft tier T1–T7 (SC)'),
 ('maintenance_a_check_interval_hours','100','Flight hours between A-Checks'),
 ('maintenance_c_check_interval_hours','600','Flight hours between C-Checks'),
 ('maintenance_d_check_interval_hours','2400','Flight hours between D-Checks'),
 ('maintenance_fly_in_mechanic_multiplier','2','Fly-in Mechanic cost multiplier on the A-Check price'),
 ('maintenance_fbo_bay_discount','0.35','Discount for own fleet at an FBO with Maintenance Bay'),
 ('spot_rental_hard_landing_fpm','600','Spot Rental hard landing threshold (absolute fpm)'),
 ('spot_rental_severe_landing_fpm','900','Spot Rental severe landing threshold (absolute fpm) – deposit forfeited'),
 ('spot_rental_hard_landing_penalty_pct','0.25','Spot Rental surcharge on the rental price after a hard landing')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.mx_cfg(p_key text, p_default numeric) RETURNS numeric
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key=p_key AND jsonb_typeof(value)='number'),p_default) $$;
CREATE OR REPLACE FUNCTION public.mx_tier_cost(p_key text, p_tier int) RETURNS numeric
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce((SELECT (value->>(greatest(1,least(7,p_tier))-1))::numeric FROM economy_config WHERE key=p_key AND jsonb_typeof(value)='array'),0) $$;
REVOKE ALL ON FUNCTION public.mx_cfg(text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mx_tier_cost(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mx_cfg(text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mx_tier_cost(text,int) TO authenticated, service_role;

-- Reliability wear per flight hour by band (Optimal/Good/Worn/Critical); overdue A-Check doubles wear.
CREATE OR REPLACE FUNCTION public.mx_wear_rate(p_rel numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p_rel>=90 THEN 0.2 WHEN p_rel>=70 THEN 0.8 WHEN p_rel>=50 THEN 1.8 ELSE 3 END $$;

-- Applied once when a flight completes (same path for MANUAL and ACARS settlement).
CREATE OR REPLACE FUNCTION public.apply_flight_maintenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; fpm numeric; hrs numeric; pts numeric:=0; rel numeric; st text; dep numeric; surcharge numeric;
BEGIN
 SELECT * INTO a FROM fleet_aircraft WHERE id=NEW.aircraft_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
 fpm := abs(nullif(coalesce(NEW.telemetry->>'landing_rate_fpm',NEW.settlement->>'landing_rate_fpm'),'')::numeric);
 IF a.ownership='RENTAL' THEN
  IF fpm IS NULL THEN RETURN NEW; END IF;
  IF fpm > mx_cfg('spot_rental_severe_landing_fpm',900) THEN
   dep := coalesce(nullif(a.lease_deposit,0),(SELECT company_delta FROM company_ledger WHERE idempotency_key='spot_deposit_refund:'||a.id),0);
   IF dep>0 THEN PERFORM company_post(a.company_id,'RENTAL_DAMAGE','RENTAL_EXPENSE','COMPANY_CASH',-dep,
     'Spot Rental deposit forfeited – severe landing '||round(fpm)||' fpm · '||a.registration,a.registration,'landing_forfeit:'||NEW.id); END IF;
  ELSIF fpm > mx_cfg('spot_rental_hard_landing_fpm',600) THEN
   surcharge := round(spot_rental_price(t.weekly_rate)*mx_cfg('spot_rental_hard_landing_penalty_pct',0.25),2);
   IF surcharge>0 THEN PERFORM company_post(a.company_id,'RENTAL_DAMAGE','RENTAL_EXPENSE','COMPANY_CASH',-surcharge,
     'Spot Rental hard landing surcharge '||round(fpm)||' fpm · '||a.registration,a.registration,'landing_surcharge:'||NEW.id); END IF;
  END IF;
  UPDATE fleet_aircraft SET last_hard_landing_fpm=CASE WHEN fpm>300 THEN fpm ELSE last_hard_landing_fpm END WHERE id=a.id;
  RETURN NEW;
 END IF;
 hrs := greatest(0,coalesce(NEW.estimated_minutes,0)/60.0);
 IF fpm>900 THEN pts:=15; ELSIF fpm>600 THEN pts:=5; ELSIF fpm>300 THEN pts:=1; END IF;
 rel := a.reliability_pct - hrs*mx_wear_rate(a.reliability_pct)*CASE WHEN a.hours_since_a_check>mx_cfg('maintenance_a_check_interval_hours',100) THEN 2 ELSE 1 END - pts;
 rel := greatest(0,least(100,round(rel,2)));
 st := a.maintenance_status;
 IF fpm>900 THEN st:='AOG';
 ELSIF st='MINOR_DEFECT' AND a.defect_hours+hrs>=10 THEN st:='MAJOR_DEFECT';
 ELSIF st='OPERATIONAL' AND (fpm>600 OR rel<50) THEN st:='MINOR_DEFECT'; END IF;
 UPDATE fleet_aircraft SET reliability_pct=rel, maintenance_status=st,
  hours_since_a_check=hours_since_a_check+hrs, hours_since_c_check=hours_since_c_check+hrs, hours_since_d_check=hours_since_d_check+hrs,
  defect_hours=CASE WHEN st='OPERATIONAL' THEN 0 WHEN a.maintenance_status='OPERATIONAL' THEN 0 ELSE defect_hours+hrs END,
  last_hard_landing_fpm=CASE WHEN fpm>300 THEN fpm ELSE last_hard_landing_fpm END
 WHERE id=a.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_flight_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_flight_maintenance() TO service_role;
DROP TRIGGER IF EXISTS apply_flight_maintenance ON public.flights;
CREATE TRIGGER apply_flight_maintenance AFTER UPDATE OF status ON public.flights
FOR EACH ROW WHEN (NEW.status='COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED')
EXECUTE FUNCTION public.apply_flight_maintenance();

-- Dispatch guard on every insert path: AOG grounded; Major defect = empty ferry flight only.
CREATE OR REPLACE FUNCTION public.enforce_maintenance_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE st text;
BEGIN
 SELECT maintenance_status INTO st FROM fleet_aircraft WHERE id=NEW.aircraft_id;
 IF st='AOG' THEN RAISE EXCEPTION 'Aircraft is AOG — repair it (local check or Fly-in Mechanic) before dispatch'; END IF;
 IF st='MAJOR_DEFECT' AND (coalesce(NEW.passengers,0)>0 OR coalesce((NEW.estimate->>'cargo_kg')::numeric,0)>0) THEN
  RAISE EXCEPTION 'Major defect — only an empty ferry flight to a maintenance airport is allowed'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_maintenance_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_maintenance_dispatch() TO service_role;
DROP TRIGGER IF EXISTS enforce_maintenance_dispatch ON public.flights;
CREATE TRIGGER enforce_maintenance_dispatch BEFORE INSERT ON public.flights
FOR EACH ROW EXECUTE FUNCTION public.enforce_maintenance_dispatch();

-- Quote: airport capability (size, +1 with own Maintenance Bay) and price per check kind.
CREATE OR REPLACE FUNCTION public.maintenance_quote(p_aircraft uuid, p_kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; lvl int; bay boolean; base numeric; cost numeric; need int;
BEGIN
 SELECT f.* INTO a FROM fleet_aircraft f JOIN companies c ON c.id=f.company_id WHERE f.id=p_aircraft AND c.user_id=auth.uid() AND f.returned_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 IF a.ownership='RENTAL' THEN RAISE EXCEPTION 'Spot Rental aircraft are maintained by the rental operator'; END IF;
 IF p_kind NOT IN ('A','C','D','MECHANIC') THEN RAISE EXCEPTION 'Unknown maintenance kind'; END IF;
 SELECT * INTO t FROM aircraft_types WHERE id=a.aircraft_type_id;
 bay := EXISTS(SELECT 1 FROM company_fobs WHERE company_id=a.company_id AND airport_icao=a.location_icao AND closed_at IS NULL AND has_maintenance_bay);
 lvl := least(7,coalesce((SELECT size FROM airports WHERE icao=a.location_icao),1)+CASE WHEN bay THEN 1 ELSE 0 END);
 need := CASE p_kind WHEN 'A' THEN 2 WHEN 'C' THEN 4 WHEN 'D' THEN 6 ELSE 1 END;
 base := CASE p_kind WHEN 'C' THEN mx_tier_cost('maintenance_c_check_by_tier',t.tier) WHEN 'D' THEN mx_tier_cost('maintenance_d_check_by_tier',t.tier)
   ELSE mx_tier_cost('maintenance_a_check_by_tier',t.tier) END;
 IF p_kind='MECHANIC' THEN base := base*mx_cfg('maintenance_fly_in_mechanic_multiplier',2); END IF;
 cost := round(base*CASE WHEN bay THEN 1-mx_cfg('maintenance_fbo_bay_discount',0.35) ELSE 1 END,2);
 RETURN jsonb_build_object('kind',p_kind,'airport_level',lvl,'required_level',need,'available',lvl>=need,'fbo_bay',bay,'base_cost',base,'cost',cost);
END $$;
REVOKE ALL ON FUNCTION public.maintenance_quote(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_quote(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_maintenance(p_aircraft uuid, p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; a fleet_aircraft%ROWTYPE; cost numeric; label text;
BEGIN
 q := maintenance_quote(p_aircraft,p_kind);
 SELECT * INTO a FROM fleet_aircraft WHERE id=p_aircraft;
 PERFORM 1 FROM companies WHERE id=a.company_id FOR UPDATE;
 SELECT * INTO a FROM fleet_aircraft WHERE id=p_aircraft FOR UPDATE;
 IF a.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Aircraft must be on the ground and idle'; END IF;
 IF NOT (q->>'available')::boolean THEN RAISE EXCEPTION '%-Check needs airport level % (here %)',p_kind,q->>'required_level',q->>'airport_level'; END IF;
 cost := (q->>'cost')::numeric;
 IF company_balance(a.company_id)<cost THEN RAISE EXCEPTION 'Insufficient Smooth Coins'; END IF;
 label := CASE p_kind WHEN 'MECHANIC' THEN 'Fly-in Mechanic repair' ELSE p_kind||'-Check' END;
 IF cost>0 THEN PERFORM company_post(a.company_id,'MAINTENANCE','MAINTENANCE_EXPENSE','COMPANY_CASH',-cost,
   label||' – '||a.registration||' at '||a.location_icao||CASE WHEN (q->>'fbo_bay')::boolean THEN ' (FBO Maintenance Bay)' ELSE '' END,
   a.registration,'maintenance:'||a.id||':'||p_kind||':'||extract(epoch FROM clock_timestamp())); END IF;
 UPDATE fleet_aircraft SET maintenance_status='OPERATIONAL', defect_hours=0,
  reliability_pct=CASE p_kind WHEN 'A' THEN least(100,reliability_pct+10) WHEN 'C' THEN greatest(reliability_pct,95) WHEN 'D' THEN 100 ELSE greatest(reliability_pct,50) END,
  hours_since_a_check=CASE WHEN p_kind IN ('A','C','D') THEN 0 ELSE hours_since_a_check END,
  hours_since_c_check=CASE WHEN p_kind IN ('C','D') THEN 0 ELSE hours_since_c_check END,
  hours_since_d_check=CASE WHEN p_kind='D' THEN 0 ELSE hours_since_d_check END
 WHERE id=a.id;
 RETURN q;
END $$;
REVOKE ALL ON FUNCTION public.perform_maintenance(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_maintenance(uuid,text) TO authenticated, service_role;
