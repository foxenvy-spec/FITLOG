-- Composite index for the dashboard's streak query, now that it's bounded to
-- a rolling window instead of scanning every performed_at row a user has
-- ever logged (see app/(app)/dashboard/page.tsx, STREAK_LOOKBACK_DAYS).
--
-- The query is effectively:
--   .eq(user_id via RLS).gte('performed_at', <cutoff>).order('performed_at', desc)
-- workouts_user_id_idx and workouts_performed_at_idx are both single-column,
-- so Postgres can only satisfy this with a bitmap AND of the two. A
-- composite (user_id, performed_at desc) index lets it do a single
-- index scan instead, same as the 002 migration did for the strength/date
-- range queries.

create index if not exists workouts_user_performed_at_idx
  on public.workouts (user_id, performed_at desc);
