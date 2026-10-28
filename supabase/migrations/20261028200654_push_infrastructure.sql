create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Single-row config. The secret is generated here and never leaves the database
-- except to authenticate calls from this database to the `push` edge function.
create table private.push_config (
  id boolean primary key default true check (id),
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public text,
  vapid_private text,
  function_url text not null
);
-- Replace the project ref when deploying to another project.
insert into private.push_config (function_url)
values ('https://xijpnqgaxvyigyrwcqmo.supabase.co/functions/v1/push');
revoke all on private.push_config from public, anon, authenticated;

-- Used only by the edge function (service role).
create or replace function public.push_config()
returns table (secret text, vapid_public text, vapid_private text)
language sql stable security definer set search_path = ''
as $$ select c.secret, c.vapid_public, c.vapid_private from private.push_config c $$;

create or replace function public.push_store_vapid(p_public text, p_private text)
returns void
language sql security definer set search_path = ''
as $$
  update private.push_config set vapid_public = p_public, vapid_private = p_private
  where vapid_public is null;
$$;

revoke all on function public.push_config() from public, anon, authenticated;
revoke all on function public.push_store_vapid(text, text) from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.push_store_vapid(text, text) to service_role;

-- What the browser needs to subscribe: the public key only.
create or replace function public.get_vapid_public_key()
returns text
language sql stable security definer set search_path = ''
as $$ select c.vapid_public from private.push_config c $$;
revoke all on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

-- Call the edge function from SQL.
create or replace function private.call_push(p_body jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare c private.push_config;
begin
  select * into c from private.push_config;
  perform net.http_post(
    url := c.function_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', c.secret),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function private.call_push(jsonb) from public, anon, authenticated;

-- New chat message → notify other members.
create or replace function private.notify_new_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.call_push(jsonb_build_object('type', 'message', 'id', new.id));
  return new;
end;
$$;
create trigger messages_push after insert on public.messages
  for each row execute function private.notify_new_message();

-- Due reminders → every minute.
select cron.schedule('push-reminders', '* * * * *', $$select private.call_push('{"type":"reminders"}'::jsonb)$$);
