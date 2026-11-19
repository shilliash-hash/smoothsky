CREATE OR REPLACE FUNCTION public.new_acars_key() RETURNS text LANGUAGE sql VOLATILE SET search_path=public AS $$ SELECT 'ssk_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') $$;
REVOKE ALL ON FUNCTION public.new_acars_key() FROM PUBLIC,anon,authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  acars_api_key text NOT NULL UNIQUE DEFAULT public.new_acars_key(),
  acars_last_seen timestamptz,
  simbrief_username text CHECK (simbrief_username IS NULL OR simbrief_username ~ '^[A-Za-z0-9_.-]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (simbrief_username) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pilot reads own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid()=id);
CREATE POLICY "Pilot updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
INSERT INTO public.profiles(id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles(id) VALUES(NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.handle_new_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

CREATE OR REPLACE FUNCTION public.ensure_my_profile() RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p profiles; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; INSERT INTO profiles(id) VALUES(auth.uid()) ON CONFLICT DO NOTHING; SELECT * INTO p FROM profiles WHERE id=auth.uid(); RETURN p; END $$;
CREATE OR REPLACE FUNCTION public.regenerate_acars_key() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE k text:=new_acars_key(); BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; INSERT INTO profiles(id,acars_api_key) VALUES(auth.uid(),k) ON CONFLICT(id) DO UPDATE SET acars_api_key=k, acars_last_seen=NULL; RETURN k; END $$;
REVOKE ALL ON FUNCTION public.ensure_my_profile(), public.regenerate_acars_key() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile(), public.regenerate_acars_key() TO authenticated;

-- ACARS-agent flights may be settled only through acars_pirep (transaction-local marker), sharing settle_flight.
DO $$ DECLARE d text; g text:='IF f.execution_source<>''WEB_MANUAL'' THEN RAISE EXCEPTION ''ACARS flights require verified telemetry ingestion''; END IF; IF NOT coalesce((SELECT (value #>> ''{}'')::boolean FROM economy_config WHERE key=''web_simulation_enabled''),false) THEN RAISE EXCEPTION ''Test simulation disabled''; END IF; IF f.status<>''EN_ROUTE'' THEN RAISE EXCEPTION ''Flight must be airborne before settlement''; END IF; IF now()<f.departed_at+make_interval(secs=>((f.estimated_minutes*60)/greatest(1,(f.rules_snapshot->>''simulation_time_scale'')::numeric))::double precision) THEN RAISE EXCEPTION ''Flight has not arrived yet''; END IF;'; t text:='telemetry=jsonb_build_object(''schema_version'',1,''source'',''WEB_MANUAL'',''fuel_used_gal'',f.estimate->''fuel_gal'',''destination'',f.destination_icao)';
BEGIN SELECT pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure) INTO d;
IF position(g IN d)=0 OR position(t IN d)=0 THEN RAISE EXCEPTION 'settle_flight guard not found'; END IF;
d:=replace(d,g,'IF f.execution_source=''ACARS_AGENT'' THEN IF coalesce(current_setting(''smoothsky.acars_settlement'',true),'''')<>f.id::text THEN RAISE EXCEPTION ''ACARS flights require verified telemetry ingestion''; END IF; IF f.status<>''EN_ROUTE'' THEN RAISE EXCEPTION ''Flight must be airborne before settlement''; END IF; ELSE '||g||' END IF;');
d:=replace(d,t,'telemetry=CASE WHEN f.execution_source=''ACARS_AGENT'' THEN coalesce(f.telemetry,''{}''::jsonb)||p_telemetry||jsonb_build_object(''schema_version'',1,''source'',''ACARS_AGENT'',''destination'',f.destination_icao) ELSE jsonb_build_object(''schema_version'',1,''source'',''WEB_MANUAL'',''fuel_used_gal'',f.estimate->''fuel_gal'',''destination'',f.destination_icao) END');
EXECUTE d; END $$;

CREATE OR REPLACE FUNCTION public.acars_pilot(p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid; BEGIN SELECT id INTO uid FROM profiles WHERE acars_api_key=p_key; IF uid IS NULL THEN RAISE EXCEPTION 'Invalid ACARS key' USING ERRCODE='28000'; END IF; UPDATE profiles SET acars_last_seen=now() WHERE id=uid; RETURN uid; END $$;
REVOKE ALL ON FUNCTION public.acars_pilot(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.acars_flight_json(f flights) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('flight_id',f.id,'flight_number',f.flight_number,'registration',a.registration,'aircraft_type',a.aircraft_type_id,'origin_icao',f.origin_icao,'destination_icao',f.destination_icao,'status',f.status,'execution_source',f.execution_source,'passengers',f.passengers,'distance_nm',f.distance_nm,'planned_fuel_gal',f.estimate->'fuel_gal') FROM fleet_aircraft a WHERE a.id=f.aircraft_id $$;
REVOKE ALL ON FUNCTION public.acars_flight_json(flights) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.acars_connect(p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=acars_pilot(p_key); f flights; n int; BEGIN
SELECT count(*) INTO n FROM flights x JOIN companies c ON c.id=x.company_id WHERE c.user_id=uid AND x.status IN('DISPATCHED','EN_ROUTE');
SELECT x.* INTO f FROM flights x JOIN companies c ON c.id=x.company_id WHERE c.user_id=uid AND x.status IN('DISPATCHED','EN_ROUTE') ORDER BY (x.execution_source='ACARS_AGENT') DESC, x.created_at LIMIT 1;
IF NOT FOUND THEN RETURN jsonb_build_object('flight',NULL,'active_flights',0); END IF;
RETURN jsonb_build_object('flight',acars_flight_json(f),'active_flights',n); END $$;

CREATE OR REPLACE FUNCTION public.acars_position(p_key text, p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=acars_pilot(p_key); cid uuid; f flights; n int; BEGIN
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
UPDATE flights SET telemetry=coalesce(telemetry,'{}'::jsonb)||jsonb_build_object('schema_version',1,'source','ACARS_AGENT','live',p||jsonb_build_object('received_at',now())) WHERE id=f.id;
RETURN jsonb_build_object('ok',true,'flight_id',f.id,'flight_number',f.flight_number); END $$;

CREATE OR REPLACE FUNCTION public.acars_pirep(p_key text, p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=acars_pilot(p_key); fid uuid; BEGIN
SELECT x.id INTO fid FROM flights x JOIN companies c ON c.id=x.company_id WHERE c.user_id=uid AND x.status='EN_ROUTE' AND x.execution_source='ACARS_AGENT';
IF fid IS NULL THEN RAISE EXCEPTION 'No ACARS flight en route' USING ERRCODE='P0002'; END IF;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
PERFORM set_config('smoothsky.acars_settlement',fid::text,true);
RETURN settle_flight(fid,jsonb_build_object('pirep',p||jsonb_build_object('received_at',now()),'fuel_used_gal',p->'fuel_used_gal','landing_rate_fpm',p->'landing_rate_fpm')); END $$;

REVOKE ALL ON FUNCTION public.acars_connect(text), public.acars_position(text,jsonb), public.acars_pirep(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acars_connect(text), public.acars_position(text,jsonb), public.acars_pirep(text,jsonb) TO anon, authenticated;