-- Study groups for UCAS Academic Bridge: nickname profiles, groups joined by invite code,
-- group chat, and web-push subscriptions/reminders. Every table has RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 30),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  course text check (course is null or char_length(course) <= 120),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_group_created_idx on public.messages (group_id, created_at desc);
create index messages_user_created_idx on public.messages (user_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  notify_messages boolean not null default true,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_key text not null check (char_length(local_key) <= 200),
  fire_at timestamptz not null,
  title text not null check (char_length(title) <= 200),
  body text check (body is null or char_length(body) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, local_key)
);
create index scheduled_reminders_due_idx on public.scheduled_reminders (fire_at) where sent_at is null;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scheduled_reminders enable row level security;

-- ---------- helpers (private schema, not exposed by the API) ----------
create or replace function private.is_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.shares_group(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;
grant usage on schema private to authenticated;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.shares_group(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.shares_group(uuid) to authenticated;

-- ---------- policies ----------
create policy "profiles: read self and group mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_group(id));
create policy "profiles: insert self" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "groups: members read" on public.groups
  for select to authenticated using (private.is_member(id));
create policy "groups: owner renames" on public.groups
  for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "groups: owner deletes" on public.groups
  for delete to authenticated using (created_by = (select auth.uid()));

create policy "members: members read" on public.group_members
  for select to authenticated using (private.is_member(group_id));
create policy "members: leave" on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "messages: members read" on public.messages
  for select to authenticated using (private.is_member(group_id));
create policy "messages: members write as self" on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(group_id));
create policy "messages: delete own" on public.messages
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "push: own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "reminders: own reminders" on public.scheduled_reminders
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- RPC: create / join ----------
create or replace function private.new_invite_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_group(p_name text, p_course text default null)
returns public.groups
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then
    raise exception 'set a nickname first' using errcode = 'P0001';
  end if;
  if (select count(*) from public.groups x where x.created_by = uid) >= 20 then
    raise exception 'group limit reached' using errcode = 'P0001';
  end if;
  insert into public.groups (name, course, invite_code, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_course, '')), ''), private.new_invite_code(), uid)
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  return g;
end;
$$;

create or replace function public.join_group(p_code text)
returns public.groups
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then
    raise exception 'set a nickname first' using errcode = 'P0001';
  end if;
  select * into g from public.groups x where x.invite_code = upper(btrim(p_code));
  if not found then raise exception 'invalid invite code' using errcode = 'P0002'; end if;
  if (select count(*) from public.group_members m where m.group_id = g.id) >= 200 then
    raise exception 'group is full' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid)
  on conflict do nothing;
  return g;
end;
$$;

revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
revoke all on function private.new_invite_code() from public, anon, authenticated;

-- ---------- abuse limits ----------
create or replace function private.limit_messages()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.messages m
      where m.user_id = new.user_id and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'slow down' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function private.limit_messages();

create or replace function private.limit_reminders()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.scheduled_reminders r
      where r.user_id = new.user_id and r.sent_at is null) >= 300 then
    raise exception 'too many reminders' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reminders_limit before insert on public.scheduled_reminders
  for each row execute function private.limit_reminders();

-- ---------- realtime ----------
alter publication supabase_realtime add table public.messages;
