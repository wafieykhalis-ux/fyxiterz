/* ==========================================================================
   FYXITERZ — storefront.js
   Shared storefront UI: header, footer, mobile bottom nav, product cards,
   cart, toasts, formatted prices and generated product artwork.
   Loaded on every public page (not on the staff dashboards).
   ========================================================================== */

window.FYX_UI = (function () {
  "use strict";

  var C = window.FYX_CONFIG || {};
  var CART_KEY = "fyx_cart";

  /* ------------------------------------------------------------------ icons */
  var ICONS = {
    home: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
    pin: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    search: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
    cart: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6"/></svg>',
    grid: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    box: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>',
    check: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    plus: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6"/></svg>',
    user: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    chart: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    tag: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V4a1 1 0 011-1h8a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
    settings: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11h.1a2 2 0 110 4H21"/></svg>',
    logout: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    menu: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    shield: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    zap: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
    clock: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    wa: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    tg: '<svg width="%s" height="%s" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  };

  function icon(name, size) {
    size = size || 16;
    return (ICONS[name] || "").replace(/%s/g, size);
  }

  /* ---------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var v = Number(n) || 0;
    return (C.CURRENCY_SYMBOL || "RM") + " " + v.toFixed(2);
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  /* Generated product artwork (original FYXITERZ asset, no external images). */
  function productImage(p) {
    p = p || {};
    var seedStr = (p.name || "FYX") + (p.id || "");
    var h = 0;
    for (var i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) % 360;
    var h2 = (h + 40) % 360;
    var mono = (p.name || "FX")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) { return w[0]; })
      .join("")
      .toUpperCase() || "FX";
    var cat = ((p.category && p.category.name) || "FYXITERZ").toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + h + ',55%,22%)"/>' +
      '<stop offset="1" stop-color="hsl(' + h2 + ',60%,10%)"/>' +
      "</linearGradient>" +
      '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#F43F3F"/><stop offset="1" stop-color="#B91C1C"/></linearGradient></defs>' +
      '<rect width="400" height="400" fill="url(#g)"/>' +
      '<circle cx="330" cy="70" r="120" fill="hsl(' + h + ',60%,30%)" opacity="0.25"/>' +
      '<path d="M215 120 L150 215 L195 215 L175 290 L250 195 L205 195 Z" fill="url(#b)" opacity="0.95"/>' +
      '<text x="200" y="215" text-anchor="middle" font-family="Bebas Neue, Arial Narrow, Impact, sans-serif" ' +
      'font-size="96" fill="#ffffff" opacity="0.14" letter-spacing="4">' + esc(mono) + "</text>" +
      '<text x="24" y="368" font-family="Arial, sans-serif" font-size="18" font-weight="700" ' +
      'fill="#ffffff" opacity="0.55" letter-spacing="3">FYXITERZ</text>' +
      '<text x="24" y="48" font-family="Arial, sans-serif" font-size="16" font-weight="700" ' +
      'fill="#ffffff" opacity="0.5" letter-spacing="2">' + esc(cat) + "</text>" +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------------------------------------------------------------- header */
  function renderHeader(active) {
    var h = document.getElementById("site-header");
    if (!h) return;
    h.className = "site-header";
    h.innerHTML =
      '<div class="site-header__inner">' +
      '<div class="site-header__left">' +
      '<a class="brand" href="index.html"><img src="assets/img/logo.svg" alt="' + esc(C.SITE_NAME) + '"/></a>' +
      '<nav class="nav-links-desktop">' +
      navLink("index.html", "home", "Home", active === "home") +
      navLink("products.html", "box", "Semua Produk", active === "products") +
      navLink("track-order.html", "pin", "Track Pesanan", active === "track") +
      "</nav></div>" +
      '<div class="search-desktop">' +
      '<div class="search-field">' + icon("search", 15) +
      '<input id="nav-search" type="text" placeholder="Cari game..." autocomplete="off"/></div>' +
      "</div></div>" +
      '<div class="header-divider"></div>';

    var input = h.querySelector("#nav-search");
    if (input) {
      input.value = param("q") || "";
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          location.href = "products.html?q=" + encodeURIComponent(input.value.trim());
        }
      });
    }
    h.insertAdjacentHTML(
      "afterend",
      '<div class="search-mobile"><div class="search-field">' + icon("search", 15) +
        '<input id="nav-search-m" type="text" placeholder="Cari game..." autocomplete="off"/></div></div>'
    );
    var inputM = document.getElementById("nav-search-m");
    if (inputM) {
      inputM.value = param("q") || "";
      inputM.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          location.href = "products.html?q=" + encodeURIComponent(inputM.value.trim());
        }
      });
    }
  }

  function navLink(href, iconName, label, isActive) {
    return (
      '<a class="nav-link' + (isActive ? " is-active" : "") + '" href="' + href + '">' +
      icon(iconName, 14) + '<span>' + label + "</span></a>"
    );
  }

  function renderBottomNav(active) {
    var wrap = document.createElement("nav");
    wrap.className = "bottom-nav";
    wrap.innerHTML =
      bnav("index.html", "home", "Home", active === "home") +
      bnav("products.html", "grid", "Produk", active === "products") +
      bnav("track-order.html", "pin", "Pesanan", active === "track");
    document.body.appendChild(wrap);
  }

  function bnav(href, iconName, label, isActive) {
    return (
      '<a href="' + href + '" class="' + (isActive ? "is-active" : "") + '">' +
      icon(iconName, 20) + "<span>" + label + "</span></a>"
    );
  }

  /* ---------------------------------------------------------------- footer */
  function renderFooter() {
    var f = document.getElementById("site-footer");
    if (!f) return;
    f.className = "site-footer";
    f.innerHTML =
      '<div class="site-footer__inner">' +
      '<div class="footer-main">' +
      '<div class="footer-left">' +
      '<div class="footer-logo"><img src="assets/img/logo2.svg" alt="' + esc(C.SITE_NAME) + '"/></div>' +
      '<p class="footer-desc">' + esc(C.TAGLINE) + "</p>" +
      "</div>" +
      '<div class="footer-right">' +
      '<p class="footer-help">Butuh Bantuan?</p>' +
      '<div class="social-row">' +
      '<a href="https://wa.me/' + esc(C.WHATSAPP) + '" target="_blank" rel="noopener" aria-label="WhatsApp">' + icon("wa", 20) + "</a>" +
      '<a href="https://t.me/' + esc(C.TELEGRAM) + '" target="_blank" rel="noopener" aria-label="Telegram">' + icon("tg", 20) + "</a>" +
      "</div></div></div>" +
      '<div class="footer-links">' +
      '<a href="index.html">Home</a>' +
      '<a href="products.html">Semua Produk</a>' +
      '<a href="track-order.html">Track Pesanan</a>' +
      '<a href="mailto:' + esc(C.SUPPORT_EMAIL) + '">Bantuan Pelanggan</a>' +
      '<a href="staff-login.html">Portal Staf</a>' +
      "</div>" +
      '<div class="footer-divider"></div>' +
      '<div class="footer-copy">© ' + new Date().getFullYear() + " " + esc(C.SITE_NAME) + ". All rights reserved.</div>" +
      "</div>";
  }

  /* ------------------------------------------------------------ config note */
  function renderConfigBanner() {
    if (!window.FYX || !window.FYX.demo) return;
    var b = document.createElement("div");
    b.className = "config-banner";
    b.innerHTML =
      "Demo mode — pangkalan data Supabase belum dikonfigurasi. " +
      "Isi <b>SUPABASE_URL</b> &amp; <b>SUPABASE_ANON_KEY</b> dalam assets/js/config.js untuk pesanan &amp; pembayaran sebenar.";
    var header = document.getElementById("site-header");
    if (header && header.parentNode) header.parentNode.insertBefore(b, header.nextSibling);
    else document.body.insertBefore(b, document.body.firstChild);
  }

  /* ------------------------------------------------------------ product card */
  function card(p) {
    var soldOut = Number(p.stock) === 0;
    var img = p.image_url || productImage(p);
    var catName = (p.category && p.category.name) || "";
    return (
      '<a class="pcard' + (soldOut ? " is-sold-out" : "") + '" href="product.html?slug=' + encodeURIComponent(p.slug) + '">' +
      '<div class="pcard__media"><img src="' + img + '" alt="' + esc(p.name) + '" loading="lazy"/>' +
      (p.is_bestseller ? '<span class="pcard__flag">TERLARIS</span>' : "") +
      (catName ? '<span class="pcard__badge">' + esc(catName) + "</span>" : "") +
      (soldOut ? '<span class="pcard__soldout">Habis</span>' : "") +
      "</div>" +
      '<div class="pcard__body">' +
      '<h3 class="pcard__name">' + esc(p.name) + "</h3>" +
      '<div class="pcard__meta"><span class="cat">' + esc(catName) + "</span>" +
      (p.sales_count ? '<span>• ' + p.sales_count + " terjual</span>" : "") +
      "</div>" +
      '<div class="pcard__foot">' +
      '<span class="pcard__price"><small>' + esc(C.CURRENCY_SYMBOL || "RM") + "</small>" + money(p.regular_price).replace(/^[^\d]*/, "") + "</span>" +
      '<span class="pcard__cta">Lihat Paket →</span>' +
      "</div></div></a>"
    );
  }

  function skeletonCards(n) {
    var out = "";
    for (var i = 0; i < n; i++) out += '<div class="skeleton sk-card"></div>';
    return out;
  }

  function emptyState(msg) {
    return (
      '<div class="empty">' + icon("search", 36) + "<p>" + esc(msg) + "</p></div>"
    );
  }

  /* ------------------------------------------------------------- cart logic */
  function cart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("fyx:cart"));
  }
  function addToCart(item) {
    var items = cart();
    var found = items.filter(function (i) {
      return i.product_id === item.product_id && i.variant_id === item.variant_id;
    })[0];
    if (found) found.quantity += item.quantity || 1;
    else items.push(Object.assign({ quantity: 1 }, item));
    saveCart(items);
    toast("Ditambah ke bakul: " + item.product_name, "ok");
  }
  function removeFromCart(productId, variantId) {
    saveCart(cart().filter(function (i) {
      return !(i.product_id === productId && i.variant_id === variantId);
    }));
  }
  function setQty(productId, variantId, qty) {
    var items = cart().map(function (i) {
      if (i.product_id === productId && i.variant_id === variantId) i.quantity = Math.max(1, qty);
      return i;
    });
    saveCart(items);
  }
  function cartCount() {
    return cart().reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
  }
  function cartSubtotal() {
    return cart().reduce(function (s, i) { return s + i.unit_price * (i.quantity || 1); }, 0);
  }
  function clearCart() {
    saveCart([]);
  }

  /* ------------------------------------------------------------------- toast */
  function toast(msg, type) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    var t = document.createElement("div");
    t.className = "toast" + (type === "ok" ? " toast--ok" : type === "err" ? " toast--err" : "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 320);
    }, 3200);
  }

  /* -------------------------------------------------------------- bootstrap */
  function init(opts) {
    opts = opts || {};
    renderHeader(opts.active);
    renderFooter();
    renderBottomNav(opts.active);
    renderConfigBanner();
  }

  return {
    icon: icon,
    esc: esc,
    money: money,
    param: param,
    productImage: productImage,
    card: card,
    skeletonCards: skeletonCards,
    emptyState: emptyState,
    toast: toast,
    cart: {
      list: cart,
      add: addToCart,
      remove: removeFromCart,
      setQty: setQty,
      count: cartCount,
      subtotal: cartSubtotal,
      clear: clearCart,
    },
    init: init,
  };
})();
