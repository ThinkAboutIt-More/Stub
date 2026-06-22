-- Run this once in Supabase: Project, SQL Editor, New query, paste, Run.
-- Creates the single table Stub uses to store your collection, watchlist,
-- settings, and discover feedback, then opens it up to the publishable
-- (anon) key the app uses from your browser.

create table if not exists app_state (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.app_state to anon, authenticated;

alter table app_state enable row level security;

create policy "stub read" on app_state
  for select using (true);

create policy "stub insert" on app_state
  for insert with check (true);

create policy "stub update" on app_state
  for update using (true);

-- Note on privacy: this allows anyone holding both your app URL and your
-- publishable key to read and write this one table. There's no per user
-- login in this version since it's just for you. Don't post the URL
-- publicly. If that's ever not enough, real auth is a later upgrade,
-- not a rebuild.
