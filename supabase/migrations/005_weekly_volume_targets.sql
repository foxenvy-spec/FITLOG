-- Per-user weekly volume targets (sets/week per muscle group).
--
-- Until now WEEKLY_VOLUME_TARGETS in lib/dashboardStats.ts was a single hardcoded
-- constant shared by every user (อก:10, หลัง:10, ขา:12, ไหล่:8, แขน:8, แกนกลางลำตัว:6).
-- This migration adds a table so each user can set their own targets — the app
-- still falls back to those same hardcoded numbers for any column left null,
-- so existing users see no change until they explicitly set a target
-- (see lib/weeklyVolumeTargets.ts).
--
-- One row per user (user_id is the primary key) rather than one row per
-- muscle group: there are only 6 muscle groups tracked for volume
-- (see VOLUME_MUSCLES in lib/muscle-groups.ts), so a wide table is simpler
-- to read/upsert in one round trip than 6 narrow rows would be.

create table if not exists public.weekly_volume_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chest numeric,
  back numeric,
  legs numeric,
  shoulders numeric,
  arms numeric,
  core numeric,
  updated_at timestamptz not null default now()
);

alter table public.weekly_volume_targets enable row level security;

drop policy if exists "Users can view their own volume targets" on public.weekly_volume_targets;
create policy "Users can view their own volume targets"
  on public.weekly_volume_targets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own volume targets" on public.weekly_volume_targets;
create policy "Users can insert their own volume targets"
  on public.weekly_volume_targets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own volume targets" on public.weekly_volume_targets;
create policy "Users can update their own volume targets"
  on public.weekly_volume_targets for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own volume targets" on public.weekly_volume_targets;
create policy "Users can delete their own volume targets"
  on public.weekly_volume_targets for delete
  using (auth.uid() = user_id);
