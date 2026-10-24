-- Apply this migration in Supabase SQL Editor before publishing the matching app update.
-- Existing accounts remain active. A Master cannot deactivate themself or the last active Master.

alter table public.it_user_roles add column if not exists active boolean not null default true;

create or replace function public.is_it_master()
returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.it_user_roles
    where user_id = (select auth.uid()) and role = 'master' and active
  );
$$;

create or replace function public.has_it_access()
returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.it_user_roles
    where user_id = (select auth.uid()) and role in ('master', 'user') and active
  );
$$;

revoke all on function public.is_it_master() from public, anon;
revoke all on function public.has_it_access() from public, anon;
grant execute on function public.is_it_master() to authenticated;
grant execute on function public.has_it_access() to authenticated;

-- Role changes remain available to Masters, but active status is only changed through the guarded RPC below.
revoke update on public.it_user_roles from authenticated;
grant update (role) on public.it_user_roles to authenticated;

create or replace function public.set_it_user_active(target_user_id uuid, should_be_active boolean)
returns void
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  target_role text;
  target_is_active boolean;
  active_masters integer;
begin
  if (select auth.uid()) is null or not public.is_it_master() then
    raise exception 'Master access required';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot deactivate your own account';
  end if;
  select role, active into target_role, target_is_active
    from public.it_user_roles where user_id = target_user_id;
  if not found then raise exception 'User account not found'; end if;
  if target_role = 'master' and target_is_active and not should_be_active then
    select count(*) into active_masters
      from public.it_user_roles where role = 'master' and active;
    if active_masters <= 1 then raise exception 'The last active Master cannot be deactivated'; end if;
  end if;
  update public.it_user_roles
    set active = should_be_active, updated_at = now()
    where user_id = target_user_id;
end;
$$;

revoke all on function public.set_it_user_active(uuid, boolean) from public, anon;
grant execute on function public.set_it_user_active(uuid, boolean) to authenticated;
