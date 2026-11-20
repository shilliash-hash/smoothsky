DO $$ DECLARE d text; old text; BEGIN
old:='a.ownership=''OWNED'' OR EXISTS'; d:=pg_get_functiondef('public.pilot_operations()'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected crew definition'; END IF; EXECUTE replace(d,old,'a.ownership IN (''OWNED'',''RENTAL'') OR EXISTS');
old:='''FOB_UPKEEP'',''PILOT_COMMISSION'''; d:=pg_get_functiondef('public.pay_due_dividends(uuid)'::regprocedure); IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected dividend definition'; END IF; EXECUTE replace(d,old,'''FOB_UPKEEP'',''PILOT_COMMISSION'',''SPOT_RENTAL''');
END $$;