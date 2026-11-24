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
