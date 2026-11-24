# FYXITERZ — Digital Store (Supabase + GitHub Pages)

FYXITERZ is a production-oriented digital-goods storefront (game top-ups, cheats,
tools, certificates) for the Malaysian market. It uses **Supabase** for the
database, authentication and server-side logic, and ships as a **static site**
deployable to **GitHub Pages**.

- **Currency:** MYR (RM) · **Language:** Malay (UI) · **Customer login:** not required
- **Staff login:** required (Owner / Admin / Reseller)
- **Payments:** real Malaysian gateway (ToyyibPay or CHIP)
- **Reference layout benchmark:** a VIPLORDZ-style store, reproduced with original FYXITERZ branding

---

## 1. Architecture

```
Browser (static, GitHub Pages)
  ├─ assets/js/config.js      public runtime config (Supabase URL + anon key)
  ├─ assets/js/supabase.js    data + auth layer (PostgREST / GoTrue / Edge Functions via fetch)
  ├─ assets/js/storefront.js  shared UI kit (header, footer, cards, cart, toasts)
  └─ pages: index / products / product / checkout / track-order
             staff-login / owner / admin / reseller
        │
        ▼
Supabase
  ├─ Postgres (18 tables, constraints, indexes, triggers, RLS)
  ├─ Auth (GoTrue) — staff sessions
  ├─ Storage — product image uploads (bucket: product-images)
  └─ Edge Functions (Deno/TypeScript) — all privileged + payment logic
        │
        ▼
Payment gateway (ToyyibPay / CHIP) ──webhook──▶ payment-webhook Edge Function
```

Two execution modes:

| Mode | When | Behaviour |
|------|------|-----------|
| **Live** | `SUPABASE_URL` + `SUPABASE_ANON_KEY` set in `config.js` | Real DB, auth, orders and payments |
| **Demo** | Left empty | Bundled catalogue (`assets/data/seed.js`) + `localStorage`. Every screen is browsable, but **no order is ever marked paid** and real writes/payments are disabled with a clear label |

> Safeguard: a payment is **never** considered successful because of a browser
> redirect. Only the signed webhook (`payment-webhook`) or the reconciler
> (`verify-payment`) may mark an order paid.

---

## 2. Project structure

```
/fyxiterz
  index.html  products.html  product.html  checkout.html  track-order.html
  staff-login.html  owner.html  admin.html  reseller.html
  /assets
    /css    style.css  dashboard.css
    /js     config.js  supabase.js  storefront.js  products.js  checkout.js
            tracking.js  authentication.js  owner.js  admin.js  reseller.js
    /data   seed.js                     # demo-mode catalogue
    /img    logo.svg  logo2.svg  favicon.svg
  /supabase
    /migrations  0001_schema.sql  0002_functions.sql  0003_rls.sql  0004_seed.sql
    /functions   _shared/ + 13 functions (see §5)
  README.md  .env.example
```

---

## 3. Supabase setup

### 3.1 Create the project
1. Create a project at <https://supabase.com>.
2. Copy **Project URL**, **anon public key** and **service_role key**
   (Project Settings → API). The service_role key is **backend-only**.

### 3.2 Create the database schema
Run the migrations **in order** (SQL Editor, or the CLI):

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push          # applies supabase/migrations/* in order
```

Files:
1. `0001_schema.sql` — extensions, 18 tables, FKs, ~30 indexes, `updated_at` triggers.
2. `0002_functions.sql` — helper functions (`auth_role`, `is_staff`, `is_owner`, `is_admin`,
   `is_reseller`, `next_order_code`, `apply_wallet_txn`, `increment_product_sales`,
   `handle_new_user`) — **must run before RLS**.
3. `0003_rls.sql` — RLS enabled on every table + policies (staff/owner/reseller/public).
4. `0004_seed.sql` — roles, 5 categories, 9 website settings, discount code `FYX10`,
   51 products each with 8 variants.
5. `0005_payment_method.sql` — adds `payment_method` to `orders` / `payments`
   (records the chosen gateway channel, e.g. Touch 'n Go eWallet). Additive and
   idempotent — safe to run on an existing database.

### 3.3 Storage bucket
Create a **public** bucket named `product-images` (or set `STORAGE_BUCKET` in
`config.js`). Add a Storage policy allowing authenticated staff to `insert`/`update`
objects in that bucket.

### 3.4 Deploy the Edge Functions
```bash
supabase functions deploy            # deploys all functions in supabase/functions
# or individually, e.g.
supabase functions deploy create-order
```

### 3.5 Set function secrets
**Touch 'n Go eWallet is offered through CHIP** (TNG eWallet has no standalone
merchant gateway; CHIP exposes it as the `tng_ewallet` channel). So CHIP is the
recommended provider:

```bash
supabase secrets set \
  PUBLIC_SITE_URL="https://YOUR-USERNAME.github.io/fyxiterz" \
  PAYMENT_PROVIDER="chip" \
  CHIP_SECRET_KEY="..." CHIP_BRAND_ID="..." \
  CHIP_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

ToyyibPay alternative (FPX / card only — **no TNG eWallet**):
```bash
supabase secrets set \
  PUBLIC_SITE_URL="https://YOUR-USERNAME.github.io/fyxiterz" \
  PAYMENT_PROVIDER="toyyibpay" \
  TOYYIBPAY_SECRET_KEY="..." TOYYIBPAY_CATEGORY_CODE="..."
```
`PAYMENT_PROVIDER` must match `PAYMENT_PROVIDER` in `assets/js/config.js`.
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to
Edge Functions automatically by Supabase.

### 3.6 Point the front-end at Supabase
Edit `assets/js/config.js`:
```js
SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
SUPABASE_ANON_KEY: "YOUR_ANON_PUBLIC_KEY",
```
The anon key is a **public** key and is safe in the browser. **Never** put the
service_role key in `config.js`.

---

## 4. Owner account bootstrap

Staff accounts live in Supabase Auth and mirror into `public.profiles`.

1. **Create the Auth user** (Dashboard → Authentication → Users → *Add user*, or
   `supabase auth`), e.g. `owner@fyxiterz.com` with a strong password.
2. **Promote to owner** (SQL Editor):
   ```sql
   update public.profiles
      set role = 'owner', is_active = true
    where email = 'owner@fyxiterz.com';
   ```
   If the profile row was not auto-created, insert it with the matching `id` from
   `auth.users`:
   ```sql
   insert into public.profiles (id, email, full_name, role, is_active)
   select id, email, 'FYXITERZ Owner', 'owner', true
     from auth.users where email = 'owner@fyxiterz.com'
   on conflict (id) do update set role = 'owner', is_active = true;
   ```
3. Sign in at `staff-login.html`. The Owner can then create Admin/Reseller accounts
   from the **Akaun Staf** section (this calls the `create-staff` Edge Function).

> Only an authenticated **Owner** can create/update/delete staff — enforced both in
> the Edge Functions and by RLS.

---

## 5. Edge Functions

All functions validate input, verify the caller's role server-side and return JSON
errors. Never trust client-supplied prices.

| Function | Auth | Purpose |
|----------|------|---------|
| `create-staff` | Owner | Create Auth user + profile (admin/reseller) |
| `update-staff` | Owner | Update name/role/active state |
| `delete-staff` | Owner | Delete staff account |
| `create-order` | Public | Checkout; recomputes all prices server-side |
| `create-payment` | Public | Create gateway bill, returns `checkout_url` |
| `payment-webhook` | Gateway | Verify signature, idempotent mark paid, auto-deliver |
| `verify-payment` | Public | Reconcile an order's payment status with the gateway |
| `track-order` | Public | Email + order code lookup (rate-limited) |
| `apply-discount` | Public | Validate a discount code (no consumption) |
| `process-delivery` | Staff | Deliver order items (auto keys / manual) |
| `update-order-status` | Staff | Change order / payment status |
| `reseller-purchase` | Reseller | Server-priced purchase + wallet debit |
| `dashboard-statistics` | Owner/Admin | Aggregate metrics (Owner gets extras) |

Shared code lives in `supabase/functions/_shared/` (`cors.ts`, `supabase.ts`, `util.ts`).

### Payment webhook URL
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/payment-webhook?provider=toyyibpay
https://YOUR-PROJECT-REF.supabase.co/functions/v1/payment-webhook?provider=chip
```
Configure these as the callback/return URLs in the gateway dashboard (the
`create-payment` function sets them automatically on the bill).

### Payment channels (checkout)

The checkout offers the channels listed in `config.js` → `PAYMENT_METHODS`, filtered
to those the active `PAYMENT_PROVIDER` supports. The customer's choice travels:
`checkout.js` → `create-order` (stored on `orders.payment_method`) →
`create-payment` (sent to the gateway) → `payments.payment_method`.

| Channel id | Label | CHIP | ToyyibPay |
|-----------|-------|:----:|:---------:|
| `tng_ewallet` | Touch 'n Go eWallet | ✅ | ❌ |
| `fpx` | FPX online banking | ✅ | ✅ |
| `card` | Visa / Mastercard | ✅ | ✅ |
| `duitnow_qr` | DuitNow QR | ✅ | ⚠️ (per-category) |

For CHIP the id is passed as `payment_method_whitelist`, which locks the gateway
page to the chosen channel. Requesting `tng_ewallet` while `PAYMENT_PROVIDER=toyyibpay`
is rejected with a clear error instead of silently downgrading.

### Manual QR transfer mode (no gateway)

Set `PAYMENT_MODE = "qr"` in `config.js` to accept payments **without any gateway** —
money goes straight into your own account. Flow:

1. Checkout shows **your QR** (DuitNow / bank), the payee and the exact amount.
2. Customer transfers, then taps **“Hantar Bukti ke WhatsApp”** (pre-filled with the
   order code and amount).
3. A staff member opens the order in the dashboard and sets payment status → **paid**
   (`update-order-status`), which also lets them process delivery.
4. The customer can follow progress on **Lacak Pesanan**.

This is a real, staff-verified flow — the site never marks an order paid on its own.
Replace the QR:

- **Quick:** put your image at `assets/img/my-qr.png` and point `QR_PAYMENT.QR_IMAGE`
  at it in [config.js](assets/js/config.js).
- **From the dashboard (no code):** Owner → **Tetapan Laman** → *URL Imej QR*,
  *Bayar Kepada*, *Langkah Pembayaran*. These are stored in `website_settings`
  (`payment_mode`, `payment_qr_url`, `payment_qr_payee`, `payment_instructions`)
  and override the `config.js` defaults.

> The shipped `assets/img/payment-qr-placeholder.svg` is a **labelled placeholder** —
> it is not a scannable code. Replace it with your own QR before going live.

---

## 6. Roles & permissions

| Capability | Owner | Admin | Reseller | Public |
|-----------|:-----:|:-----:|:--------:|:------:|
| Storefront, cart, checkout, tracking | ✅ | ✅ | ✅ | ✅ |
| Dashboard statistics | ✅ (full) | ✅ | own only | — |
| Products / categories / stock | ✅ | ✅ | — | read |
| Orders view & status | ✅ | ✅ | own only | — |
| Customers | ✅ | ✅ | — | — |
| Sales reports | ✅ | ✅ | own only | — |
| Reseller price catalogue & purchase | ✅ | — | ✅ | — |
| Wallet | ✅ | — | own | — |
| Staff accounts (create/suspend/delete) | ✅ | — | — | — |
| Resellers, discount codes, transactions, audit logs, site settings | ✅ | — | — | — |

Permissions are enforced in three layers: **RLS**, **Edge Function role checks**, and
**UI guards** (UX only).

---

## 7. GitHub Pages deployment

1. Push the project to a GitHub repository.
2. Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`.
3. Set `PUBLIC_SITE_URL` (function secret) to your Pages URL so gateway redirects
   return correctly.
4. Because the site uses `fetch()` (no CDN bundles), it works under a strict CSP.
   If you add one, allow `https://YOUR-PROJECT-REF.supabase.co` in `connect-src`
   and Google Fonts in `style-src`/`font-src`.

> This is a static site, so `assets/js/config.js` is public — that is expected and safe
> (anon key only).

---

## 8. Local development

```bash
# serve the static site (any static server works)
python3 -m http.server 8099
# then open http://127.0.0.1:8099/

# Supabase CLI (optional)
supabase start           # local stack
supabase db reset        # re-apply migrations + seed
supabase functions serve # run Edge Functions locally
```

---

## 9. Testing report

Environment: static site served over HTTP; Node.js v24 for syntax + logic checks.

### 9.1 Automated checks performed

| Test | Result |
|------|--------|
| `node --check` on all 11 JS files (`assets/js/*.js`, `assets/data/seed.js`) | ✅ pass |
| All 9 HTML pages return HTTP 200 | ✅ pass |
| All 16 referenced CSS/JS/SVG assets resolve (HTTP 200) | ✅ pass |
| Edge Function imports resolve to existing `_shared` exports | ✅ pass (static review) |
| Front-end ↔ Edge Function request/response contracts match | ✅ pass (static review) |
| Touch 'n Go eWallet channel plumbed end-to-end (config → checkout → order → payment) | ✅ pass |
| Manual QR mode: checkout renders QR + amount, order created unpaid, staff-verifiable | ✅ pass |

Demo-mode logic test (22 assertions, all pass):

```
✓ runs in demo mode without credentials
✓ loaded 5 categories        ✓ loaded 51 products
✓ bestseller filter (10)     ✓ featured filter (6)      ✓ search "proxy" (8)
✓ price-asc ordering         ✓ nested category object   ✓ 8 variants, ascending prices
✓ getProductBySlug resolves  ✓ FYX10 → RM10 (10% of 100)
✓ FYX5 rejected below min    ✓ unknown code rejected
✓ order code format INV-XXXXXX
✓ server-side total recomputed (23.04 == 23.04)
✓ discount applied to order
✓ demo payment returns no live URL (never faked)
✓ track-order finds order by email+code
✓ track-order rejects mismatched email
✓ staff stats reflect new order
✓ reseller dashboard loads in demo
```

### 9.2 Issues found & fixed during testing

1. **Checkout payment URL never appeared.** `checkout.js` read `order.checkout_url`
   from `create-order`, which does not return it; the URL comes from `create-payment`.
   → Reordered the flow so `createPayment` resolves first and its `checkout_url` is
   passed into the confirmation modal.
2. **Reseller dashboard called a staff-only function.** `dashboard-statistics`
   rejects resellers.
   → Reseller now reads its own orders/transactions/wallet via RLS-scoped REST.
3. **Resellers could not read their own orders.** `orders`/`transactions` were
   staff-only under RLS.
   → Added SELECT-only self-read policies (`orders_reseller_self_read`,
   `order_items_reseller_self_read`, `transactions_reseller_self_read`,
   `payments_reseller_self_read`) scoped through the reseller's own account row.
4. **Reseller purchase rejected for missing WhatsApp.** The backend requires it.
   → The purchase modal now requires and validates WhatsApp, and supports wallet payment.
5. **No way to choose a payment channel (e.g. Touch 'n Go eWallet).** Checkout showed a
   static "provider — FPX / e-Wallet / Kad" label; the channel never reached the gateway.
   → Added a selectable channel list (`config.js` → `PAYMENT_METHODS`), stored on
   `orders.payment_method` / `payments.payment_method` (migration `0005`), and forwarded
   to CHIP as `payment_method_whitelist`. ToyyibPay requests for `tng_ewallet` are
   rejected with a clear message (it has no TNG channel) instead of silently downgrading.
6. **No gateway-free way to take payments.** Not every seller has a CHIP/ToyyibPay account.
   → Added a **manual QR transfer mode** (`PAYMENT_MODE = "qr"`): checkout shows the
   seller's own QR + exact amount, the customer sends WhatsApp proof, and staff verify
   the order in the dashboard. Settings are editable by the Owner
   (`website_settings`; migration `0006`) so no code change is needed.

### 9.3 Manual/responsive checklist

Verified by layout at 375 / 390 / 430 / 768 / 1024 / 1440 px:
- No horizontal overflow; product grid steps 2 → 3 → 4 columns (breakpoints 768 / 1100 px).
- Header search + nav collapse correctly; mobile bottom-nav shows ≤767 px.
- Dashboard sidebar becomes a slide-in drawer ≤900 px.
- All buttons/links wired (cart, checkout, tracking, staff login, dashboards).

### 9.4 Not executable in this sandbox (require live credentials)

These paths are implemented and statically verified but **must be validated against a
live Supabase project + gateway** before go-live:
- Real order creation, real payment bill creation and signed webhook reconciliation.
- Supabase Auth sign-in and RLS behaviour with real JWT claims.
- CHIP/ToyyibPay hash/signature exact concatenation (see §10).
- Touch 'n Go eWallet channel arriving end-to-end from the CHIP gateway page.

---

## 10. Required configuration you must supply (exact list)

The site runs in **demo mode** until these are provided:

**Front-end — `assets/js/config.js`**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- (`STORAGE_BUCKET` if you rename the bucket; `PAYMENT_PROVIDER` must match the backend)

**Supabase secrets — `supabase secrets set …` (`.env.example` lists them)**
- `PUBLIC_SITE_URL`
- **QR mode needs none of these.** Only set them if `PAYMENT_MODE = "gateway"`:
  - `PAYMENT_PROVIDER` = `chip` (recommended, for Touch 'n Go eWallet) or `toyyibpay`
  - CHIP: `CHIP_SECRET_KEY`, `CHIP_BRAND_ID`, `CHIP_PUBLIC_KEY`
  - ToyyibPay (FPX/card only, no TNG eWallet): `TOYYIBPAY_SECRET_KEY`, `TOYYIBPAY_CATEGORY_CODE`

**Gateway account (only you can create this) — only for `PAYMENT_MODE = "gateway"`**
- Sign up at <https://chip-in.asia> (or <https://toyyibpay.com>), complete KYC.
- CHIP: copy the **Brand ID** and **Secret Key**; enable the **Touch 'n Go eWallet**
  channel in the CHIP portal; copy the webhook **public key** into `CHIP_PUBLIC_KEY`.
- Set the callback/webhook to `…/functions/v1/payment-webhook?provider=chip`.
- **If you use QR mode, skip this entirely — no gateway account is required.**

> ⚠️ **Verify signature formats against the live gateway docs.** ToyyibPay's
> documented callback hash concatenation has varied between doc versions;
> `payment-webhook` accepts the common variants with an HMAC-SHA256 fallback and
> carries an inline note to confirm the exact string before production. CHIP
> webhooks are verified with an RSA-SHA256 signature (`CHIP_PUBLIC_KEY`).

---

## 11. Security notes

- `service_role` key, gateway secret keys and webhook signing keys live **only** in
  Supabase secrets — never in the repo or the browser.
- RLS is enabled on all 18 tables; privileged mutations run in Edge Functions using
  the service role *after* role verification.
- Sweeping input validation, parameterised queries via PostgREST (no string SQL),
  output escaping in the UI (XSS), best-effort in-memory rate limiting, and audit
  logging on sensitive actions.
- Order tracking requires **both** email and order code.

For durable, distributed rate limiting, back `_shared/util.ts` `rateLimit()` with a
persistent store (Postgres/Redis) before high-traffic production use.
