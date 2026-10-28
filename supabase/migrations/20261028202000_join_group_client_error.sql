-- An unknown invite code is a client error (HTTP 400), not a server error.
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
  if not found then raise exception 'invalid invite code' using errcode = 'P0001'; end if;
  if (select count(*) from public.group_members m where m.group_id = g.id) >= 200 then
    raise exception 'group is full' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid)
  on conflict do nothing;
  return g;
end;
$$;
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
