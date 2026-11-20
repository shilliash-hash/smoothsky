-- Replay in each environment after the baseline_ratings_company_training migration.
-- Add baseline licences without touching higher ratings, wallets or ledger history.
UPDATE public.profiles
SET type_ratings = ARRAY(SELECT DISTINCT t FROM unnest(type_ratings || '{1,2,3}'::integer[]) t ORDER BY t)
WHERE NOT type_ratings @> '{1,2,3}'::integer[];