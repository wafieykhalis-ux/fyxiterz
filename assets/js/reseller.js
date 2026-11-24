/* ==========================================================================
   FYXITERZ — reseller.js
   Reseller console: profile, dashboard, reseller price catalogue, purchasing,
   order history, transaction history, sales statistics, wallet balance.

   Reseller prices and wallet operations are always verified server-side
   (Edge Function reseller-purchase + RLS). Demo mode is labelled clearly and
   disables real writes / payments.
   ========================================================================== */

(function () {
  "use strict";
  var D = FYX_DASH;
  var C = window.FYX_CONFIG || {};

  var NAV = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard", group: "Utama" },
    { key: "catalog", label: "Beli Produk", icon: "box", group: "Jualan" },
    { key: "orders", label: "Pesanan", icon: "cart", group: "Jualan" },
    { key: "transactions", label: "Transaksi", icon: "card", group: "Kewangan" },
    { key: "wallet", label: "Wallet", icon: "wallet", group: "Kewangan" },
    { key: "profile", label: "Profil", icon: "users", group: "Akaun" },
  ];

  var sections = {};
  var cache = {};

  function opts(list, sel) {
    return list.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + v + "</option>"; }).join("");
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function err(e) { return '<div class="db-alert db-alert--error">' + D.esc(e.message || "Ralat memuatkan data.") + "</div>"; }
  function resellPrice(p) {
    if (p.reseller_price != null && p.reseller_price > 0) return Number(p.reseller_price);
    return Math.round(Number(p.regular_price || 0) * 0.7 * 100) / 100;
  }

  function loadDashboard() {
    if (cache.dash) return Promise.resolve(cache.dash);
    return FYX.reseller.getDashboard().then(function (d) { cache.dash = d; return d; });
  }

  /* --------------------------------------------------------------- dashboard */
  sections.dashboard = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    Promise.all([loadDashboard(), D.auth.profile()]).then(function (res) {
      var s = res[0], me = res[1] || {};
      var wallet = s.wallet || { balance: 0, currency: "MYR" };
      var cards =
        D.statCard("Jumlah Pesanan", s.total_orders || 0, "cart") +
        D.statCard("Jumlah Jualan", D.money(s.total_sales || 0), "chart", "stat--accent") +
        D.statCard("Baki Wallet", D.money(wallet.balance || 0), "wallet") +
        D.statCard("Harga Reseller", "Diskaun " + (s.discount_percent || C.RESELLER_DISCOUNT || 30) + "%", "tag");

      var cols = [
        { label: "Kod", render: function (r) { return '<strong class="mono">' + D.esc(r.order_code) + "</strong>"; } },
        { label: "Pelanggan", render: function (r) { return D.esc(r.customer_name || r.customer_email); } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.total) + "</strong>"; }, nowrap: true },
        { label: "Status", render: function (r) { return D.statusPill(r.status); } },
        { label: "Tarikh", render: function (r) { return D.date(r.created_at); }, nowrap: true },
      ];

      el.innerHTML +=
        '<div class="stat-grid">' + cards + "</div>" +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Selamat datang, ' + D.esc(me.full_name || me.email || "Reseller") + '</div>' +
        '<button class="btn btn--primary btn--sm" data-goto="catalog">' + D.icon("plus") + " Beli Produk</button></div>" +
        '<div class="panel__body panel__body--flush">' +
        (s.orders && s.orders.length ? D.table(cols, s.orders.slice(0, 10), "Tiada pesanan.") : '<div class="tbl-empty">Belum ada pesanan. Mulakan dengan membeli produk.</div>') +
        "</div></div>";

      el.querySelectorAll("[data-goto]").forEach(function (b) {
        b.addEventListener("click", function () { D.go(b.getAttribute("data-goto")); });
      });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ----------------------------------------------------------------- catalog */
  sections.catalog = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    FYX.data.getProducts({ limit: 500 }).then(function (products) {
      cache.products = products;
      var cols = [
        { label: "Produk", render: function (r) { return "<strong>" + D.esc(r.name) + "</strong>"; } },
        { label: "Kategori", render: function (r) { return D.esc((r.category && r.category.name) || "—"); } },
        { label: "Harga Awam", render: function (r) { return '<span style="color:var(--db-faint);text-decoration:line-through">' + D.money(r.regular_price) + "</span>"; }, nowrap: true },
        { label: "Harga Reseller", render: function (r) { return '<strong style="color:var(--db-accent)">' + D.money(resellPrice(r)) + "</strong>"; }, nowrap: true },
        { label: "Stok", render: function (r) { return r.stock > 0 ? r.stock : '<span class="pill pill--expired">Habis</span>'; }, nowrap: true },
        { label: "", render: function (r) { return '<button class="btn btn--primary btn--sm" data-buy="' + r.id + '"' + (r.stock <= 0 ? " disabled" : "") + ">Beli</button>"; }, nowrap: true },
      ];
      el.innerHTML +=
        '<div class="panel"><div class="panel__head"><div class="panel__title">Katalog Harga Reseller</div></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(cols, products, "Tiada produk.") + "</div></div>";
      el.querySelectorAll("[data-buy]").forEach(function (b) {
        b.addEventListener("click", function () { purchaseModal(b.getAttribute("data-buy")); });
      });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  function purchaseModal(id) {
    var p = (cache.products || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var walletBal = (cache.dash && cache.dash.wallet && cache.dash.wallet.balance) || 0;
    D.openModal("Beli — " + p.name, D.spinner());
    FYX.data.getVariants(p.id).then(function (variants) {
      var varOpts = variants.map(function (v) {
        var price = v.reseller_price || resellPrice({ regular_price: v.price });
        return '<option value="' + v.id + '">' + D.esc(v.name) + " — " + D.money(price) + "</option>";
      }).join("");
      var basePrice = variants.length ? (variants[0].reseller_price || resellPrice({ regular_price: variants[0].price })) : resellPrice(p);
      var body =
        '<div class="summary-row"><span>Harga Awam</span><b>' + D.money(p.regular_price) + "</b></div>" +
        (variants.length
          ? '<div class="form-row"><div><label class="f-label">Varian</label><select class="f-select" id="rp-variant">' + varOpts + "</select></div></div>"
          : "") +
        '<div class="form-row form-row--2">' +
        '<div><label class="f-label">Kuantiti</label><input class="f-input" id="rp-qty" type="number" min="1" value="1"/></div>' +
        '<div><label class="f-label">Jumlah (Harga Reseller)</label><input class="f-input" id="rp-total" value="' + D.money(basePrice) + '" readonly/></div></div>' +
        '<div class="form-row form-row--2">' +
        '<div><label class="f-label">Nama Pelanggan</label><input class="f-input" id="rp-name"/></div>' +
        '<div><label class="f-label">Email Pelanggan</label><input class="f-input" id="rp-email" type="email"/></div></div>' +
        '<div class="form-row form-row--3">' +
        '<div><label class="f-label">WhatsApp *</label><input class="f-input" id="rp-wa" placeholder="60123456789"/></div>' +
        '<div><label class="f-label">Game ID</label><input class="f-input" id="rp-gid"/></div>' +
        '<div><label class="f-label">Server ID</label><input class="f-input" id="rp-sid"/></div></div>' +
        '<label class="f-check"><input type="checkbox" id="rp-wallet"/> Bayar dengan Wallet (baki ' + D.money(walletBal) + ")</label>" +
        '<div class="db-alert db-alert--info">Harga reseller disahkan di pelayan semasa pembelian. Wallet akan didebitkan jika dipilih.</div>' +
        '<div class="btn-row"><button class="btn btn--primary" id="rp-submit">Sahkan Pembelian</button></div>';
      D.openModal("Beli — " + p.name, body);

      function recalc() {
        var qty = Math.max(1, parseInt(val("rp-qty"), 10) || 1);
        var price = basePrice;
        var sel = document.getElementById("rp-variant");
        if (sel) {
          var v = variants.filter(function (x) { return x.id === sel.value; })[0];
          if (v) price = v.reseller_price || resellPrice({ regular_price: v.price });
        }
        document.getElementById("rp-total").value = D.money(price * qty);
      }
      document.getElementById("rp-qty").addEventListener("input", recalc);
      var vsel = document.getElementById("rp-variant");
      if (vsel) vsel.addEventListener("change", recalc);

      document.getElementById("rp-submit").addEventListener("click", function () {
        var name = val("rp-name"), email = val("rp-email"), wa = val("rp-wa");
        if (!name) return D.toast("Nama pelanggan diperlukan.", "err");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return D.toast("Email pelanggan tidak sah.", "err");
        if (!/^[0-9+\-\s]{8,}$/.test(wa)) return D.toast("Nombor WhatsApp diperlukan.", "err");
        var payload = {
          items: [{
            product_id: p.id,
            variant_id: vsel ? vsel.value : null,
            quantity: Math.max(1, parseInt(val("rp-qty"), 10) || 1),
          }],
          customer: {
            name: name, email: email,
            whatsapp: wa,
            game_id: val("rp-gid") || null,
            server_id: val("rp-sid") || null,
          },
          use_wallet: !!document.getElementById("rp-wallet").checked,
        };
        FYX.reseller.purchase(payload).then(function (r) {
          D.toast("Pembelian berjaya. Kod: " + (r.order_code || "—"), "ok");
          D.closeModal();
          cache.dash = null;
          D.go("orders");
        }).catch(function (e) { D.toast(e.message, "err"); });
      });
    }).catch(function (e) { D.toast(e.message, "err"); });
  }

  /* ------------------------------------------------------------------ orders */
  sections.orders = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    loadDashboard().then(function (s) {
      var cols = [
        { label: "Kod", render: function (r) { return '<strong class="mono">' + D.esc(r.order_code) + "</strong>"; } },
        { label: "Pelanggan", render: function (r) { return D.esc(r.customer_name) + '<br/><span style="font-size:11px;color:var(--db-faint)">' + D.esc(r.customer_email) + "</span>"; } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.total) + "</strong>"; }, nowrap: true },
        { label: "Bayaran", render: function (r) { return D.statusPill(r.payment_status); } },
        { label: "Status", render: function (r) { return D.statusPill(r.status); } },
        { label: "Tarikh", render: function (r) { return D.dateTime(r.created_at); }, nowrap: true },
      ];
      var orders = s.orders || [];
      el.innerHTML += '<div class="panel"><div class="panel__head"><div class="panel__title">Sejarah Pesanan (' + orders.length + ')</div></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(cols, orders, "Tiada pesanan.") + "</div></div>";
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ------------------------------------------------------------ transactions */
  sections.transactions = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    loadDashboard().then(function (s) {
      var rows = s.transactions || [];
      var cols = [
        { label: "Tarikh", render: function (r) { return D.dateTime(r.created_at); }, nowrap: true },
        { label: "Jenis", render: function (r) { return '<span class="pill">' + D.esc(r.type || "—") + "</span>"; } },
        { label: "Rujukan", render: function (r) { return '<span class="mono">' + D.esc(r.reference || "—") + "</span>"; } },
        { label: "Keterangan", render: function (r) { return D.esc(r.description || "—"); } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.amount) + "</strong>"; }, nowrap: true },
      ];
      el.innerHTML += '<div class="panel"><div class="panel__head"><div class="panel__title">Transaksi</div></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(cols, rows, "Tiada transaksi.") + "</div></div>";
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ------------------------------------------------------------------ wallet */
  sections.wallet = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    loadDashboard().then(function (s) {
      var w = s.wallet || { balance: 0, currency: "MYR" };
      var cards = D.statCard("Baki Semasa", D.money(w.balance || 0), "wallet", "stat--accent") +
        D.statCard("Mata Wang", w.currency || "MYR", "card");
      var cols = [
        { label: "Tarikh", render: function (r) { return D.dateTime(r.created_at); }, nowrap: true },
        { label: "Jenis", render: function (r) { return '<span class="pill">' + D.esc(r.type) + "</span>"; } },
        { label: "Keterangan", render: function (r) { return D.esc(r.description || "—"); } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.amount) + "</strong>"; }, nowrap: true },
        { label: "Baki Selepas", render: function (r) { return D.money(r.balance_after); }, nowrap: true },
      ];
      el.innerHTML +=
        '<div class="stat-grid">' + cards + "</div>" +
        '<div class="db-alert db-alert--info">Fungsi wallet diaktifkan oleh Owner. Semua transaksi wallet disahkan di pelayan.</div>' +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Transaksi Wallet</div></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(cols, s.wallet_transactions || [], "Tiada transaksi wallet.") + "</div></div>";
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ----------------------------------------------------------------- profile */
  sections.profile = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    D.auth.profile().then(function (me) {
      me = me || {};
      var body =
        '<div class="panel"><div class="panel__head"><div class="panel__title">Profil Reseller</div></div>' +
        '<div class="panel__body">' +
        '<div class="form-row form-row--2">' +
        '<div><label class="f-label">Nama Penuh</label><input class="f-input" id="pr-name" value="' + D.esc(me.full_name || "") + '" readonly/></div>' +
        '<div><label class="f-label">Email</label><input class="f-input" id="pr-email" value="' + D.esc(me.email || "") + '" readonly/></div></div>' +
        '<div class="form-row form-row--2">' +
        '<div><label class="f-label">Peranan</label><input class="f-input" value="' + D.esc(me.role || "reseller") + '" readonly/></div>' +
        '<div><label class="f-label">Status</label><input class="f-input" value="' + (me.is_active === false ? "Tidak Aktif" : "Aktif") + '" readonly/></div></div>' +
        '<div class="db-alert db-alert--info">Untuk mengemas kini maklumat perniagaan, hubungi Owner.</div>' +
        "</div></div>";
      el.innerHTML += body;
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ------------------------------------------------------------------ boot */
  D.guard(["reseller"]).then(function (profile) {
    D.setProfile(profile);
    D.mountShell({ nav: NAV, sections: sections, default: "dashboard" });
  }).catch(function () { /* redirected by guard */ });
})();
