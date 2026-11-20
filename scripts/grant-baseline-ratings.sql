-- NOTE: This backfill is now permanent in drizzle/migrations/0048_baseline_ratings_backfill.sql
-- and runs automatically on every environment. This script is kept only as a manual
-- reference/replay for databases that missed migration 0048. It is idempotent.
--
-- Add baseline licences without touching higher ratings, wallets or ledger history.
UPDATE public.profiles
SET type_ratings = ARRAY(SELECT DISTINCT t FROM unnest(type_ratings || '{1,2,3}'::integer[]) t ORDER BY t)
WHERE NOT type_ratings @> '{1,2,3}'::integer[];
