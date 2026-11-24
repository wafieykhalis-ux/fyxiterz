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
