DO $$ DECLARE d text; g text:='IF NOT coalesce((SELECT (value #>> ''{}'')::boolean FROM economy_config WHERE key=''web_simulation_enabled''),false) THEN RAISE EXCEPTION ''Web simulation is disabled; ACARS connection required''; END IF;'; ins text:='RETURNING id INTO fid;'; BEGIN
SELECT pg_get_functiondef('public.dispatch_flight(uuid,text)'::regprocedure) INTO d;
IF position(g IN d)=0 OR position(ins IN d)=0 THEN RAISE EXCEPTION 'dispatch guard not found'; END IF;
d:=replace(d,g,'');
d:=replace(d,ins,ins||' IF NOT coalesce((SELECT (value #>> ''{}'')::boolean FROM economy_config WHERE key=''web_simulation_enabled''),false) THEN UPDATE flights SET execution_source=''ACARS_AGENT'' WHERE id=fid; END IF;');
EXECUTE d; END $$;