
alter table public.clients
  add column if not exists license_fee_payment_ref text[] not null default '{}';

alter table public.client_subscriptions
  add column if not exists license_total_paid numeric,
  add column if not exists license_currency text,
  add column if not exists license_last_paid_at timestamptz,
  add column if not exists license_payments jsonb not null default '[]'::jsonb;

create table if not exists public.license_products (
  stripe_product_id text primary key,
  label text,
  created_at timestamptz not null default now()
);
-- [bridge] ensure columns
ALTER TABLE public.license_products
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


insert into public.license_products (stripe_product_id, label)
values ('prod_U9aNjNMnl3rL9s', 'Ring OS License')
on conflict (stripe_product_id) do nothing;

alter table public.license_products enable row level security;

drop policy if exists "admins read license_products" on public.license_products;
create policy "admins read license_products"
  on public.license_products
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'::app_role));
