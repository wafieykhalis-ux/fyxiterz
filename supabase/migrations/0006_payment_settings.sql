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
