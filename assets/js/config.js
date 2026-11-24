/* ==========================================================================
   FYXITERZ — config.js
   Runtime configuration loaded before every other script.

   Fill in SUPABASE_URL and SUPABASE_ANON_KEY with your project values
   (Supabase dashboard -> Project Settings -> API). The anon key is a PUBLIC
   key and is safe to ship to the browser; NEVER put the service_role key here.

   If these two values are left empty the storefront runs in DEMO MODE using
   the bundled catalogue (assets/data/seed.js) plus localStorage orders, so the
   site stays fully browsable on GitHub Pages before the backend is wired up.
   ========================================================================== */

window.FYX_CONFIG = {
  /* --- Supabase (required for real orders / auth / payments) --- */
  SUPABASE_URL: "https://upkyhuxacuycscywfsrh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_hOLvnNVnra7QbnC2xJdopg_6h4ODRR5",

  /* --- Branding --- */
  SITE_NAME: "FYXITERZ",
  TAGLINE: "Platform top up & cheat game terpercaya. Proses instan, harga terbaik, pelayanan 24 jam.",

  /* --- Localisation --- */
  CURRENCY: "MYR", // Malaysian Ringgit
  CURRENCY_SYMBOL: "RM",
  LOCALE: "ms",

  /* --- Support channels --- */
  WHATSAPP: "60123456789", // digits only, international format
  TELEGRAM: "fyxiterz",
  SUPPORT_EMAIL: "support@fyxiterz.com",

  /* --- Commerce --- */
  // CHIP is the default because it supports Touch 'n Go eWallet natively
  // (channel "tng_ewallet"). Must match the Edge Function env PAYMENT_PROVIDER.
  PAYMENT_PROVIDER: "chip", // "chip" | "toyyibpay"

  // Payment channels offered at checkout. `providers` lists which gateway
  // supports each channel; only channels supported by PAYMENT_PROVIDER show.
  PAYMENT_METHODS: [
    { id: "tng_ewallet", label: "Touch 'n Go eWallet", sub: "Bayar melalui aplikasi TNG eWallet.", providers: ["chip"] },
    { id: "fpx", label: "FPX Online Banking", sub: "Maybank2u, CIMB Clicks, Public Bank, RHB, dll.", providers: ["chip", "toyyibpay"] },
    { id: "card", label: "Kad Kredit / Debit", sub: "Visa & Mastercard.", providers: ["chip", "toyyibpay"] },
    { id: "duitnow_qr", label: "DuitNow QR", sub: "Imbas dengan mana-mana aplikasi bank / e-wallet.", providers: ["chip"] },
  ],
  DEFAULT_PAYMENT_METHOD: "tng_ewallet",

  // Payment mode:
  //   "qr"      -> customer transfers to YOUR OWN QR and staff verifies manually.
  //                No gateway needed; money lands straight in your account.
  //   "gateway" -> automated online payment via PAYMENT_PROVIDER (CHIP/ToyyibPay).
  PAYMENT_MODE: "qr",

  // Shown when PAYMENT_MODE === "qr". Replace QR_IMAGE with YOUR OWN DuitNow /
  // bank QR (save it as e.g. assets/img/my-qr.png). At runtime these can be
  // overridden from the database `website_settings` keys:
  //   payment_qr_url, payment_qr_payee, payment_instructions
  QR_PAYMENT: {
    QR_IMAGE: "assets/img/payment-qr-placeholder.svg",
    PAYEE: "FYXITERZ",
    INSTRUCTIONS: [
      "Buka aplikasi bank / e-wallet anda (Touch 'n Go eWallet, Maybank2u, CIMB, Boost, dll).",
      "Pilih DuitNow QR / Imbas QR, kemudian imbas kod di atas.",
      "Masukkan jumlah TEPAT seperti dipaparkan dan sahkan pembayaran.",
      "Hantar bukti pembayaran (screenshot) ke WhatsApp kami untuk pengesahan.",
    ],
  },
  LOW_STOCK_THRESHOLD: 10,
  RESELLER_DISCOUNT: 30, // default reseller discount (%) shown when no override exists
  STORAGE_BUCKET: "product-images", // Supabase Storage bucket for product uploads
  FREE_SHIPPING_NOTE: "Produk digital — dihantar ke email secara automatik.",
};

/* Convenience flag used across the app. */
window.FYX_CONFIGURED = Boolean(
  window.FYX_CONFIG.SUPABASE_URL &&
    window.FYX_CONFIG.SUPABASE_ANON_KEY &&
    !/YOUR_|xxxx/i.test(window.FYX_CONFIG.SUPABASE_URL)
);
