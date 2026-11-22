DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.divert_leg_quote(public.flights,text,numeric,boolean)'::regprocedure);
 n:=replace(d,'contract:=coalesce(f.divert_state->''contract'',f.estimate);','contract:=coalesce(f.divert_state->''contract'',f.estimate); contract:=contract||jsonb_build_object(''rules'',coalesce(contract->''rules'',f.rules_snapshot));');
 IF n=d THEN RAISE EXCEPTION 'Divert rule snapshot patch failed'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.record_divert(public.flights,text,jsonb)'::regprocedure);
 n:=replace(d,'''contract'',f.estimate,''original_origin''','''contract'',f.estimate||jsonb_build_object(''rules'',coalesce(f.estimate->''rules'',f.rules_snapshot)),''original_origin''');
 IF n=d THEN RAISE EXCEPTION 'Divert contract snapshot patch failed'; END IF; EXECUTE n;
END $$;