UPDATE public.profiles
SET type_ratings = ARRAY(SELECT DISTINCT t FROM unnest(type_ratings || '{1,2,3}'::integer[]) t ORDER BY t)
WHERE NOT type_ratings @> '{1,2,3}'::integer[];

COMMENT ON COLUMN public.profiles.type_ratings IS 'Pilot licence tiers. Baseline T1-T3 granted to every pilot (default + trigger + 0048 backfill); T4-T7 purchased via buy_type_rating.';