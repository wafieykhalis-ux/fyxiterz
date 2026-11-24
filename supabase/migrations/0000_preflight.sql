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
