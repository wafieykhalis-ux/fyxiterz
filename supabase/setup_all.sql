-- =============================================================================
-- FYXITERZ — setup_all.sql
-- ONE-PASTE setup: runs every migration in order (0000 -> 0007).
-- Paste this whole file into the Supabase SQL Editor and press Run.
--
--   0000_preflight  move aside any clashing tables left over from testing
--   0001_schema     18 tables, keys, indexes, updated_at triggers
--   0002_functions  helper functions used by RLS / Edge Functions
--   0003_rls        Row Level Security on all tables + policies
--   0004_seed       roles, categories, 51 products, discount codes, settings
--   0005_payment_method   payment_method columns
--   0006_payment_settings QR / payment settings keys
--   0007_grants     explicit anon / authenticated / service_role privileges
--
-- Note: 0008_repair_legacy_profiles.sql is NOT part of this file. It is a
-- one-time repair for a project that was set up earlier with the old
-- single-column preflight and ended up with a legacy `profiles` table. A fresh
-- run of this file (with the fixed preflight above) never needs it.
-- =============================================================================

-- >>>>>>>>>>>>>>>>>>>>  0000_preflight.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0000_preflight.sql
--
-- Why this exists:
--   A Supabase project that has been used for testing may already contain its
--   own tables whose names clash with the FYXITERZ schema (for example a
--   hand-made `products` table with columns id / name / description / price).
--   Because every table below is created with `create table if not exists`,
--   such a table would be silently skipped and the statements that follow
--   (indexes, foreign keys) would fail with "column ... does not exist",
--   aborting the whole setup.
--
-- What it does:
--   For each known table it checks a LIST of required columns. If any of them
--   is missing the table is clearly not ours, so it is renamed to
--   `_legacy_<name>` — never dropped, so the old data stays recoverable:
--
--       select * from public._legacy_products;
--
--   A single-column check is not enough: a legacy `profiles` table that
--   happened to have a `role` column would slip through, which is exactly the
--   bug 0008_repair_legacy_profiles.sql had to fix. Checking several columns
--   makes that impossible.
--
--   Tables that already have the FYXITERZ shape are left completely alone,
--   which makes this file safe to run again.
-- =============================================================================

do $$
declare
  -- table name, followed by the columns that only the real table has
  spec text[][] := array[
    array['products',   'sku',        'regular_price',  ''         ],
    array['profiles',   'role',       'full_name',      'is_active'],
    array['orders',     'order_code', 'customer_email', ''         ],
    array['categories', 'slug',       'is_active',      ''         ]
  ];
  i       int;
  j       int;
  missing int;
  t       text;
  legacy  text;
begin
  for i in 1 .. array_length(spec, 1) loop
    t := spec[i][1];

    if exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = t) then

      missing := 0;
      for j in 2 .. array_length(spec, 2) loop
        if spec[i][j] <> ''
           and not exists (select 1 from information_schema.columns
                            where table_schema = 'public'
                              and table_name   = t
                              and column_name  = spec[i][j]) then
          missing := missing + 1;
        end if;
      end loop;

      if missing > 0 then
        legacy := '_legacy_' || t;

        if not exists (select 1 from information_schema.tables
                        where table_schema = 'public' and table_name = legacy) then
          execute format('alter table public.%I rename to %I', t, legacy);
          raise notice 'FYXITERZ preflight: moved legacy public.% -> public.%',
                       t, legacy;
        else
          execute format('drop table if exists public.%I cascade', t);
          raise notice 'FYXITERZ preflight: dropped clashing public.% (backup public.% already existed)',
                       t, legacy;
        end if;
      end if;
    end if;
  end loop;
end $$;

-- >>>>>>>>>>>>>>>>>>>>  0001_schema.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0001_schema.sql
-- Extensions, base tables, constraints, foreign keys, indexes and updated_at
-- triggers. Run order: 0001_schema -> 0002_functions -> 0003_rls -> 0004_seed.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto (built-in on PG13+ via core, but the
-- extension is declared here for portability / older engines).
create extension if not exists pgcrypto;

-- =============================================================================
-- roles
-- =============================================================================
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null check (name in ('owner','admin','reseller','customer')),
  description text,
  created_at  timestamptz default now()
);

-- =============================================================================
-- profiles (1:1 with auth.users)
-- =============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique not null,
  full_name  text,
  phone      text,
  role       text not null default 'customer' references public.roles(name),
  avatar_url text,
  is_active  boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- categories
-- =============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  description text,
  image_url   text,
  sort_order  int default 0,
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- =============================================================================
-- products
-- =============================================================================
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text unique,
  name             text not null,
  slug             text unique not null,
  description      text,
  long_description text,
  image_url        text,
  category_id      uuid references public.categories(id) on delete set null,
  regular_price    numeric(12,2) not null default 0,
  reseller_price   numeric(12,2),
  cost_price       numeric(12,2),
  stock            int not null default 0,
  is_bestseller    boolean not null default false,
  is_featured      boolean not null default false,
  is_active        boolean not null default true,
  auto_delivery    boolean not null default false,
  delivery_note    text,
  sales_count      int not null default 0,
  sort_order       int default 0,
  metadata         jsonb not null default '{}',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- =============================================================================
-- product_variants
-- =============================================================================
create table if not exists public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  name           text not null,
  sku            text,
  price          numeric(12,2) not null default 0,
  reseller_price numeric(12,2),
  stock          int not null default 0,
  duration_label text,
  is_active      boolean not null default true,
  sort_order     int default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- =============================================================================
-- orders
-- =============================================================================
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_code        text unique not null,
  customer_name     text not null,
  customer_email    text not null,
  customer_whatsapp text,
  game_id           text,
  server_id         text,
  subtotal          numeric(12,2) not null default 0,
  discount_amount   numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  discount_code     text,
  status            text not null default 'pending'
                      check (status in ('pending','paid','processing','completed','cancelled','expired','failed')),
  payment_status    text not null default 'unpaid'
                      check (payment_status in ('unpaid','pending','paid','failed','expired','refunded')),
  reseller_id       uuid references public.profiles(id) on delete set null,
  notes             text,
  metadata          jsonb not null default '{}',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  paid_at           timestamptz,
  completed_at      timestamptz
);

-- =============================================================================
-- order_items
-- =============================================================================
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  unit_price   numeric(12,2) not null default 0,
  quantity     int not null default 1 check (quantity > 0),
  subtotal     numeric(12,2) not null default 0,
  created_at   timestamptz default now()
);

-- =============================================================================
-- payments
-- =============================================================================
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  provider           text not null,
  provider_ref       text,
  provider_bill_code text,
  amount             numeric(12,2) not null,
  currency           text not null default 'MYR',
  status             text not null default 'pending'
                       check (status in ('pending','paid','failed','expired','refunded')),
  checkout_url       text,
  signature          text,
  raw_response       jsonb not null default '{}',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  paid_at            timestamptz
);

-- =============================================================================
-- transactions
-- =============================================================================
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete set null,
  payment_id  uuid references public.payments(id) on delete set null,
  type        text not null,
  amount      numeric(12,2) not null default 0,
  status      text not null default 'pending',
  description text,
  reference   text,
  created_at  timestamptz default now()
);

-- =============================================================================
-- discount_codes
-- =============================================================================
create table if not exists public.discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  description       text,
  discount_type     text not null check (discount_type in ('percent','fixed')),
  discount_value    numeric(12,2) not null default 0,
  min_purchase      numeric(12,2) not null default 0,
  max_uses          int,
  used_count        int not null default 0,
  max_uses_per_user int default 1,
  applies_to        text not null default 'all',
  is_active         boolean not null default true,
  starts_at         timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- =============================================================================
-- discount_redemptions
-- =============================================================================
create table if not exists public.discount_redemptions (
  id               uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  order_id         uuid references public.orders(id) on delete cascade,
  email            text,
  amount           numeric(12,2) not null default 0,
  created_at       timestamptz default now()
);

-- =============================================================================
-- reseller_accounts
-- =============================================================================
create table if not exists public.reseller_accounts (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid unique not null references public.profiles(id) on delete cascade,
  business_name    text,
  tier             text not null default 'basic',
  discount_percent numeric(5,2) not null default 0,
  status           text not null default 'active' check (status in ('active','suspended','pending')),
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- =============================================================================
-- reseller_prices
-- =============================================================================
create table if not exists public.reseller_prices (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller_accounts(id) on delete cascade,
  product_id  uuid references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete cascade,
  price       numeric(12,2) not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (reseller_id, product_id, variant_id)
);

-- =============================================================================
-- wallets
-- =============================================================================
create table if not exists public.wallets (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  balance    numeric(12,2) not null default 0,
  currency   text not null default 'MYR',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- wallet_transactions
-- =============================================================================
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  wallet_id     uuid not null references public.wallets(id) on delete cascade,
  type          text not null check (type in ('credit','debit')),
  amount        numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  description   text,
  reference     text,
  created_at    timestamptz default now()
);

-- =============================================================================
-- deliveries
-- =============================================================================
create table if not exists public.deliveries (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  order_item_id     uuid references public.order_items(id) on delete cascade,
  delivered_content text,
  delivery_type     text not null default 'auto',
  status            text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at           timestamptz,
  sent_to           text,
  created_at        timestamptz default now()
);

-- =============================================================================
-- audit_logs
-- =============================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}',
  ip_address  text,
  user_agent  text,
  created_at  timestamptz default now()
);

-- =============================================================================
-- website_settings
-- =============================================================================
create table if not exists public.website_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       jsonb not null default '{}',
  description text,
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id)
);

-- =============================================================================
-- Indexes
-- =============================================================================
create index if not exists idx_profiles_role                 on public.profiles (role);

create index if not exists idx_categories_is_active          on public.categories (is_active);

create index if not exists idx_products_category_id          on public.products (category_id);
create index if not exists idx_products_is_active            on public.products (is_active);
create index if not exists idx_products_is_bestseller        on public.products (is_bestseller);
create index if not exists idx_products_is_featured          on public.products (is_featured);
create index if not exists idx_products_sales_count          on public.products (sales_count desc);
create index if not exists idx_products_sort_order           on public.products (sort_order);

create index if not exists idx_product_variants_product_id   on public.product_variants (product_id);

create index if not exists idx_orders_customer_email         on public.orders (customer_email);
create index if not exists idx_orders_status                 on public.orders (status);
create index if not exists idx_orders_payment_status         on public.orders (payment_status);
create index if not exists idx_orders_reseller_id            on public.orders (reseller_id);
create index if not exists idx_orders_created_at             on public.orders (created_at desc);

create index if not exists idx_order_items_order_id          on public.order_items (order_id);
create index if not exists idx_order_items_product_id        on public.order_items (product_id);

create index if not exists idx_payments_order_id             on public.payments (order_id);
create index if not exists idx_payments_provider_ref         on public.payments (provider_ref);
create index if not exists idx_payments_status               on public.payments (status);

create index if not exists idx_transactions_order_id         on public.transactions (order_id);
create index if not exists idx_transactions_payment_id       on public.transactions (payment_id);

create index if not exists idx_discount_redemptions_code_id  on public.discount_redemptions (discount_code_id);
create index if not exists idx_discount_redemptions_order_id on public.discount_redemptions (order_id);
create index if not exists idx_discount_redemptions_email    on public.discount_redemptions (email);

create index if not exists idx_reseller_prices_reseller_id   on public.reseller_prices (reseller_id);
create index if not exists idx_reseller_prices_product_id    on public.reseller_prices (product_id);

create index if not exists idx_wallets_profile_id            on public.wallets (profile_id);

create index if not exists idx_wallet_transactions_wallet_id on public.wallet_transactions (wallet_id);
create index if not exists idx_wallet_transactions_created   on public.wallet_transactions (created_at desc);

create index if not exists idx_deliveries_order_id           on public.deliveries (order_id);
create index if not exists idx_deliveries_order_item_id      on public.deliveries (order_item_id);

create index if not exists idx_audit_logs_created_at         on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_actor_id           on public.audit_logs (actor_id);
create index if not exists idx_audit_logs_entity             on public.audit_logs (entity_type, entity_id);

-- =============================================================================
-- updated_at trigger
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_discount_codes_updated_at on public.discount_codes;
create trigger trg_discount_codes_updated_at before update on public.discount_codes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_reseller_accounts_updated_at on public.reseller_accounts;
create trigger trg_reseller_accounts_updated_at before update on public.reseller_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_reseller_prices_updated_at on public.reseller_prices;
create trigger trg_reseller_prices_updated_at before update on public.reseller_prices
  for each row execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_website_settings_updated_at on public.website_settings;
create trigger trg_website_settings_updated_at before update on public.website_settings
  for each row execute function public.set_updated_at();

-- >>>>>>>>>>>>>>>>>>>>  0002_functions.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0002_functions.sql
-- Helper functions used by RLS policies and Edge Functions.
--
-- Runs BEFORE 0003_rls.sql because the policies depend on the is_* helpers.
-- Every SECURITY DEFINER function pins `search_path = public` and is granted
-- only to the roles that need it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- auth_role(): the role of the currently authenticated user, or NULL.
-- SECURITY DEFINER so it can read public.profiles regardless of the caller's
-- RLS visibility (this also avoids recursive policy evaluation).
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
    from public.profiles p
   where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- is_staff(): owner or admin.
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() in ('owner','admin'), false)
$$;

-- ---------------------------------------------------------------------------
-- is_owner()
-- ---------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'owner', false)
$$;

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- is_reseller()
-- ---------------------------------------------------------------------------
create or replace function public.is_reseller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'reseller', false)
$$;

-- ---------------------------------------------------------------------------
-- next_order_code(): unique order code formatted as INV-XXXXXX.
-- ---------------------------------------------------------------------------
create or replace function public.next_order_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'INV-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.orders where order_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_wallet_txn(): atomically adjust a wallet balance and record a
-- wallet_transactions row with the resulting balance_after.
--
-- Signature: apply_wallet_txn(p_wallet, p_amount, p_type, p_desc, p_ref)
--   * p_amount is signed: negative = debit, positive = credit.
--   * p_type may be 'credit'/'debit' to force the classification; otherwise it
--     is derived from the sign of p_amount (the caller passes 'purchase').
--   * Returns a jsonb { success, ... } object so callers can branch without
--     exception handling; debit that would overdraw returns success = false.
-- ---------------------------------------------------------------------------
create or replace function public.apply_wallet_txn(
  p_wallet uuid,
  p_amount numeric,
  p_type   text,
  p_desc   text default null,
  p_ref    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new     numeric;
  v_kind    text;
  v_txn_id  uuid;
begin
  if p_amount is null or p_amount = 0 then
    return jsonb_build_object('success', false, 'message', 'amount must be non-zero');
  end if;

  v_kind := case
    when p_type in ('credit','debit') then p_type
    when p_amount < 0 then 'debit'
    else 'credit'
  end;

  -- Lock the wallet row for the duration of the transaction.
  select balance into v_balance
    from public.wallets
   where id = p_wallet
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'wallet not found');
  end if;

  v_new := v_balance + p_amount;
  if v_new < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'insufficient balance',
      'balance_after', v_balance
    );
  end if;

  update public.wallets
     set balance = v_new,
         updated_at = now()
   where id = p_wallet;

  insert into public.wallet_transactions (wallet_id, type, amount, balance_after, description, reference)
  values (p_wallet, v_kind, abs(p_amount), v_new, p_desc, p_ref)
  returning id into v_txn_id;

  return jsonb_build_object(
    'success', true,
    'wallet_id', p_wallet,
    'type', v_kind,
    'amount', abs(p_amount),
    'balance_after', v_new,
    'transaction_id', v_txn_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- increment_product_sales(): bump products.sales_count (called by Edge Fns).
-- Parameter names match the client-side rpc() call: p_product, p_qty.
-- ---------------------------------------------------------------------------
create or replace function public.increment_product_sales(
  p_product uuid,
  p_qty     int
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.products
     set sales_count = sales_count + greatest(coalesce(p_qty, 0), 0),
         updated_at  = now()
   where id = p_product
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user(): mirror every new auth.users row into public.profiles.
-- Role defaults to 'customer'; full_name is taken from the signup metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Execute privileges
-- =============================================================================

-- RLS helpers: reachable by anyone whose policies may call them.
grant execute on function public.auth_role()  to anon, authenticated, service_role;
grant execute on function public.is_staff()   to anon, authenticated, service_role;
grant execute on function public.is_owner()   to anon, authenticated, service_role;
grant execute on function public.is_admin()   to anon, authenticated, service_role;
grant execute on function public.is_reseller() to anon, authenticated, service_role;

-- Mutating helpers: service-role (Edge Functions) only.
revoke all on function public.next_order_code() from public;
grant execute on function public.next_order_code() to service_role;

revoke all on function public.apply_wallet_txn(uuid, numeric, text, text, text) from public;
grant execute on function public.apply_wallet_txn(uuid, numeric, text, text, text) to service_role;

revoke all on function public.increment_product_sales(uuid, int) from public;
grant execute on function public.increment_product_sales(uuid, int) to service_role;

-- >>>>>>>>>>>>>>>>>>>>  0003_rls.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0003_rls.sql
-- Enable Row Level Security on every table and define access policies.
-- Depends on the helper functions created in 0002_functions.sql.
--
-- Edge Functions use the service-role key, which bypasses RLS entirely; the
-- policies below govern direct anon / authenticated (browser) access only.
-- =============================================================================

-- =============================================================================
-- Enable RLS
-- =============================================================================
alter table public.roles               enable row level security;
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_variants    enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.transactions        enable row level security;
alter table public.discount_codes      enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.reseller_accounts   enable row level security;
alter table public.reseller_prices     enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.deliveries          enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.website_settings    enable row level security;

-- =============================================================================
-- roles — public read, staff write
-- =============================================================================
drop policy if exists roles_public_read on public.roles;
create policy roles_public_read on public.roles
  for select to anon, authenticated
  using (true);

drop policy if exists roles_staff_write on public.roles;
create policy roles_staff_write on public.roles
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- profiles — self read/update, staff read all, owner update/delete
-- (rows are created by the handle_new_user() trigger / service role)
-- =============================================================================
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select to authenticated
  using (public.is_staff());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete on public.profiles
  for delete to authenticated
  using (public.is_owner());

-- =============================================================================
-- categories — public read (active only), staff read all + write
-- =============================================================================
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_active);

drop policy if exists categories_staff_read on public.categories;
create policy categories_staff_read on public.categories
  for select to authenticated
  using (public.is_staff());

drop policy if exists categories_staff_write on public.categories;
create policy categories_staff_write on public.categories
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- products — public read (active only), staff read all + write
-- =============================================================================
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active);

drop policy if exists products_staff_read on public.products;
create policy products_staff_read on public.products
  for select to authenticated
  using (public.is_staff());

drop policy if exists products_staff_write on public.products;
create policy products_staff_write on public.products
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- product_variants — public read (active only), staff read all + write
-- =============================================================================
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (is_active);

drop policy if exists product_variants_staff_read on public.product_variants;
create policy product_variants_staff_read on public.product_variants
  for select to authenticated
  using (public.is_staff());

drop policy if exists product_variants_staff_write on public.product_variants;
create policy product_variants_staff_write on public.product_variants
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- website_settings — public read, staff write
-- =============================================================================
drop policy if exists website_settings_public_read on public.website_settings;
create policy website_settings_public_read on public.website_settings
  for select to anon, authenticated
  using (true);

drop policy if exists website_settings_staff_write on public.website_settings;
create policy website_settings_staff_write on public.website_settings
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- orders — staff only (no anon access; customers track via Edge Function)
-- =============================================================================
drop policy if exists orders_staff_all on public.orders;
create policy orders_staff_all on public.orders
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- order_items — staff only
-- =============================================================================
drop policy if exists order_items_staff_all on public.order_items;
create policy order_items_staff_all on public.order_items
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- payments — staff only
-- =============================================================================
drop policy if exists payments_staff_all on public.payments;
create policy payments_staff_all on public.payments
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- transactions — staff only
-- =============================================================================
drop policy if exists transactions_staff_all on public.transactions;
create policy transactions_staff_all on public.transactions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- deliveries — staff only
-- =============================================================================
drop policy if exists deliveries_staff_all on public.deliveries;
create policy deliveries_staff_all on public.deliveries
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- discount_codes — staff write, select via service role only (no anon/self)
-- =============================================================================
drop policy if exists discount_codes_staff_insert on public.discount_codes;
create policy discount_codes_staff_insert on public.discount_codes
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists discount_codes_staff_update on public.discount_codes;
create policy discount_codes_staff_update on public.discount_codes
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists discount_codes_staff_delete on public.discount_codes;
create policy discount_codes_staff_delete on public.discount_codes
  for delete to authenticated
  using (public.is_staff());

-- Explicit (documentary) service-role read; service_role already bypasses RLS.
drop policy if exists discount_codes_service_read on public.discount_codes;
create policy discount_codes_service_read on public.discount_codes
  for select to service_role
  using (true);

-- =============================================================================
-- discount_redemptions — staff only (redemptions are written by service role)
-- =============================================================================
drop policy if exists discount_redemptions_staff_all on public.discount_redemptions;
create policy discount_redemptions_staff_all on public.discount_redemptions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- reseller_accounts — reseller read/update own, staff read all, owner write all
-- =============================================================================
drop policy if exists reseller_accounts_self_read on public.reseller_accounts;
create policy reseller_accounts_self_read on public.reseller_accounts
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists reseller_accounts_self_update on public.reseller_accounts;
create policy reseller_accounts_self_update on public.reseller_accounts
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists reseller_accounts_staff_read on public.reseller_accounts;
create policy reseller_accounts_staff_read on public.reseller_accounts
  for select to authenticated
  using (public.is_staff());

drop policy if exists reseller_accounts_owner_write on public.reseller_accounts;
create policy reseller_accounts_owner_write on public.reseller_accounts
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- =============================================================================
-- reseller_prices — reseller read/update own, staff read all, owner write all
-- =============================================================================
drop policy if exists reseller_prices_self_read on public.reseller_prices;
create policy reseller_prices_self_read on public.reseller_prices
  for select to authenticated
  using (reseller_id in (select id from public.reseller_accounts where profile_id = auth.uid()));

drop policy if exists reseller_prices_self_update on public.reseller_prices;
create policy reseller_prices_self_update on public.reseller_prices
  for update to authenticated
  using (reseller_id in (select id from public.reseller_accounts where profile_id = auth.uid()))
  with check (reseller_id in (select id from public.reseller_accounts where profile_id = auth.uid()));

drop policy if exists reseller_prices_staff_read on public.reseller_prices;
create policy reseller_prices_staff_read on public.reseller_prices
  for select to authenticated
  using (public.is_staff());

drop policy if exists reseller_prices_owner_write on public.reseller_prices;
create policy reseller_prices_owner_write on public.reseller_prices
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- =============================================================================
-- wallets — reseller read/update own, staff read all, owner write all
-- =============================================================================
drop policy if exists wallets_self_read on public.wallets;
create policy wallets_self_read on public.wallets
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists wallets_self_update on public.wallets;
create policy wallets_self_update on public.wallets
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists wallets_staff_read on public.wallets;
create policy wallets_staff_read on public.wallets
  for select to authenticated
  using (public.is_staff());

drop policy if exists wallets_owner_write on public.wallets;
create policy wallets_owner_write on public.wallets
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- =============================================================================
-- wallet_transactions — reseller read own, staff read all, owner write all
-- =============================================================================
drop policy if exists wallet_transactions_self_read on public.wallet_transactions;
create policy wallet_transactions_self_read on public.wallet_transactions
  for select to authenticated
  using (wallet_id in (select id from public.wallets where profile_id = auth.uid()));

drop policy if exists wallet_transactions_staff_read on public.wallet_transactions;
create policy wallet_transactions_staff_read on public.wallet_transactions
  for select to authenticated
  using (public.is_staff());

drop policy if exists wallet_transactions_owner_write on public.wallet_transactions;
create policy wallet_transactions_owner_write on public.wallet_transactions
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- =============================================================================
-- audit_logs — staff insert, owner select
-- =============================================================================
drop policy if exists audit_logs_staff_insert on public.audit_logs;
create policy audit_logs_staff_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists audit_logs_owner_read on public.audit_logs;
create policy audit_logs_owner_read on public.audit_logs
  for select to authenticated
  using (public.is_owner());

-- =============================================================================
-- Reseller self-service reads (PART 10)
-- A reseller is NOT staff, but must be able to read the orders they placed,
-- their order items and the transactions tied to those orders — scoped through
-- their own reseller_accounts row. Writes remain blocked (Edge Functions act
-- with the service role), so these are SELECT-only permissive policies.
-- =============================================================================
drop policy if exists orders_reseller_self_read on public.orders;
create policy orders_reseller_self_read on public.orders
  for select to authenticated
  using (
    reseller_id in (
      select id from public.reseller_accounts where profile_id = auth.uid()
    )
  );

drop policy if exists order_items_reseller_self_read on public.order_items;
create policy order_items_reseller_self_read on public.order_items
  for select to authenticated
  using (
    order_id in (
      select o.id
        from public.orders o
       where o.reseller_id in (
         select id from public.reseller_accounts where profile_id = auth.uid()
       )
    )
  );

drop policy if exists transactions_reseller_self_read on public.transactions;
create policy transactions_reseller_self_read on public.transactions
  for select to authenticated
  using (
    order_id in (
      select o.id
        from public.orders o
       where o.reseller_id in (
         select id from public.reseller_accounts where profile_id = auth.uid()
       )
    )
  );

drop policy if exists payments_reseller_self_read on public.payments;
create policy payments_reseller_self_read on public.payments
  for select to authenticated
  using (
    order_id in (
      select o.id
        from public.orders o
       where o.reseller_id in (
         select id from public.reseller_accounts where profile_id = auth.uid()
       )
    )
  );

-- >>>>>>>>>>>>>>>>>>>>  0004_seed.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0004_seed.sql
-- Reference data: roles, categories, website settings, a discount code and the
-- product catalogue (51 products + generated variants).
-- Idempotent: every insert uses an ON CONFLICT / guard so re-running is a no-op.
-- =============================================================================

-- =============================================================================
-- roles
-- =============================================================================
insert into public.roles (name, description) values
  ('owner',    'Pemilik sistem'),
  ('admin',    'Pentadbir'),
  ('reseller', 'Peniaga / reseller'),
  ('customer', 'Pelanggan')
on conflict (name) do nothing;

-- =============================================================================
-- categories
-- =============================================================================
insert into public.categories (name, slug, description, sort_order, is_active) values
  ('FREE FIRE',      'free-fire',      'Cheat & tool untuk Free Fire',         1, true),
  ('8 BALL',         '8-ball',         'Cheat & tool untuk 8 Ball Pool',       2, true),
  ('SERTIFIKAT IOS', 'sertifikat-ios', 'Sijil / eSign untuk peranti iOS',      3, true),
  ('Cheat Tools',    'cheat-tools',    'Pelbagai tool cheat',                  4, true),
  ('Games',          'games',          'Kategori permainan lain',              5, true)
on conflict (slug) do nothing;

-- =============================================================================
-- website_settings
-- =============================================================================
insert into public.website_settings (key, value, description) values
  ('site_name',              to_jsonb('FYXITERZ'::text),                                                          'Nama laman'),
  ('currency',               to_jsonb('MYR'::text),                                                               'Mata wang'),
  ('locale',                 to_jsonb('ms'::text),                                                                'Lokasi / bahasa'),
  ('whatsapp',               to_jsonb('60123456789'::text),                                                       'Nombor WhatsApp'),
  ('telegram',               to_jsonb('fyxiterz'::text),                                                          'Username Telegram'),
  ('support_email',          to_jsonb('support@fyxiterz.com'::text),                                             'E-mel sokongan'),
  ('footer_tagline',         to_jsonb('Platform top up & cheat game terpercaya. Proses instan, harga terbaik, pelayanan 24 jam.'::text), 'Tagline footer'),
  ('payment_provider',       to_jsonb('toyyibpay'::text),                                                         'Penyedia pembayaran'),
  ('free_fire_category_slug', to_jsonb('free-fire'::text),                                                        'Slug kategori Free Fire')
on conflict (key) do nothing;

-- =============================================================================
-- discount_codes
-- =============================================================================
insert into public.discount_codes (
  code, description, discount_type, discount_value, min_purchase, max_uses, max_uses_per_user, applies_to, is_active
) values (
  'FYX10', 'Diskaun 10% untuk semua produk', 'percent', 10, 20, 500, 1, 'all', true
)
on conflict (code) do nothing;

-- =============================================================================
-- products (51)
-- =============================================================================
insert into public.products (
  sku, name, slug, description, long_description, image_url,
  category_id, regular_price, reseller_price, cost_price, stock,
  is_bestseller, is_featured, is_active, auto_delivery, delivery_note,
  sales_count, sort_order
)
select
  upper(replace(v.slug, '-', '_'))                                                                     as sku,
  v.name,
  v.slug,
  'Cheat premium update mingguan, aman & terpercaya.'                                                   as description,
  'Produk digital premium untuk game kegemaran anda. Akses dihantar secara automatik selepas pembayaran disahkan. Sokongan pelanggan 24 jam.' as long_description,
  null::text                                                                                            as image_url,
  c.id                                                                                                  as category_id,
  v.price                                                                                               as regular_price,
  round(v.price * 0.80, 2)                                                                              as reseller_price,
  round(v.price * 0.60, 2)                                                                              as cost_price,
  999                                                                                                   as stock,
  v.slug in (
    'drip-wire','xreg-non-root','rezzxmodz-android--ios','phantom-android--ios',
    'drip-client-apkmod','hg-apkmod-ff','drip-proxy','hg-proxy-'
  )                                                                                                     as is_bestseller,
  v.slug in (
    'drip-wire','xreg-non-root','phantom-android--ios','rezzxmodz-android--ios',
    'gboxesign-ios','hg-apkmod-ff','ultra-plugin-mlbb','migul-pro-ios-ff'
  )                                                                                                     as is_featured,
  true                                                                                                  as is_active,
  true                                                                                                  as auto_delivery,
  'Akses / akaun akan dihantar secara automatik melalui e-mel setelah pembayaran disahkan.'            as delivery_note,
  v.sales                                                                                               as sales_count,
  v.sort_order                                                                                          as sort_order
from (values
  ('ABCD PROXY',                     'abcd-proxy',                'free-fire',      5,  51,  1),
  ('AIMHACK ANDROID + IOS',          'aimhack-android--ios',      'free-fire',      2,  91,  2),
  ('ANGRY MODS ROOT',                'angry-mods-root',           'free-fire',      4,  11,  3),
  ('AURORA VN PC',                   'aurora-vn-pc',              'free-fire',     20,   6,  4),
  ('BALAMOD APKMOD',                 'balamod-apkmod',            'free-fire',      2,  41,  5),
  ('BR MODS APKMOD',                 'br-mods-apkmod',            'free-fire',      6,  12,  6),
  ('BR MODS ROOT',                   'br-mods-root',              'free-fire',      6,   8,  7),
  ('BR MODS SLIENT PC',              'br-mods-slient-pc',         'free-fire',      8,   2,  8),
  ('DRIP CLIENT 8 BALL',             'drip-client-8-ball',        '8-ball',         5,   0,  9),
  ('DRIP CLIENT APKMOD',             'drip-client-apkmod',        'free-fire',      8, 380, 10),
  ('DRIP CLIENT ROOT',               'drip-client-root',          'free-fire',      5,   4, 11),
  ('DRIP PROXY',                     'drip-proxy',                'free-fire',      6, 134, 12),
  ('DRIP WIRE ANDROID + IOS',        'drip-wire',                 'free-fire',      8,1068, 13),
  ('EXTERNAL KIWMODZ',               'external-kiwmodz',          'free-fire',      5,   1, 14),
  ('FLUORITE 8 BALL',                'fluorite-8-ball',           '8-ball',         8,   0, 15),
  ('FLUORITE IOS FF',                'fluorite-ios-ff',           'free-fire',      8,   0, 16),
  ('GBOX/ESIGN IOS',                 'gboxesign-ios',             'sertifikat-ios',16,   7, 17),
  ('HAXXCKER PRO ROOT',              'haxxcker-pro-root',         'free-fire',      5,   0, 18),
  ('HG APKMOD FF',                   'hg-apkmod-ff',              'free-fire',      5, 291, 19),
  ('HG APKMOD VERSI GLOBAL SAFE',    'hg-apkmod-versi-global-safe','free-fire',    6,  36, 20),
  ('HG CHEAT GLOBAL SAFE',           'hg-cheat-global-safe',      'free-fire',      6,  38, 21),
  ('HG PROXY',                       'hg-proxy-',                 'free-fire',      5, 100, 22),
  ('HG PROXY PRIME',                 'hg-proxy-prime',            'free-fire',      5,   7, 23),
  ('MIGUL IOS LITE FF',              'migul-ios-lite-ff',         'free-fire',      8,   3, 24),
  ('MIGUL PRO IOS FF',               'migul-pro-ios-ff',          'free-fire',     12,  12, 25),
  ('PARID CORE ROOT INJECTOR',       'parid-core-root-injector',  'free-fire',      8,   1, 26),
  ('PATO BLUE',                      'pato-blue',                 'free-fire',      6,  22, 27),
  ('PATO ORANGE',                    'pato-orange',               'free-fire',      6,  26, 28),
  ('PATO REGEDIT NON ROOT',          'pato-regedit-non-root',     'free-fire',      5,   1, 29),
  ('PHANTOM ANDROID + iOS',          'phantom-android--ios',      'free-fire',     10, 415, 30),
  ('PLUGIN (name "PLUGIN")',         'plugin-all-game',           'cheat-tools',    4,   0, 31),
  ('PRIME HOOK APKMOD',              'prime-hook-apkmod',         'free-fire',      6,  21, 32),
  ('PRODUK OFFLINE',                 'fluorite-ios-mlbb',         'cheat-tools',    8,   0, 33),
  ('PRODUK MATI',                    'produk-mati',               'games',          0,   0, 34),
  ('PROXY FF IOS',                   'proxy-ff-ios',              'free-fire',      5,   6, 35),
  ('REAPER X PRO',                   'reaper-x-pro-',             'free-fire',      5,   0, 36),
  ('REZZXMODZ ANDROID + iOS',        'rezzxmodz-android--ios',    'free-fire',     10, 459, 37),
  ('SLIENT CHEAT PROXY TANPA ROOT',  'slient-cheats-proxy',       'free-fire',      6,  22, 38),
  ('SLIENT CHEATS',                  'slient-cheats',             'free-fire',      2,   7, 39),
  ('SLIENT CHEATS APKMOD',           'slient-cheats-apkmod',      'games',          4,   1, 40),
  ('SLIENT CHEATS PROXY',            'slient-cheats-proxy-2',     'free-fire',      5,   0, 41),
  ('SLIENT CHEATS ROOT SAFE',        'slient-cheats-root-safe',   'free-fire',      5,   1, 42),
  ('SLIENTX ANDROID + IOS',          'slientx-android--ios',      'free-fire',      6,   8, 43),
  ('TrollModz Android + iOS',        'trollmodz-android--ios',    'free-fire',      6,  37, 44),
  ('ULTRA BLOODSTRIKE',              'ultra-bloodstrike',         'games',          8,   0, 45),
  ('ULTRA PLUGIN',                   'ultra-plugin-mlbb',         'cheat-tools',    5,   1, 46),
  ('ULTRA PLUGIN 8 BALL',            'ultra-plugin-8-ball',       '8-ball',         6,   0, 47),
  ('VELORA EXTERNAL IOS',            'velora-external-ios',       'free-fire',      6,   1, 48),
  ('VIN PROXY IOS',                  'vin-proxy-ios',             'free-fire',      6,   0, 49),
  ('XREG ANDROID + IOS',             'xreg-android--ios',         'free-fire',      6,   1, 50),
  ('XREG NON ROOT',                  'xreg-non-root',             'free-fire',      5, 726, 51)
) as v(name, slug, category_slug, price, sales, sort_order)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

-- =============================================================================
-- product_variants — 8 duration tiers per product (only if it has none yet)
-- =============================================================================
insert into public.product_variants (
  product_id, name, sku, price, reseller_price, stock, duration_label, is_active, sort_order
)
select
  p.id,
  t.name,
  p.sku || '-' || t.code,
  round(greatest(p.regular_price, 1) * t.mult, 2),
  round(greatest(p.regular_price, 1) * t.mult * 0.80, 2),
  999,
  t.name,
  true,
  t.sort_order
from public.products p
cross join (values
  ('1 JAM',   '1J',  1.0::numeric, 1),
  ('3 JAM',   '3J',  1.6,          2),
  ('6 JAM',   '6J',  2.4,          3),
  ('12 JAM',  '12J', 4.0,          4),
  ('1 HARI',  '1H',  5.0,          5),
  ('3 HARI',  '3H',  8.0,          6),
  ('7 HARI',  '7H',  14.0,         7),
  ('30 HARI', '30H', 30.0,         8)
) as t(name, code, mult, sort_order)
where not exists (
  select 1 from public.product_variants pv where pv.product_id = p.id
);

-- >>>>>>>>>>>>>>>>>>>>  0005_payment_method.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0005_payment_method.sql
-- Records the gateway channel the customer selected at checkout.
--
-- Ids match CHIP's `payment_method_whitelist` values, e.g.
--   tng_ewallet  -> Touch 'n Go eWallet
--   fpx          -> FPX online banking
--   card         -> Visa / Mastercard
--   duitnow_qr   -> DuitNow QR
--
-- Additive and idempotent: safe to run on an existing database.
-- =============================================================================

alter table public.orders   add column if not exists payment_method text;
alter table public.payments add column if not exists payment_method text;

create index if not exists idx_orders_payment_method   on public.orders (payment_method);
create index if not exists idx_payments_payment_method on public.payments (payment_method);

-- >>>>>>>>>>>>>>>>>>>>  0006_payment_settings.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0006_payment_settings.sql
-- Website settings for the manual QR transfer payment mode.
--
-- These override the defaults in assets/js/config.js at runtime, so the Owner
-- can change the payment QR / payee / instructions from the dashboard without
-- touching code.
--
-- Idempotent: re-running does not overwrite values you have already customised.
-- =============================================================================

insert into public.website_settings (key, value, description) values
  ('payment_mode',         to_jsonb('qr'::text),                                   'Mod pembayaran: qr (transfer manual) atau gateway'),
  ('payment_qr_url',       to_jsonb('assets/img/payment-qr-placeholder.svg'::text),'URL imej kod QR pembayaran anda'),
  ('payment_qr_payee',     to_jsonb('FYXITERZ'::text),                             'Nama penerima pembayaran'),
  ('payment_instructions', '["Buka aplikasi bank / e-wallet anda (Touch ''n Go eWallet, Maybank2u, CIMB, Boost, dll).","Pilih DuitNow QR / Imbas QR, kemudian imbas kod di atas.","Masukkan jumlah TEPAT seperti dipaparkan dan sahkan pembayaran.","Hantar bukti pembayaran (screenshot) ke WhatsApp kami untuk pengesahan."]'::jsonb,
                           'Langkah pembayaran QR (senarai)')
on conflict (key) do nothing;

-- >>>>>>>>>>>>>>>>>>>>  0007_grants.sql  <<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- FYXITERZ — 0007_grants.sql
-- Explicit table / sequence / function privileges.
--
-- Why this exists:
--   Supabase normally hands out the right table privileges through the
--   `public` schema default privileges, but that is not guaranteed. A table
--   created by a different role (or a project whose defaults were changed)
--   ends up unreadable to the API, producing:
--
--       {"code":"42501","message":"permission denied for table orders"}
--
--   Declaring the privileges explicitly makes the setup deterministic on any
--   project. Row Level Security (0003_rls.sql) is still the real gate: RLS is
--   enabled on every table, so granting SELECT does NOT expose rows that
--   anon/authenticated are not allowed to see.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- anon (the storefront): read-only. It never writes directly — every write
-- (orders, payments, reseller purchases) goes through an Edge Function that
-- uses service_role and re-validates the caller.
grant select on all tables in schema public to anon;

-- authenticated (staff dashboards): read + write, still filtered by RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- service_role: used by Edge Functions, bypasses RLS by design.
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Objects created later inherit the same privileges.
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;
