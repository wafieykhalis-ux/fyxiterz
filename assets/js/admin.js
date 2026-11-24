/* ==========================================================================
   FYXITERZ — admin.js
   Admin console: dashboard, products (add/edit/delete/upload/stock),
   categories, orders (view/process/update status), customers, sales reports.

   Admin has NO owner-only permissions: staff accounts, reseller management,
   discount codes, transactions, audit logs and website settings are not
   exposed here — and are additionally blocked by backend RLS + Edge Functions.
   ========================================================================== */

(function () {
  "use strict";
  var D = FYX_DASH;
  var S = FYX.staff;
  var C = window.FYX_CONFIG || {};

  var NAV = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard", group: "Utama" },
    { key: "orders", label: "Pesanan", icon: "cart", group: "Operasi" },
    { key: "products", label: "Produk", icon: "box", group: "Operasi" },
    { key: "categories", label: "Kategori", icon: "grid", group: "Operasi" },
    { key: "customers", label: "Pelanggan", icon: "users", group: "Operasi" },
    { key: "reports", label: "Laporan Jualan", icon: "chart", group: "Analitik" },
  ];

  var sections = {};
  var cache = {};

  function opts(list, sel) {
    return list.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + v + "</option>"; }).join("");
  }
  function check(id, label, on) {
    return '<label class="f-check"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "/> " + label + "</label>";
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function chk(id) { var e = document.getElementById(id); return e ? e.checked : false; }
  function slugify(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function err(e) { return '<div class="db-alert db-alert--error">' + D.esc(e.message || "Ralat memuatkan data.") + "</div>"; }
  function reload(el, key) { el.innerHTML = ""; sections[key](el); }

  /* --------------------------------------------------- image upload helper */
  // Uploads to Supabase Storage when configured, otherwise previews locally.
  function uploadImage(file) {
    if (!FYX.configured) {
      return new Promise(function (resolve) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { resolve(""); };
        r.readAsDataURL(file);
      });
    }
    var bucket = C.STORAGE_BUCKET || "product-images";
    var path = "products/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    var session = null;
    try { session = JSON.parse(localStorage.getItem("fyx_session") || "null"); } catch (e) {}
    var token = (session && session.access_token) || C.SUPABASE_ANON_KEY;
    return fetch(FYX.base + "/storage/v1/object/" + bucket + "/" + path, {
      method: "POST",
      headers: {
        apikey: C.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        "x-upsert": "true",
      },
      body: file,
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error("Muat naik gagal: " + t); });
        return FYX.base + "/storage/v1/object/public/" + bucket + "/" + path;
      });
  }

  /* --------------------------------------------------------------- dashboard */
  sections.dashboard = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    S.getStats().then(function (s) {
      var cards =
        D.statCard("Jumlah Jualan", D.money(s.total_sales), "card", "stat--accent") +
        D.statCard("Jumlah Pesanan", s.total_orders, "cart") +
        D.statCard("Pesanan Tertunda", s.pending_orders, "list") +
        D.statCard("Pesanan Selesai", s.completed_orders, "check") +
        D.statCard("Produk", s.total_products, "box") +
        D.statCard("Stok Rendah", s.low_stock_products, "list");

      var recentCols = [
        { label: "Kod", render: function (r) { return '<strong class="mono">' + D.esc(r.order_code) + "</strong>"; } },
        { label: "Pelanggan", render: function (r) { return D.esc(r.customer_name || r.customer_email); } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.total) + "</strong>"; }, nowrap: true },
        { label: "Status", render: function (r) { return D.statusPill(r.status); } },
        { label: "Tarikh", render: function (r) { return D.date(r.created_at); }, nowrap: true },
      ];

      var lowStock = (s.low_stock_list || []).map(function (p) {
        return '<div class="summary-row"><span>' + D.esc(p.name) + '</span><b class="text-warn" style="color:#f59e0b">' + p.stock + " unit</b></div>";
      }).join("");

      el.innerHTML +=
        '<div class="stat-grid">' + cards + "</div>" +
        '<div class="grid-2">' +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Pesanan Terkini</div>' +
        '<button class="btn btn--ghost btn--sm" data-goto="orders">Lihat semua</button></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(recentCols, s.recent_orders, "Tiada pesanan lagi.") + "</div></div>" +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Amaran Stok Rendah</div>' +
        '<button class="btn btn--ghost btn--sm" data-goto="products">Urus stok</button></div>' +
        '<div class="panel__body">' + (lowStock || '<div class="tbl-empty">Semua stok mencukupi.</div>') + "</div></div>" +
        "</div>";

      el.querySelectorAll("[data-goto]").forEach(function (b) {
        b.addEventListener("click", function () { D.go(b.getAttribute("data-goto")); });
      });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ----------------------------------------------------------------- orders */
  sections.orders = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    S.getOrders().then(function (orders) {
      cache.orders = orders;
      var cols = [
        { label: "Kod", render: function (r) { return '<strong class="mono">' + D.esc(r.order_code) + "</strong>"; } },
        { label: "Pelanggan", render: function (r) { return D.esc(r.customer_name) + '<br/><span style="font-size:11px;color:var(--db-faint)">' + D.esc(r.customer_email) + "</span>"; } },
        { label: "Jumlah", render: function (r) { return "<strong>" + D.money(r.total) + "</strong>"; }, nowrap: true },
        { label: "Bayaran", render: function (r) { return D.statusPill(r.payment_status); } },
        { label: "Status", render: function (r) { return D.statusPill(r.status); } },
        { label: "Tarikh", render: function (r) { return D.dateTime(r.created_at); }, nowrap: true },
        { label: "", render: function (r) { return '<button class="btn btn--ghost btn--sm" data-order="' + r.id + '">Urus</button>'; }, nowrap: true },
      ];
      el.innerHTML +=
        '<div class="panel"><div class="panel__head"><div class="panel__title">Semua Pesanan</div>' +
        '<button class="btn btn--ghost btn--sm" data-refresh="orders">' + D.icon("refresh") + " Muat semula</button></div>" +
        '<div class="panel__body panel__body--flush">' + D.table(cols, orders, "Tiada pesanan.") + "</div></div>";

      el.querySelectorAll("[data-order]").forEach(function (b) {
        b.addEventListener("click", function () { orderModal(b.getAttribute("data-order")); });
      });
      el.querySelector('[data-refresh="orders"]').addEventListener("click", function () { reload(el, "orders"); });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  function orderModal(id) {
    var o = (cache.orders || []).filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var items = (o.order_items || o.items || []);
    var itemRows = items.map(function (i) {
      return '<div class="summary-row"><span>' + D.esc(i.product_name) + (i.variant_name ? " — " + D.esc(i.variant_name) : "") + " x" + i.quantity + "</span><b>" + D.money(i.subtotal) + "</b></div>";
    }).join("");
    var deliveryInputs = items.map(function (i, idx) {
      return '<div style="margin-top:12px"><label class="f-label">' + D.esc(i.product_name) + (i.variant_name ? " — " + D.esc(i.variant_name) : "") + '</label>' +
        '<textarea class="f-textarea" id="dlv-' + idx + '" rows="3" placeholder="Tampal key / kandungan sebenar di sini..."></textarea></div>';
    }).join("");
    var body =
      '<div class="summary-row"><span>Pelanggan</span><b>' + D.esc(o.customer_name) + "</b></div>" +
      '<div class="summary-row"><span>Email</span><b>' + D.esc(o.customer_email) + "</b></div>" +
      '<div class="summary-row"><span>WhatsApp</span><b>' + D.esc(o.customer_whatsapp || "—") + "</b></div>" +
      (o.game_id ? '<div class="summary-row"><span>Game ID</span><b>' + D.esc(o.game_id) + "</b></div>" : "") +
      (o.server_id ? '<div class="summary-row"><span>Server ID</span><b>' + D.esc(o.server_id) + "</b></div>" : "") +
      '<div class="card mt-16" style="background:var(--db-bg)"><div class="card__title">Item</div>' + itemRows + "</div>" +
      '<div class="summary-row summary-row--total"><span>Jumlah</span><b>' + D.money(o.total) + "</b></div>" +
      '<div class="form-row form-row--2 mt-16">' +
      '<div><label class="f-label">Status Pesanan</label><select class="f-select" id="om-status">' +
      opts(["pending", "paid", "processing", "completed", "cancelled", "expired", "failed"], o.status) + "</select></div>" +
      '<div><label class="f-label">Status Bayaran</label><select class="f-select" id="om-payment">' +
      opts(["unpaid", "pending", "paid", "failed", "expired", "refunded"], o.payment_status) + "</select></div>" +
      "</div>" +
      '<div class="card mt-16"><div class="card__title">Hantar Key ke Pembeli</div>' +
      '<div class="text-faint" style="font-size:12px;margin-bottom:4px">Tampal key sebenar dari stok/pembekal untuk setiap item. Pembeli akan nampak key ini di halaman jejak pesanan.</div>' +
      deliveryInputs +
      '<button class="btn btn--primary mt-12" id="om-deliver">Hantar Key & Selesaikan Pesanan</button></div>' +
      '<div class="btn-row mt-16"><button class="btn btn--ghost" id="om-save">Simpan Status Sahaja</button></div>';
    D.openModal("Pesanan " + o.order_code, body);
    document.getElementById("om-save").addEventListener("click", function () {
      S.updateOrder(o.id, {
        status: document.getElementById("om-status").value,
        payment_status: document.getElementById("om-payment").value,
      }).then(function () { D.toast("Pesanan dikemas kini.", "ok"); D.closeModal(); D.go("orders"); })
        .catch(function (e) { D.toast(e.message, "err"); });
    });
    document.getElementById("om-deliver").addEventListener("click", function () {
      if (!FYX.configured) return D.toast("Demo mode: penghantaran memerlukan backend.", "err");
      var dlvItems = items.map(function (i, idx) {
        return { order_item_id: i.id, product_name: i.product_name, delivered_content: (document.getElementById("dlv-" + idx) || {}).value };
      });
      S.saveDeliveries(o.id, dlvItems, o.customer_email)
        .then(function () {
          return S.updateOrder(o.id, { status: "completed", payment_status: "paid" });
        })
        .then(function () { D.toast("Key dihantar ke pembeli. Pesanan selesai.", "ok"); D.closeModal(); D.go("orders"); })
        .catch(function (e) { D.toast(e.message, "err"); });
    });
  }

  /* --------------------------------------------------------------- products */
  sections.products = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    Promise.all([S.getProducts(), S.getCategories()]).then(function (res) {
      var products = res[0], cats = res[1];
      cache.products = products; cache.cats = cats;
      var cols = [
        { label: "Nama", render: function (r) { return '<strong>' + D.esc(r.name) + "</strong>"; } },
        { label: "Kategori", render: function (r) { return D.esc((r.category && r.category.name) || "—"); } },
        { label: "Harga", render: function (r) { return D.money(r.regular_price); }, nowrap: true },
        { label: "Stok", render: function (r) {
            var cls = r.stock <= 0 ? "pill--expired" : (r.stock <= (C.LOW_STOCK_THRESHOLD || 10) ? "pill--pending" : "pill--active");
            return '<span class="pill ' + cls + '">' + r.stock + "</span>";
          }, nowrap: true },
        { label: "Status", render: function (r) { return (r.is_bestseller ? '<span class="pill pill--active">Laris</span> ' : "") + (r.is_active === false ? '<span class="pill pill--suspended">Off</span>' : '<span class="pill">Aktif</span>'); } },
        { label: "", render: function (r) { return '<button class="btn btn--ghost btn--sm" data-edit="' + r.id + '">Edit</button> <button class="btn btn--danger btn--sm" data-del="' + r.id + '">Hapus</button>'; }, nowrap: true },
      ];
      el.innerHTML +=
        '<div class="panel"><div class="panel__head"><div class="panel__title">Produk (' + products.length + ')</div>' +
        '<button class="btn btn--primary btn--sm" id="add-product">' + D.icon("plus") + " Tambah Produk</button></div>" +
        '<div class="panel__body panel__body--flush">' + D.table(cols, products, "Tiada produk.") + "</div></div>";

      document.getElementById("add-product").addEventListener("click", function () { productModal(null); });
      el.querySelectorAll("[data-edit]").forEach(function (b) {
        b.addEventListener("click", function () { productModal(b.getAttribute("data-edit")); });
      });
      el.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Hapus produk ini?")) return;
          S.deleteProduct(b.getAttribute("data-del")).then(function () { D.toast("Produk dihapus.", "ok"); reload(el, "products"); })
            .catch(function (e) { D.toast(e.message, "err"); });
        });
      });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  function productModal(id) {
    var p = id ? (cache.products || []).filter(function (x) { return x.id === id; })[0] : {};
    p = p || {};
    var catOpts = (cache.cats || []).map(function (c) {
      return '<option value="' + c.id + '"' + (p.category_id === c.id ? " selected" : "") + ">" + D.esc(c.name) + "</option>";
    }).join("");
    var body =
      '<div class="form-row form-row--2">' +
      '<div><label class="f-label">Nama</label><input class="f-input" id="p-name" value="' + D.esc(p.name || "") + '"/></div>' +
      '<div><label class="f-label">Slug</label><input class="f-input" id="p-slug" value="' + D.esc(p.slug || "") + '"/></div></div>' +
      '<div class="form-row form-row--2">' +
      '<div><label class="f-label">Kategori</label><select class="f-select" id="p-cat">' + catOpts + "</select></div>" +
      '<div><label class="f-label">SKU</label><input class="f-input" id="p-sku" value="' + D.esc(p.sku || "") + '"/></div></div>' +
      '<div class="form-row form-row--3">' +
      '<div><label class="f-label">Harga (RM)</label><input class="f-input" id="p-price" type="number" step="0.01" value="' + (p.regular_price || 0) + '"/></div>' +
      '<div><label class="f-label">Harga Reseller</label><input class="f-input" id="p-rprice" type="number" step="0.01" value="' + (p.reseller_price || "") + '"/></div>' +
      '<div><label class="f-label">Stok</label><input class="f-input" id="p-stock" type="number" value="' + (p.stock == null ? 999 : p.stock) + '"/></div></div>' +
      '<div class="form-row"><div><label class="f-label">Deskripsi</label><textarea class="f-textarea" id="p-desc">' + D.esc(p.description || "") + "</textarea></div></div>" +
      '<div class="form-row"><div><label class="f-label">Imej Produk</label>' +
      '<div style="display:flex;gap:12px;align-items:center">' +
      '<img id="p-preview" src="' + D.esc(p.image_url || "") + '" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--db-line);background:#0b1220"/>' +
      '<input class="f-input" id="p-image" value="' + D.esc(p.image_url || "") + '" placeholder="URL imej atau muat naik"/>' +
      '<input type="file" id="p-file" accept="image/*" style="display:none"/>' +
      '<button class="btn btn--ghost btn--sm" id="p-upload" type="button">Muat Naik</button></div></div>' +
      '<div class="form-row form-row--3">' +
      check("p-best", "Bestseller", p.is_bestseller) +
      check("p-feat", "Featured", p.is_featured) +
      check("p-active", "Aktif", p.is_active !== false) + "</div>" +
      '<div class="form-row form-row--2">' +
      check("p-auto", "Auto Delivery", p.auto_delivery !== false) +
      '<div><label class="f-label">Nota Penghantaran</label><input class="f-input" id="p-note" value="' + D.esc(p.delivery_note || "") + '"/></div></div>' +
      '<div class="btn-row mt-16"><button class="btn btn--primary" id="p-save">Simpan</button></div>';
    D.openModal(id ? "Edit Produk" : "Tambah Produk", body);

    var fileInput = document.getElementById("p-file");
    document.getElementById("p-upload").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      D.toast("Memuat naik imej...");
      uploadImage(f).then(function (url) {
        document.getElementById("p-image").value = url;
        document.getElementById("p-preview").src = url;
        D.toast("Imej dimuat naik.", "ok");
      }).catch(function (e) { D.toast(e.message, "err"); });
    });
    document.getElementById("p-image").addEventListener("input", function () {
      document.getElementById("p-preview").src = this.value;
    });

    document.getElementById("p-save").addEventListener("click", function () {
      var payload = {
        id: id || undefined,
        name: val("p-name"), slug: val("p-slug") || slugify(val("p-name")),
        category_id: val("p-cat") || null, sku: val("p-sku") || null,
        regular_price: Number(val("p-price")), reseller_price: val("p-rprice") ? Number(val("p-rprice")) : null,
        stock: parseInt(val("p-stock"), 10) || 0, description: val("p-desc"),
        image_url: val("p-image") || null,
        is_bestseller: chk("p-best"), is_featured: chk("p-feat"), is_active: chk("p-active"),
        auto_delivery: chk("p-auto"), delivery_note: val("p-note"),
      };
      if (!payload.name) return D.toast("Nama diperlukan.", "err");
      S.saveProduct(payload).then(function () { D.toast("Produk disimpan.", "ok"); D.closeModal(); D.go("products"); })
        .catch(function (e) { D.toast(e.message, "err"); });
    });
  }

  /* ------------------------------------------------------------- categories */
  sections.categories = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    S.getCategories().then(function (cats) {
      cache.cats = cats;
      var cols = [
        { label: "Nama", render: function (r) { return "<strong>" + D.esc(r.name) + "</strong>"; } },
        { label: "Slug", render: function (r) { return '<span class="mono">' + D.esc(r.slug) + "</span>"; } },
        { label: "Susunan", render: function (r) { return r.sort_order || 0; }, nowrap: true },
        { label: "Status", render: function (r) { return r.is_active === false ? D.statusPill("suspended") : D.statusPill("active"); } },
        { label: "", render: function (r) { return '<button class="btn btn--ghost btn--sm" data-edit="' + r.id + '">Edit</button>'; }, nowrap: true },
      ];
      el.innerHTML +=
        '<div class="panel"><div class="panel__head"><div class="panel__title">Kategori</div>' +
        '<button class="btn btn--primary btn--sm" id="add-cat">' + D.icon("plus") + " Tambah Kategori</button></div>" +
        '<div class="panel__body panel__body--flush">' + D.table(cols, cats, "Tiada kategori.") + "</div></div>";
      document.getElementById("add-cat").addEventListener("click", function () { catModal(null); });
      el.querySelectorAll("[data-edit]").forEach(function (b) {
        b.addEventListener("click", function () { catModal(b.getAttribute("data-edit")); });
      });
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  function catModal(id) {
    var c = id ? (cache.cats || []).filter(function (x) { return x.id === id; })[0] : {};
    c = c || {};
    D.openModal(id ? "Edit Kategori" : "Tambah Kategori",
      '<div class="form-row form-row--2">' +
      '<div><label class="f-label">Nama</label><input class="f-input" id="c-name" value="' + D.esc(c.name || "") + '"/></div>' +
      '<div><label class="f-label">Slug</label><input class="f-input" id="c-slug" value="' + D.esc(c.slug || "") + '"/></div></div>' +
      '<div class="form-row form-row--2">' +
      '<div><label class="f-label">Susunan</label><input class="f-input" id="c-sort" type="number" value="' + (c.sort_order || 0) + '"/></div>' +
      check("c-active", "Aktif", c.is_active !== false) + "</div>" +
      '<div class="btn-row mt-16"><button class="btn btn--primary" id="c-save">Simpan</button></div>');
    document.getElementById("c-save").addEventListener("click", function () {
      var payload = { id: id || undefined, name: val("c-name"), slug: val("c-slug") || slugify(val("c-name")), sort_order: parseInt(val("c-sort"), 10) || 0, is_active: chk("c-active") };
      if (!payload.name) return D.toast("Nama diperlukan.", "err");
      S.saveCategory(payload).then(function () { D.toast("Kategori disimpan.", "ok"); D.closeModal(); D.go("categories"); })
        .catch(function (e) { D.toast(e.message, "err"); });
    });
  }

  /* -------------------------------------------------------------- customers */
  sections.customers = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    S.getCustomers().then(function (rows) {
      var cols = [
        { label: "Nama", render: function (r) { return "<strong>" + D.esc(r.full_name || "—") + "</strong>"; } },
        { label: "Email", render: function (r) { return D.esc(r.email); } },
        { label: "Telefon", render: function (r) { return D.esc(r.phone || "—"); } },
        { label: "Daftar", render: function (r) { return D.date(r.created_at); }, nowrap: true },
      ];
      el.innerHTML += '<div class="panel"><div class="panel__head"><div class="panel__title">Pelanggan (' + rows.length + ')</div></div>' +
        '<div class="panel__body panel__body--flush">' + D.table(cols, rows, "Tiada pelanggan.") + "</div></div>";
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ---------------------------------------------------------------- reports */
  sections.reports = function (el) {
    el.insertAdjacentHTML("beforeend", D.spinner());
    S.getStats().then(function (s) {
      var bars = "";
      var max = Math.max.apply(null, (s.sales_by_day || []).map(function (d) { return d.total; }).concat([1]));
      (s.sales_by_day || []).forEach(function (d) {
        var pct = Math.round((d.total / max) * 100);
        bars +=
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          '<span style="font-size:11px;color:var(--db-faint);width:76px">' + D.esc(d.day) + "</span>" +
          '<span style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:5px;overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + pct + '%;background:var(--db-accent)"></span></span>' +
          '<span style="font-size:11px;color:#fff;width:72px;text-align:right">' + D.money(d.total) + "</span></div>";
      });
      var topRows = (s.top_products || []).map(function (p, i) {
        return '<div class="summary-row"><span>' + (i + 1) + ". " + D.esc(p.name) + "</span><b>" + (p.sales_count || 0) + " terjual</b></div>";
      }).join("");
      var catRows = (s.revenue_by_category || []).map(function (c) {
        return '<div class="summary-row"><span>' + D.esc(c.name || c.category || "—") + "</span><b>" + D.money(c.total) + "</b></div>";
      }).join("");

      var cards =
        D.statCard("Jumlah Jualan", D.money(s.total_sales), "card", "stat--accent") +
        D.statCard("Jumlah Pesanan", s.total_orders, "cart") +
        D.statCard("Pesanan Selesai", s.completed_orders, "check") +
        D.statCard("Pesanan Batal", s.cancelled_orders || 0, "list");

      el.innerHTML +=
        '<div class="stat-grid">' + cards + "</div>" +
        '<div class="grid-2">' +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Jualan 14 Hari</div></div>' +
        '<div class="panel__body">' + (bars || '<div class="tbl-empty">Tiada data.</div>') + "</div></div>" +
        '<div><div class="panel"><div class="panel__head"><div class="panel__title">Produk Terlaris</div></div>' +
        '<div class="panel__body">' + (topRows || '<div class="tbl-empty">Tiada data.</div>') + "</div></div>" +
        '<div class="panel"><div class="panel__head"><div class="panel__title">Jualan Ikut Kategori</div></div>' +
        '<div class="panel__body">' + (catRows || '<div class="tbl-empty">Tiada data.</div>') + "</div></div></div>" +
        "</div>";
    }).catch(function (e) { el.innerHTML += err(e); });
  };

  /* ------------------------------------------------------------------ boot */
  D.guard(["admin"]).then(function (profile) {
    D.setProfile(profile);
    D.mountShell({ nav: NAV, sections: sections, default: "dashboard" });
  }).catch(function () { /* redirected by guard */ });
})();
