-- Personal reading state in the existing Supabase Auth/Postgres project.
-- RLS is mandatory: clients use the public anon/publishable key and a user's
-- own access token; no service_role key is shipped to the browser.

create table if not exists public.story_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id text not null check (story_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$'),
  last_seen_chapter_index integer not null default 0 check (last_seen_chapter_index between 0 and 100000),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id text not null check (story_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$'),
  chapter_id text not null default '',
  chapter_index integer not null check (chapter_index between 1 and 100000),
  scroll_percent numeric(5,2) not null default 0 check (scroll_percent between 0 and 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create index if not exists story_follows_user_created_idx
  on public.story_follows (user_id, created_at desc);
create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at desc);

alter table public.story_follows enable row level security;
alter table public.reading_progress enable row level security;

-- Re-running the migration is safe and replaces only these application policies.
drop policy if exists story_follows_select_own on public.story_follows;
drop policy if exists story_follows_insert_own on public.story_follows;
drop policy if exists story_follows_update_own on public.story_follows;
drop policy if exists story_follows_delete_own on public.story_follows;
create policy story_follows_select_own on public.story_follows
  for select to authenticated using (user_id = auth.uid());
create policy story_follows_insert_own on public.story_follows
  for insert to authenticated with check (user_id = auth.uid());
create policy story_follows_update_own on public.story_follows
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy story_follows_delete_own on public.story_follows
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists reading_progress_select_own on public.reading_progress;
drop policy if exists reading_progress_insert_own on public.reading_progress;
drop policy if exists reading_progress_update_own on public.reading_progress;
drop policy if exists reading_progress_delete_own on public.reading_progress;
create policy reading_progress_select_own on public.reading_progress
  for select to authenticated using (user_id = auth.uid());
create policy reading_progress_insert_own on public.reading_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy reading_progress_update_own on public.reading_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reading_progress_delete_own on public.reading_progress
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.story_follows to authenticated;
grant select, insert, update, delete on public.reading_progress to authenticated;
revoke all on public.story_follows from anon;
revoke all on public.reading_progress from anon;

create or replace function public.ssochuz_keep_newest_reading_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Browser/client timestamps may arrive out of order across devices. A stale
  -- upsert must not replace the newer chapter/position already in Postgres.
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists reading_progress_touch_updated_at on public.reading_progress;
drop trigger if exists reading_progress_keep_newest on public.reading_progress;
create trigger reading_progress_keep_newest
before update on public.reading_progress
for each row execute function public.ssochuz_keep_newest_reading_progress();
