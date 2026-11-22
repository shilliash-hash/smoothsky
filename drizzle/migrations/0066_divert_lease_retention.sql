DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.manage_lease(uuid,text,integer)'::regprocedure);
 n:=replace(d,'status IN (''DISPATCHED'',''EN_ROUTE'')','(status IN (''DISPATCHED'',''EN_ROUTE'') OR (status=''DIVERTED'' AND p_action<>''renew''))');
 n:=replace(n,'status=''AVAILABLE'' WHERE id=f.id','status=CASE WHEN f.status=''DIVERTED'' THEN ''DIVERTED'' ELSE ''AVAILABLE'' END WHERE id=f.id');
 IF n=d THEN RAISE EXCEPTION 'Divert lease retention patch failed'; END IF; EXECUTE n;
END $$;