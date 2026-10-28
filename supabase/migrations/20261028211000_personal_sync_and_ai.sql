-- Personal sync between devices (email accounts only) and AI usage limits.

-- One row per synced local record. Last-write-wins on the client's mtime; the server's
-- updated_at is the pull cursor (immune to device clock skew).
create table public.sync_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null check (store ~ '^[a-z_]{2,30}$'),
  rid text not null check (char_length(rid) between 1 and 200),
  data jsonb,
  mtime bigint not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, store, rid),
  check (data is null or pg_column_size(data) < 2000000)
);
create index sync_records_pull_idx on public.sync_records (user_id, updated_at);

create or replace function private.touch_sync_record()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger sync_records_touch before insert or update on public.sync_records
  for each row execute function private.touch_sync_record();

alter table public.sync_records enable row level security;

-- Only permanent (email) accounts may sync; nickname-only accounts may not.
create or replace function private.is_permanent_user()
returns boolean
language sql stable set search_path = ''
as $$ select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false $$;
grant execute on function private.is_permanent_user() to authenticated;

create policy "sync: own records, email accounts" on public.sync_records
  for all to authenticated
  using (user_id = (select auth.uid()) and private.is_permanent_user())
  with check (user_id = (select auth.uid()) and private.is_permanent_user());

-- Private bucket for lecture files: <user id>/<resource id>
insert into storage.buckets (id, name, public, file_size_limit)
values ('sync-files', 'sync-files', false, 52428800)
on conflict (id) do nothing;

create policy "sync-files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_permanent_user());
create policy "sync-files: write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_permanent_user());
create policy "sync-files: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_permanent_user());
create policy "sync-files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_permanent_user());

-- AI usage counter (written only by the ai edge function with the service role).
create table private.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);
revoke all on private.ai_usage from public, anon, authenticated;

create or replace function public.ai_take_quota(p_user uuid, p_limit int)
returns int
language plpgsql security definer set search_path = ''
as $$
declare used int;
begin
  insert into private.ai_usage (user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = private.ai_usage.calls + 1
  returning calls into used;
  if used > p_limit then
    raise exception 'daily AI limit reached' using errcode = 'P0001';
  end if;
  return p_limit - used;
end;
$$;
revoke all on function public.ai_take_quota(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_take_quota(uuid, int) to service_role;
