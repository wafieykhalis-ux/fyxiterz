-- =============================================================================
-- FYXITERZ — 0010_fix_bugs.sql
-- Corrective migration for databases created BEFORE the fixes applied to
-- 0001_schema.sql and 0003_rls.sql. Safe to run once against a live project
-- (idempotent: guarded by IF EXISTS / drop-create).
--
-- A fresh run of setup_all.sql already contains both fixes, so this file is
-- NOT part of setup_all.sql (same convention as 0008_repair_legacy_profiles).
--
-- What it fixes:
--   1. orders.reseller_id referenced profiles(id), but the app stores
--      reseller_accounts.id. The wrong FK made every reseller/customer order
--      insert fail with a foreign-key violation. Now references
--      reseller_accounts(id), matching the RLS policies.
--   2. discount_codes had no SELECT policy for staff, so the owner dashboard
--      could not list discount codes. Adds a staff SELECT policy.
-- =============================================================================

-- 1. Fix orders.reseller_id foreign key -------------------------------------
do $$
begin
  alter table public.orders drop constraint if exists orders_reseller_id_fkey;
  alter table public.orders
    add constraint orders_reseller_id_fkey
    foreign key (reseller_id) references public.reseller_accounts(id) on delete set null;
end $$;

-- 2. Allow staff (owner/admin) to read discount_codes -----------------------
drop policy if exists discount_codes_staff_select on public.discount_codes;
create policy discount_codes_staff_select on public.discount_codes
  for select to authenticated
  using (public.is_staff());
