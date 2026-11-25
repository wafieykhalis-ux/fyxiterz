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
-- discount_codes — staff read + write (no anon/self)
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

-- Staff (owner/admin) must be able to list codes in the dashboard.
drop policy if exists discount_codes_staff_select on public.discount_codes;
create policy discount_codes_staff_select on public.discount_codes
  for select to authenticated
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
