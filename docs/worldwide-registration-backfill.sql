-- Apply after drizzle/migrations/0033_worldwide_registration_fallback.sql
-- to each database, including the larger isolated production airport dataset.
-- Data-only changes are intentionally separate from schema migrations.
INSERT INTO public.registration_rules (country, prefix, suffix_pattern, suffix_length, alphabet, source)
SELECT country, prefix, suffix_pattern, suffix_length, alphabet, source
FROM public.world_registration_defaults()
ON CONFLICT (country) DO NOTHING;