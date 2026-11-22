CREATE OR REPLACE FUNCTION public.ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND public.is_admin()
    AND current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.admin_cleanup_company(uuid)'::regprocedure)) THEN
  IF TG_TABLE_NAME='company_ledger' THEN
   IF OLD.company_id::text = nullif(current_setting('smoothsky.cleanup_company',true),'') THEN RETURN OLD; END IF;
  ELSIF TG_TABLE_NAME='pilot_ledger' THEN
   IF OLD.user_id::text = nullif(current_setting('smoothsky.cleanup_user',true),'') THEN RETURN OLD; END IF;
  END IF;
 END IF;
 RAISE EXCEPTION 'Ledger entries are immutable';
END $$;