-- Run this in Supabase Dashboard > SQL Editor for the project you own.
-- Payment records are visible only to signed-in users. Disable public sign-ups
-- and invite only the people who should have access to this tracker.

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
revoke all on public.it_payments from anon;
grant select, insert, update, delete on public.it_payments to authenticated;

drop policy if exists "Signed-in users can read IT payments" on public.it_payments;
create policy "Signed-in users can read IT payments"
  on public.it_payments for select to authenticated using (true);

drop policy if exists "Signed-in users can add IT payments" on public.it_payments;
create policy "Signed-in users can add IT payments"
  on public.it_payments for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Signed-in users can update IT payments" on public.it_payments;
create policy "Signed-in users can update IT payments"
  on public.it_payments for update to authenticated
  using (true) with check (true);

drop policy if exists "Signed-in users can delete IT payments" on public.it_payments;
create policy "Signed-in users can delete IT payments"
  on public.it_payments for delete to authenticated using (true);

create or replace function public.set_it_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists it_payments_updated_at on public.it_payments;
create trigger it_payments_updated_at
  before update on public.it_payments
  for each row execute function public.set_it_payments_updated_at();
