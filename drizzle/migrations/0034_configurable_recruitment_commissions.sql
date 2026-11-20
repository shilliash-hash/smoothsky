CREATE OR REPLACE FUNCTION public.recruitment_commission_settings() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT coalesce((SELECT value FROM economy_config WHERE key='recruitment_commissions'), '{"roster":{"min":35,"max":50,"default":40},"freelance":{"min":20,"max":30,"default":25}}'::jsonb) $$;
GRANT EXECUTE ON FUNCTION public.recruitment_commission_settings() TO authenticated;
CREATE OR REPLACE FUNCTION public.validate_recruitment_config() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE mode text; lo numeric; hi numeric; def numeric;
BEGIN
IF NEW.key <> 'recruitment_commissions' THEN RETURN NEW; END IF;
FOREACH mode IN ARRAY ARRAY['roster','freelance'] LOOP
lo := (NEW.value->mode->>'min')::numeric; hi := (NEW.value->mode->>'max')::numeric; def := (NEW.value->mode->>'default')::numeric;
IF lo IS NULL OR hi IS NULL OR def IS NULL OR lo < 0 OR hi > 100 OR lo > hi OR def < lo OR def > hi OR lo::text='NaN' OR hi::text='NaN' OR def::text='NaN' THEN RAISE EXCEPTION 'Invalid recruitment commission range or default'; END IF;
END LOOP; RETURN NEW; END $$;
CREATE TRIGGER recruitment_config_validation BEFORE INSERT OR UPDATE ON public.economy_config FOR EACH ROW EXECUTE FUNCTION public.validate_recruitment_config();
ALTER TABLE public.companies DROP CONSTRAINT companies_roster_commission_pct_check;
ALTER TABLE public.companies DROP CONSTRAINT companies_freelance_commission_pct_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_roster_commission_pct_check CHECK(roster_commission_pct BETWEEN 0 AND 100);
ALTER TABLE public.companies ADD CONSTRAINT companies_freelance_commission_pct_check CHECK(freelance_commission_pct BETWEEN 0 AND 100);
CREATE OR REPLACE FUNCTION public.default_recruitment_commissions() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE cfg jsonb := recruitment_commission_settings();
BEGIN NEW.roster_commission_pct := (cfg->'roster'->>'default')::numeric; NEW.freelance_commission_pct := (cfg->'freelance'->>'default')::numeric; RETURN NEW; END $$;
CREATE TRIGGER company_recruitment_defaults BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.default_recruitment_commissions();
CREATE OR REPLACE FUNCTION public.set_company_hiring(p_hiring boolean,p_roster numeric,p_freelance numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb := recruitment_commission_settings();
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
IF p_roster IS NULL OR p_freelance IS NULL OR p_roster::text='NaN' OR p_freelance::text='NaN' OR p_roster NOT BETWEEN (cfg->'roster'->>'min')::numeric AND (cfg->'roster'->>'max')::numeric OR p_freelance NOT BETWEEN (cfg->'freelance'->>'min')::numeric AND (cfg->'freelance'->>'max')::numeric THEN RAISE EXCEPTION 'Commission must be within the configured recruitment range'; END IF;
UPDATE companies SET is_hiring=p_hiring,roster_commission_pct=p_roster,freelance_commission_pct=p_freelance WHERE user_id=auth.uid() AND is_personal=false;
IF NOT FOUND THEN RAISE EXCEPTION 'No company'; END IF; END $$;
REVOKE ALL ON FUNCTION public.set_company_hiring(boolean,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_company_hiring(boolean,numeric,numeric) TO authenticated;