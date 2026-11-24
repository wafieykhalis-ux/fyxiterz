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
