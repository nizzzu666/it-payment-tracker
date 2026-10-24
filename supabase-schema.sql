-- Install in Supabase Dashboard > SQL Editor.
-- Do not enable public sign-ups. Invite only known staff accounts.

create table if not exists public.it_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'user' check (role in ('master', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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

alter table public.it_user_roles enable row level security;
revoke all on public.it_user_roles from anon, authenticated;
grant select on public.it_user_roles to authenticated;
grant update (role) on public.it_user_roles to authenticated;

drop policy if exists "Users see own role and Masters see all roles" on public.it_user_roles;
create policy "Users see own role and Masters see all roles"
  on public.it_user_roles for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_it_master()));

drop policy if exists "Masters update other users roles" on public.it_user_roles;
create policy "Masters update other users roles"
  on public.it_user_roles for update to authenticated
  using ((select public.is_it_master()) and user_id <> (select auth.uid()))
  with check ((select public.is_it_master()) and user_id <> (select auth.uid()));

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

-- New Auth invites automatically start with the least-privileged app role.
create or replace function public.add_it_user_role()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.it_user_roles (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'user')
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_it_role on auth.users;
create trigger on_auth_user_created_it_role
  after insert on auth.users
  for each row execute function public.add_it_user_role();

-- Backfill accounts that existed before this schema was installed as regular Users.
insert into public.it_user_roles (user_id, email, role)
select id, coalesce(email, ''), 'user' from auth.users
on conflict (user_id) do update set email = excluded.email;

create table if not exists public.it_payments (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  po text not null,
  invoice text not null,
  amount numeric(14,2) not null check (amount > 0),
  invoice_date date,
  due_date date,
  status text not null default 'Pending'
    check (status in ('Pending', 'Partially Paid', 'Paid')),
  utr text,
  payment_date date,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor, po, invoice)
);

create index if not exists it_payments_vendor_idx on public.it_payments (vendor);
create index if not exists it_payments_po_idx on public.it_payments (po);
create index if not exists it_payments_invoice_idx on public.it_payments (invoice);
create index if not exists it_payments_due_date_idx on public.it_payments (due_date);

alter table public.it_payments enable row level security;
revoke all on public.it_payments from anon, authenticated;
grant select, insert, update, delete on public.it_payments to authenticated;

-- Remove permissive policies from the earlier local-tracker setup if present.
drop policy if exists "Signed-in users can read IT payments" on public.it_payments;
drop policy if exists "Signed-in users can add IT payments" on public.it_payments;
drop policy if exists "Signed-in users can update IT payments" on public.it_payments;
drop policy if exists "Signed-in users can delete IT payments" on public.it_payments;

drop policy if exists "Tracker users can read payments" on public.it_payments;
create policy "Tracker users can read payments"
  on public.it_payments for select to authenticated
  using ((select public.has_it_access()));

drop policy if exists "Tracker users can add payments as themselves" on public.it_payments;
create policy "Tracker users can add payments as themselves"
  on public.it_payments for insert to authenticated
  with check ((select public.has_it_access()) and (select auth.uid()) = created_by);

drop policy if exists "Tracker users can update payments" on public.it_payments;
create policy "Tracker users can update payments"
  on public.it_payments for update to authenticated
  using ((select public.has_it_access()))
  with check ((select public.has_it_access()));

drop policy if exists "Only Masters can delete payments" on public.it_payments;
create policy "Only Masters can delete payments"
  on public.it_payments for delete to authenticated
  using ((select public.is_it_master()));

create or replace function public.protect_it_payment_audit_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists it_payments_protect_audit on public.it_payments;
create trigger it_payments_protect_audit
  before update on public.it_payments
  for each row execute function public.protect_it_payment_audit_fields();
