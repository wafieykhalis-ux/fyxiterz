/* ==========================================================================
   FYXITERZ — seed.js  (DEMO CATALOGUE)
   Bundled fallback catalogue used ONLY when Supabase is not configured.
   The canonical data lives in supabase/migrations/0004_seed.sql; this file
   mirrors it so the storefront is fully browsable in demo mode.
   ========================================================================== */

(function () {
  "use strict";

  var CATEGORIES = [
    { slug: "free-fire", name: "FREE FIRE", sort_order: 1 },
    { slug: "8-ball", name: "8 BALL", sort_order: 2 },
    { slug: "sertifikat-ios", name: "SERTIFIKAT IOS", sort_order: 3 },
    { slug: "cheat-tools", name: "Cheat Tools", sort_order: 4 },
    { slug: "games", name: "Games", sort_order: 5 },
  ];

  /* name | slug | category slug | MYR price | sales_count | flags */
  var RAW = [
    ["ABCD PROXY", "abcd-proxy", "free-fire", 5, 51, "B"],
    ["AIMHACK ANDROID + IOS", "aimhack-android--ios", "free-fire", 2, 91, "B"],
    ["ANGRY MODS ROOT", "angry-mods-root", "free-fire", 4, 11, ""],
    ["AURORA VN PC", "aurora-vn-pc", "free-fire", 20, 6, ""],
    ["BALAMOD APKMOD", "balamod-apkmod", "free-fire", 2, 41, ""],
    ["BR MODS APKMOD", "br-mods-apkmod", "free-fire", 6, 12, ""],
    ["BR MODS ROOT", "br-mods-root", "free-fire", 6, 8, ""],
    ["BR MODS SLIENT PC", "br-mods-slient-pc", "free-fire", 8, 2, ""],
    ["DRIP CLIENT 8 BALL", "drip-client-8-ball", "8-ball", 5, 0, ""],
    ["DRIP CLIENT APKMOD", "drip-client-apkmod", "free-fire", 8, 380, "BF"],
    ["DRIP CLIENT ROOT", "drip-client-root", "free-fire", 5, 4, ""],
    ["DRIP PROXY", "drip-proxy", "free-fire", 6, 134, "B"],
    ["DRIP WIRE ANDROID + IOS", "drip-wire", "free-fire", 8, 1068, "BF"],
    ["EXTERNAL KIWMODZ", "external-kiwmodz", "free-fire", 5, 1, ""],
    ["FLUORITE 8 BALL", "fluorite-8-ball", "8-ball", 8, 0, ""],
    ["FLUORITE IOS FF", "fluorite-ios-ff", "free-fire", 8, 0, ""],
    ["GBOX/ESIGN IOS", "gboxesign-ios", "sertifikat-ios", 16, 7, "F"],
    ["HAXXCKER PRO ROOT", "haxxcker-pro-root", "free-fire", 5, 0, ""],
    ["HG APKMOD FF", "hg-apkmod-ff", "free-fire", 5, 291, "BF"],
    ["HG APKMOD VERSI GLOBAL SAFE", "hg-apkmod-versi-global-safe", "free-fire", 6, 36, ""],
    ["HG CHEAT GLOBAL SAFE", "hg-cheat-global-safe", "free-fire", 6, 38, ""],
    ["HG PROXY", "hg-proxy-", "free-fire", 5, 100, "B"],
    ["HG PROXY PRIME", "hg-proxy-prime", "free-fire", 5, 7, ""],
    ["MIGUL IOS LITE FF", "migul-ios-lite-ff", "free-fire", 8, 3, ""],
    ["MIGUL PRO IOS FF", "migul-pro-ios-ff", "free-fire", 12, 12, ""],
    ["PARID CORE ROOT INJECTOR", "parid-core-root-injector", "free-fire", 8, 1, ""],
    ["PATO BLUE", "pato-blue", "free-fire", 6, 22, ""],
    ["PATO ORANGE", "pato-orange", "free-fire", 6, 26, ""],
    ["PATO REGEDIT NON ROOT", "pato-regedit-non-root", "free-fire", 5, 1, ""],
    ["PHANTOM ANDROID + iOS", "phantom-android--ios", "free-fire", 10, 415, "BF"],
    ["PLUGIN", "plugin-all-game", "cheat-tools", 4, 0, ""],
    ["PRIME HOOK APKMOD", "prime-hook-apkmod", "free-fire", 6, 21, ""],
    ["PRODUK OFFLINE", "fluorite-ios-mlbb", "cheat-tools", 8, 0, ""],
    ["PRODUK MATI", "produk-mati", "games", 0, 0, ""],
    ["PROXY FF IOS", "proxy-ff-ios", "free-fire", 5, 6, ""],
    ["REAPER X PRO", "reaper-x-pro-", "free-fire", 5, 0, ""],
    ["REZZXMODZ ANDROID + iOS", "rezzxmodz-android--ios", "free-fire", 10, 459, "BF"],
    ["SLIENT CHEAT PROXY TANPA ROOT", "slient-cheats-proxy", "free-fire", 6, 22, ""],
    ["SLIENT CHEATS", "slient-cheats", "free-fire", 2, 7, ""],
    ["SLIENT CHEATS APKMOD", "slient-cheats-apkmod", "games", 4, 1, ""],
    ["SLIENT CHEATS PROXY", "slient-cheats-proxy-2", "free-fire", 5, 0, ""],
    ["SLIENT CHEATS ROOT SAFE", "slient-cheats-root-safe", "free-fire", 5, 1, ""],
    ["SLIENTX ANDROID + IOS", "slientx-android--ios", "free-fire", 6, 8, ""],
    ["TrollModz Android + iOS", "trollmodz-android--ios", "free-fire", 6, 37, ""],
    ["ULTRA BLOODSTRIKE", "ultra-bloodstrike", "games", 8, 0, ""],
    ["ULTRA PLUGIN", "ultra-plugin-mlbb", "cheat-tools", 5, 1, ""],
    ["ULTRA PLUGIN 8 BALL", "ultra-plugin-8-ball", "8-ball", 6, 0, ""],
    ["VELORA EXTERNAL IOS", "velora-external-ios", "free-fire", 6, 1, ""],
    ["VIN PROXY IOS", "vin-proxy-ios", "free-fire", 6, 0, ""],
    ["XREG ANDROID + IOS", "xreg-android--ios", "free-fire", 6, 1, ""],
    ["XREG NON ROOT", "xreg-non-root", "free-fire", 5, 726, "B"],
  ];

  var PKG_NAMES = ["1 JAM", "3 JAM", "6 JAM", "12 JAM", "1 HARI", "3 HARI", "7 HARI", "30 HARI"];
  var PKG_MULT = [1, 1.6, 2.4, 4, 5, 8, 14, 30];

  function uuid(seed) {
    // Deterministic UUID-shaped id for demo mode (not cryptographic).
    var hex = "";
    var s = String(seed);
    for (var i = 0; hex.length < 32; i++) {
      hex += ((s.charCodeAt(i % s.length) * 2654435761) % 16).toString(16);
    }
    return (
      hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-a" +
      hex.slice(17, 20) + "-" + hex.slice(20, 32)
    );
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  var products = [];
  var variants = [];

  CATEGORIES.forEach(function (c) {
    c.id = uuid("cat-" + c.slug);
    c.is_active = true;
  });

  RAW.forEach(function (r, idx) {
    var name = r[0], slug = r[1], catSlug = r[2], price = r[3], sales = r[4], flags = r[5];
    var cat = CATEGORIES.filter(function (c) { return c.slug === catSlug; })[0];
    var isGame = catSlug === "free-fire" || catSlug === "8-ball";
    var pid = uuid("prod-" + slug);
    var product = {
      id: pid,
      sku: "FX-" + String(idx + 1).padStart(3, "0"),
      name: name,
      slug: slug,
      description: isGame
        ? "Cheat premium update mingguan, aman & terpercaya."
        : "Produk digital FYXITERZ, pemprosesan pantas.",
      long_description: "",
      image_url: null,
      category_id: cat.id,
      category: { slug: cat.slug, name: cat.name },
      regular_price: price,
      reseller_price: round2(price * 0.7),
      cost_price: round2(price * 0.4),
      stock: price === 0 ? 0 : 999,
      is_bestseller: flags.indexOf("B") >= 0,
      is_featured: flags.indexOf("F") >= 0,
      is_active: true,
      auto_delivery: price > 0,
      delivery_note: "",
      sales_count: sales,
      sort_order: idx,
      metadata: {},
    };
    products.push(product);

    if (price > 0) {
      PKG_NAMES.forEach(function (pn, i) {
        variants.push({
          id: uuid("var-" + slug + "-" + i),
          product_id: pid,
          name: pn,
          sku: product.sku + "-" + (i + 1),
          price: round2(price * PKG_MULT[i]),
          reseller_price: round2(price * PKG_MULT[i] * 0.7),
          stock: 999,
          duration_label: pn,
          is_active: true,
          sort_order: i,
        });
      });
    }
  });

  window.FYX_SEED = {
    categories: CATEGORIES,
    products: products,
    variants: variants,
    settings: {
      site_name: "FYXITERZ",
      currency: "MYR",
      locale: "ms",
      whatsapp: "60123456789",
      telegram: "fyxiterz",
      support_email: "support@fyxiterz.com",
      footer_tagline:
        "Platform top up & cheat game terpercaya. Proses instan, harga terbaik, pelayanan 24 jam.",
      payment_provider: "chip",
      payment_mode: "qr",
      payment_qr_url: "assets/img/payment-qr-placeholder.svg",
      payment_qr_payee: "FYXITERZ",
      payment_instructions: [
        "Buka aplikasi bank / e-wallet anda (Touch 'n Go eWallet, Maybank2u, CIMB, Boost, dll).",
        "Pilih DuitNow QR / Imbas QR, kemudian imbas kod di atas.",
        "Masukkan jumlah TEPAT seperti dipaparkan dan sahkan pembayaran.",
        "Hantar bukti pembayaran (screenshot) ke WhatsApp kami untuk pengesahan.",
      ],
    },
    discount_codes: [
      {
        code: "FYX10",
        description: "Diskaun 10% (min RM20)",
        discount_type: "percent",
        discount_value: 10,
        min_purchase: 20,
        max_uses: 500,
        used_count: 128,
        is_active: true,
      },
      {
        code: "FYX5",
        description: "Diskaun RM5 (min RM30)",
        discount_type: "fixed",
        discount_value: 5,
        min_purchase: 30,
        max_uses: 200,
        used_count: 42,
        is_active: true,
      },
    ],
  };
})();
