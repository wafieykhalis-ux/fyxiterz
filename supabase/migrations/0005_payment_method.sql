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
