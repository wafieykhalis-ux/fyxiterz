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
  reseller_id       uuid,  -- FK -> public.reseller_accounts(id); added after that table (see below)
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

-- orders.reseller_id points at the reseller ACCOUNT, not the profile: the app
-- stores reseller_accounts.id here and RLS compares it against reseller_accounts.
-- Added here because reseller_accounts is created after orders.
do $$
begin
  alter table public.orders drop constraint if exists orders_reseller_id_fkey;
  alter table public.orders
    add constraint orders_reseller_id_fkey
    foreign key (reseller_id) references public.reseller_accounts(id) on delete set null;
end $$;

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
