-- =============================================================================
-- FYXITERZ — 0008_repair_legacy_profiles.sql
--
-- ONE-TIME REPAIR (for projects that already ran 0000 -> 0007).
--
-- Background / why this exists:
--   The first version of 0000_preflight.sql only checked a SINGLE signature
--   column per table (`role` for profiles). A leftover hand-made `profiles`
--   table that happened to already have a `role` column therefore survived the
--   preflight. Its real shape was only
--       { id, email, role, created_at }
--   which broke the schema in three ways:
--     1. handle_new_user() inserts (id, email, full_name, role) -> the
--        "column full_name does not exist" error aborts every new signup.
--     2. Six foreign keys (orders.reseller_id, reseller_accounts.profile_id,
--        reseller_accounts.approved_by, wallets.profile_id,
--        audit_logs.actor_id, website_settings.updated_by) point at the wrong
--        table.
--     3. Two leftover dashboard policies ("Users can read own profile",
--        "Users can view own profile") sit next to the FYXITERZ policies.
--
--   The fixed 0000_preflight.sql (multi-column check) prevents this on a FRESH
--   project. This script repairs a project that already hit the bug — it keeps
--   the legacy table as a backup under `_legacy_profiles` and never drops your
--   data. It is safe to run once; if `public.profiles` already matches the
--   FYXITERZ schema it aborts with a clear notice instead of touching anything.
--
-- Run order: 0000 -> 0001 -> ... -> 0007 -> 0008 (this file).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Guard: only proceed if public.profiles is still the legacy shape.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'full_name'
  ) then
    raise exception
      'public.profiles already matches the FYXITERZ schema — 0008_repair_legacy_profiles.sql is not needed.';
  end if;
end $$;

begin;

-- -----------------------------------------------------------------------------
-- 1. Detach the six foreign keys that point at public.profiles.
--    (They are re-created at the end against the rebuilt table.)
-- -----------------------------------------------------------------------------
alter table if exists public.orders            drop constraint if exists orders_reseller_id_fkey;
alter table if exists public.reseller_accounts drop constraint if exists reseller_accounts_profile_id_fkey;
alter table if exists public.reseller_accounts drop constraint if exists reseller_accounts_approved_by_fkey;
alter table if exists public.wallets           drop constraint if exists wallets_profile_id_fkey;
alter table if exists public.audit_logs        drop constraint if exists audit_logs_actor_id_fkey;
alter table if exists public.website_settings  drop constraint if exists website_settings_updated_by_fkey;

-- Any other (non-standard named) FK that still references public.profiles.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Move the legacy table aside (kept as a backup — never dropped).
-- -----------------------------------------------------------------------------
alter table public.profiles rename to _legacy_profiles;

-- -----------------------------------------------------------------------------
-- 3. Recreate public.profiles with the FYXITERZ definition (mirrors 0001_schema.sql).
-- -----------------------------------------------------------------------------
create table public.profiles (
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

create index if not exists idx_profiles_role on public.profiles(role);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security + policies (mirrors 0003_rls.sql).
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

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

-- -----------------------------------------------------------------------------
-- 5. Privileges (mirrors 0007_grants.sql).
-- -----------------------------------------------------------------------------
grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant all privileges on public.profiles to service_role;

-- -----------------------------------------------------------------------------
-- 6. Restore the owner / staff rows captured in the legacy table.
-- -----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, role, is_active)
select
  l.id,
  l.email,
  coalesce(nullif(l.email, ''), 'User'),
  case when l.role in ('owner', 'admin', 'reseller', 'customer') then l.role else 'customer' end,
  true
from public._legacy_profiles l
where exists (select 1 from auth.users u where u.id = l.id)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 7. Backfill a profile for every auth user that still has none
--    (so handle_new_user() / triggers always have a matching row).
-- -----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, role, is_active)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
  case when u.email = 'akowafiey87@gmail.com' then 'owner' else 'customer' end,
  true
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 8. Re-attach the six foreign keys against the rebuilt table.
-- -----------------------------------------------------------------------------
alter table public.orders
  add constraint orders_reseller_id_fkey
  foreign key (reseller_id) references public.profiles(id) on delete set null;

alter table public.reseller_accounts
  add constraint reseller_accounts_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.reseller_accounts
  add constraint reseller_accounts_approved_by_fkey
  foreign key (approved_by) references public.profiles(id);

alter table public.wallets
  add constraint wallets_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.website_settings
  add constraint website_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles(id);

commit;

-- =============================================================================
-- Verify (optional):
--   select count(*) from public.profiles;                 -- >= 1
--   select id, email, role from public.profiles;
--   select proname from pg_proc where proname = 'handle_new_user';
-- =============================================================================
