/* ==========================================================================
   FYXITERZ — supabase.js
   Lightweight data + auth layer.

   Talks to Supabase directly over its REST (PostgREST), Auth (GoTrue) and
   Edge Functions HTTP APIs using fetch(), so no third-party CDN bundle is
   required — the site keeps working on GitHub Pages with a strict CSP.

   When SUPABASE_URL / SUPABASE_ANON_KEY are not configured the module falls
   back to DEMO MODE backed by assets/data/seed.js + localStorage so every
   screen remains browsable. Demo mode is clearly signalled by FYX.demo.
   ========================================================================== */

window.FYX = (function () {
  "use strict";

  var cfg = window.FYX_CONFIG || {};
  var BASE = (cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  var KEY = cfg.SUPABASE_ANON_KEY || "";
  var SESSION_KEY = "fyx_session";
  var DEMO_ORDERS = "fyx_demo_orders";
  var DEMO_OVERRIDE = "fyx_demo_override";

  var configured =
    !!BASE && !!KEY && !/YOUR_|xxxx/i.test(BASE) && BASE.indexOf("http") === 0;

  /* ------------------------------------------------------------------ utils */
  function nowIso() {
    return new Date().toISOString();
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function readLS(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeLS(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* storage may be unavailable (private mode) */
    }
  }

  function uuidv4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /* ------------------------------------------------------------- token store */
  var session = readLS(SESSION_KEY, null);

  function persistSession(s) {
    session = s;
    if (s) writeLS(SESSION_KEY, s);
    else {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    }
  }

  function currentToken() {
    return session && session.access_token ? session.access_token : KEY;
  }

  function authHeaders() {
    var h = {
      apikey: KEY,
      "Content-Type": "application/json",
    };
    if (session && session.access_token) {
      h.Authorization = "Bearer " + session.access_token;
    } else if (KEY) {
      h.Authorization = "Bearer " + KEY;
    }
    return h;
  }

  /* --------------------------------------------------------------- REST core */
  function qs(params) {
    if (!params) return "";
    return Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      })
      .join("&");
  }

  function restGet(table, query) {
    var url = BASE + "/rest/v1/" + table + (query ? "?" + query : "");
    return fetch(url, { headers: authHeaders() }).then(handle);
  }

  function restInsert(table, rows, opts) {
    var prefer = "return=representation";
    if (opts && opts.upsert) prefer += ",resolution=merge-duplicates";
    var h = authHeaders();
    h.Prefer = prefer;
    return fetch(BASE + "/rest/v1/" + table, {
      method: "POST",
      headers: h,
      body: JSON.stringify(rows),
    }).then(handle);
  }

  function restPatch(table, query, patch) {
    var h = authHeaders();
    h.Prefer = "return=representation";
    return fetch(BASE + "/rest/v1/" + table + (query ? "?" + query : ""), {
      method: "PATCH",
      headers: h,
      body: JSON.stringify(patch),
    }).then(handle);
  }

  function restDelete(table, query) {
    return fetch(BASE + "/rest/v1/" + table + (query ? "?" + query : ""), {
      method: "DELETE",
      headers: authHeaders(),
    }).then(handle);
  }

  function restRpc(name, params) {
    return fetch(BASE + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(params || {}),
    }).then(handle);
  }

  function handle(res) {
    return res.text().then(function (txt) {
      var data = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch (e) {
        data = txt;
      }
      if (!res.ok) {
        var msg =
          (data && (data.message || data.error_description || data.error || data.msg)) ||
          "Permintaan gagal (" + res.status + ")";
        var err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  }

  /* ------------------------------------------------------- Edge Functions -- */
  function invoke(fn, body, opts) {
    if (!configured) return Promise.reject(new Error("Backend tidak dikonfigurasi"));
    return fetch(BASE + "/functions/v1/" + fn, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body || {}),
    }).then(handle);
  }

  /* ------------------------------------------------------------------- AUTH */
  var auth = {
    signIn: function (email, password) {
      if (!configured) {
        return Promise.reject(new Error("Demo mode: autentikasi memerlukan Supabase."));
      }
      return fetch(BASE + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      })
        .then(handle)
        .then(function (s) {
          persistSession({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            expires_at: Date.now() + (s.expires_in || 3600) * 1000,
            user: s.user,
          });
          return s;
        });
    },

    refresh: function () {
      if (!configured || !session || !session.refresh_token) return Promise.resolve(null);
      return fetch(BASE + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      })
        .then(handle)
        .then(function (s) {
          persistSession({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            expires_at: Date.now() + (s.expires_in || 3600) * 1000,
            user: s.user,
          });
          return s;
        })
        .catch(function () {
          persistSession(null);
          return null;
        });
    },

    signOut: function () {
      var token = session && session.access_token;
      persistSession(null);
      if (!configured || !token) return Promise.resolve();
      return fetch(BASE + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + token },
      }).catch(function () {});
    },

    resetPassword: function (email) {
      if (!configured) return Promise.reject(new Error("Demo mode: Supabase diperlukan."));
      return fetch(BASE + "/auth/v1/recover", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      }).then(handle);
    },

    getUser: function () {
      if (!configured || !session) return Promise.resolve(session ? session.user : null);
      return fetch(BASE + "/auth/v1/user", {
        headers: { apikey: KEY, Authorization: "Bearer " + session.access_token },
      })
        .then(handle)
        .catch(function () {
          return null;
        });
    },

    getSession: function () {
      if (session && session.expires_at && session.expires_at < Date.now() + 60000) {
        return auth.refresh();
      }
      return Promise.resolve(session);
    },

    isAuthenticated: function () {
      return !!session;
    },
  };

  /* ================================================================ DATA === */
  /* High level data access with a demo fallback.                              */

  var seed = window.FYX_SEED || { categories: [], products: [], variants: [], settings: {}, discount_codes: [] };

  function demoStore() {
    var ov = readLS(DEMO_OVERRIDE, null);
    if (!ov) return null;
    return ov;
  }

  function demoProducts() {
    var ov = demoStore();
    return (ov && ov.products) || seed.products;
  }
  function demoCategories() {
    var ov = demoStore();
    return (ov && ov.categories) || seed.categories;
  }
  function demoVariants() {
    var ov = demoStore();
    return (ov && ov.variants) || seed.variants;
  }

  function demoOrders() {
    return readLS(DEMO_ORDERS, []);
  }
  function saveDemoOrders(list) {
    writeLS(DEMO_ORDERS, list);
  }

  /* ------------------------------------------------------------- read: get ---*/
  function dataGetSettings() {
    if (!configured) return Promise.resolve(seed.settings);
    return restGet("website_settings", "select=key,value").then(function (rows) {
      var out = {};
      (rows || []).forEach(function (r) {
        out[r.key] = r.value && r.value.v !== undefined ? r.value.v : r.value;
      });
      return Object.keys(out).length ? out : seed.settings;
    });
  }

  function dataGetCategories() {
    if (!configured) {
      return Promise.resolve(
        demoCategories().filter(function (c) { return c.is_active !== false; })
          .slice()
          .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      );
    }
    return restGet(
      "categories",
      "select=id,name,slug,description,image_url,sort_order,is_active&is_active=eq.true&order=sort_order.asc"
    );
  }

  function dataGetProducts(opts) {
    opts = opts || {};
    if (!configured) {
      var list = demoProducts().filter(function (p) {
        if (opts.includeInactive) return true;
        return p.is_active !== false;
      });
      if (opts.category) list = list.filter(function (p) { return p.category && p.category.slug === opts.category; });
      if (opts.bestseller) list = list.filter(function (p) { return p.is_bestseller; });
      if (opts.featured) list = list.filter(function (p) { return p.is_featured; });
      if (opts.search) {
        var q = opts.search.toLowerCase();
        list = list.filter(function (p) { return (p.name + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0; });
      }
      list = sortProducts(list, opts.sort);
      if (opts.limit) list = list.slice(0, opts.limit);
      return Promise.resolve(list);
    }
    var params = { select: "*,category:categories(slug,name)" };
    if (!opts.includeInactive) params.is_active = "eq.true";
    if (opts.category) params["category.slug"] = "eq." + opts.category;
    if (opts.bestseller) params.is_bestseller = "eq.true";
    if (opts.featured) params.is_featured = "eq.true";
    if (opts.search) params.or = "(name.ilike.*" + opts.search + "*,description.ilike.*" + opts.search + "*)";
    params.order = orderClause(opts.sort);
    if (opts.limit) params.limit = opts.limit;
    return restGet("products", qs(params));
  }

  function sortProducts(list, sort) {
    var l = list.slice();
    switch (sort) {
      case "price-asc":
        l.sort(function (a, b) { return a.regular_price - b.regular_price; });
        break;
      case "price-desc":
        l.sort(function (a, b) { return b.regular_price - a.regular_price; });
        break;
      case "name-asc":
        l.sort(function (a, b) { return a.name.localeCompare(b.name); });
        break;
      case "newest":
        l.reverse();
        break;
      default:
        l.sort(function (a, b) { return (b.sales_count || 0) - (a.sales_count || 0); });
    }
    return l;
  }

  function orderClause(sort) {
    switch (sort) {
      case "price-asc":
        return "regular_price.asc";
      case "price-desc":
        return "regular_price.desc";
      case "name-asc":
        return "name.asc";
      case "newest":
        return "created_at.desc";
      default:
        return "sales_count.desc";
    }
  }

  function dataGetProductBySlug(slug) {
    if (!configured) {
      var p = demoProducts().filter(function (x) { return x.slug === slug; })[0] || null;
      return Promise.resolve(p);
    }
    return restGet(
      "products",
      "select=*,category:categories(slug,name)&slug=eq." + encodeURIComponent(slug) + "&limit=1"
    ).then(function (rows) {
      return rows && rows[0] ? rows[0] : null;
    });
  }

  function dataGetVariants(productId) {
    if (!configured) {
      return Promise.resolve(
        demoVariants()
          .filter(function (v) { return v.product_id === productId && v.is_active !== false; })
          .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      );
    }
    return restGet(
      "product_variants",
      "select=*&product_id=eq." + productId + "&is_active=eq.true&order=sort_order.asc"
    );
  }

  /* --------------------------------------------------------- discount code */
  function applyDiscount(payload) {
    if (configured) return invoke("apply-discount", payload);
    // demo
    var code = (payload.code || "").trim().toUpperCase();
    var subtotal = Number(payload.subtotal) || 0;
    var dc = seed.discount_codes.filter(function (d) {
      return d.code.toUpperCase() === code && d.is_active;
    })[0];
    if (!dc) return Promise.resolve({ valid: false, message: "Kod diskaun tidak sah." });
    if (subtotal < (dc.min_purchase || 0)) {
      return Promise.resolve({
        valid: false,
        message: "Belanja minimum RM" + dc.min_purchase + " diperlukan untuk kod ini.",
      });
    }
    var amount =
      dc.discount_type === "percent" ? round2((subtotal * dc.discount_value) / 100) : round2(dc.discount_value);
    if (amount > subtotal) amount = subtotal;
    return Promise.resolve({
      valid: true,
      code: dc.code,
      discount_amount: amount,
      discount_type: dc.discount_type,
      discount_value: dc.discount_value,
      message: "Kod diskaun digunakan.",
    });
  }

  /* ----------------------------------------------------------------- orders */
  function createOrder(payload) {
    if (configured) return invoke("create-order", payload);
    // ---- demo: recompute prices server-side-style from the seed catalogue ----
    var items = payload.items || [];
    if (!items.length) return Promise.reject(new Error("Tiada item."));
    var products = demoProducts();
    var variants = demoVariants();
    var subtotal = 0;
    var lines = items.map(function (it) {
      var p = products.filter(function (x) { return x.id === it.product_id; })[0];
      if (!p) throw new Error("Produk tidak dijumpai.");
      var v = it.variant_id ? variants.filter(function (x) { return x.id === it.variant_id; })[0] : null;
      var unit = v ? v.price : p.regular_price;
      var qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      subtotal += unit * qty;
      return {
        product_id: p.id,
        variant_id: v ? v.id : null,
        product_name: p.name,
        variant_name: v ? v.name : null,
        unit_price: unit,
        quantity: qty,
        subtotal: round2(unit * qty),
      };
    });
    var discount = 0;
    var code = null;
    var chain = Promise.resolve();
    if (payload.discount_code) {
      chain = applyDiscount({
        code: payload.discount_code,
        subtotal: subtotal,
        email: payload.customer && payload.customer.email,
      }).then(function (d) {
        if (d && d.valid) {
          discount = d.discount_amount;
          code = d.code;
        }
      });
    }
    return chain.then(function () {
      var total = round2(Math.max(0, subtotal - discount));
      var orderCode = "INV-" + uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
      var order = {
        id: uuidv4(),
        order_code: orderCode,
        customer_name: payload.customer.name,
        customer_email: payload.customer.email,
        customer_whatsapp: payload.customer.whatsapp || null,
        game_id: payload.customer.game_id || null,
        server_id: payload.customer.server_id || null,
        subtotal: round2(subtotal),
        discount_amount: round2(discount),
        total: total,
        discount_code: code,
        payment_method: payload.payment_method || null,
        status: "pending",
        payment_status: "unpaid",
        created_at: nowIso(),
        paid_at: null,
        completed_at: null,
        items: lines,
        demo: true,
      };
      var all = demoOrders();
      all.unshift(order);
      saveDemoOrders(all);
      return {
        order_id: order.id,
        order_code: orderCode,
        subtotal: order.subtotal,
        discount_amount: order.discount_amount,
        total: total,
        payment_method: order.payment_method,
        demo: true,
      };
    });
  }

  function createPayment(orderCode, paymentMethod) {
    if (configured) {
      return invoke("create-payment", {
        order_code: orderCode,
        payment_method: paymentMethod || null,
      });
    }
    var all = demoOrders();
    var o = all.filter(function (x) { return x.order_code === orderCode; })[0];
    if (!o) return Promise.reject(new Error("Pesanan tidak dijumpai."));
    return Promise.resolve({
      demo: true,
      order_code: orderCode,
      payment_method: paymentMethod || o.payment_method || null,
      checkout_url: null,
      message:
        "Demo mode: tiada gateway pembayaran dikonfigurasi. Konfigurasikan SUPABASE_URL + kredensial CHIP untuk bayaran Touch 'n Go eWallet.",
    });
  }

  function verifyPayment(orderCode) {
    if (configured) return invoke("verify-payment", { order_code: orderCode });
    var all = demoOrders();
    var o = all.filter(function (x) { return x.order_code === orderCode; })[0];
    if (!o) return Promise.reject(new Error("Pesanan tidak dijumpai."));
    return Promise.resolve({
      order_code: o.order_code,
      payment_status: o.payment_status,
      status: o.status,
      total: o.total,
      paid_at: o.paid_at,
      demo: true,
    });
  }

  function trackOrder(payload) {
    if (configured) return invoke("track-order", payload);
    var email = (payload.email || "").trim().toLowerCase();
    var code = (payload.order_code || "").trim().toUpperCase();
    var o = demoOrders().filter(function (x) {
      return x.order_code.toUpperCase() === code && x.customer_email.toLowerCase() === email;
    })[0];
    if (!o) return Promise.reject(new Error("Pesanan tidak dijumpai untuk email tersebut."));
    return Promise.resolve({
      order_code: o.order_code,
      status: o.status,
      payment_status: o.payment_status,
      total: o.total,
      created_at: o.created_at,
      paid_at: o.paid_at,
      completed_at: o.completed_at,
      items: (o.items || []).map(function (i) {
        return {
          product_name: i.product_name,
          variant_name: i.variant_name,
          quantity: i.quantity,
          subtotal: i.subtotal,
        };
      }),
      deliveries: o.payment_status === "paid" && o.demo
        ? (o.items || []).map(function (i) {
            return {
              product_name: i.product_name,
              delivered_content:
                "KEY-" + o.order_code + "-" + (i.variant_name || i.product_name).replace(/\s+/g, "").toUpperCase(),
              status: "sent",
            };
          })
        : [],
      demo: true,
    });
  }

  /* ------------------------------------------------------ demo admin helpers */
  function saveOverride(kind, list) {
    var ov = demoStore() || {};
    ov[kind] = list;
    writeLS(DEMO_OVERRIDE, ov);
  }

  function demoListProducts() {
    return Promise.resolve(demoProducts().slice());
  }
  function demoListCategories() {
    return Promise.resolve(demoCategories().slice());
  }
  function demoListOrders() {
    return Promise.resolve(demoOrders().slice());
  }

  /* ------------------------------------------------------------ STAFF reads */
  function staffGetProducts(opts) {
    if (configured) return dataGetProducts(Object.assign({ includeInactive: true, limit: 500 }, opts || {}));
    return demoListProducts();
  }

  function staffSaveProduct(p) {
    if (configured) {
      if (p.id) return restPatch("products", "id=eq." + p.id, p).then(first);
      return restInsert("products", p).then(first);
    }
    var list = demoProducts().slice();
    if (p.id) {
      list = list.map(function (x) { return x.id === p.id ? Object.assign({}, x, p) : x; });
    } else {
      p.id = uuidv4();
      list.push(p);
    }
    saveOverride("products", list);
    return Promise.resolve(p);
  }

  function staffDeleteProduct(id) {
    if (configured) return restDelete("products", "id=eq." + id);
    saveOverride("products", demoProducts().filter(function (x) { return x.id !== id; }));
    return Promise.resolve(true);
  }

  /* Upload an image file to the product-images bucket; resolves to a public URL. */
  function uploadProductImage(file) {
    if (!configured) return Promise.reject(new Error("Demo mode: muat naik gambar perlukan Supabase."));
    if (!file) return Promise.reject(new Error("Tiada fail dipilih."));
    if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Gambar terlalu besar (maks 5 MB)."));
    var bucket = (window.FYX_CONFIG && window.FYX_CONFIG.STORAGE_BUCKET) || "product-images";
    var ext = ((file.name || "").match(/\.[a-z0-9]+$/i) || [".png"])[0].toLowerCase();
    var path = "products/" + uuidv4() + ext;
    var token = (session && session.access_token) || KEY;
    return fetch(BASE + "/storage/v1/object/" + bucket + "/" + path, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + token,
        "Content-Type": file.type || "application/octet-stream",
        "cache-control": "3600",
        "x-upsert": "true",
      },
      body: file,
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function () {
          throw new Error("Gagal memuat naik gambar (" + r.status + ").");
        });
      }
      return BASE + "/storage/v1/object/public/" + bucket + "/" + path;
    });
  }

  function staffSaveCategory(c) {
    if (configured) {
      if (c.id) return restPatch("categories", "id=eq." + c.id, c).then(first);
      return restInsert("categories", c).then(first);
    }
    var list = demoCategories().slice();
    if (c.id) list = list.map(function (x) { return x.id === c.id ? Object.assign({}, x, c) : x; });
    else {
      c.id = uuidv4();
      list.push(c);
    }
    saveOverride("categories", list);
    return Promise.resolve(c);
  }

  function staffGetOrders(opts) {
    opts = opts || {};
    if (configured) {
      var params = { select: "*,order_items(*)", order: "created_at.desc", limit: opts.limit || 200 };
      if (opts.status) params.status = "eq." + opts.status;
      return restGet("orders", qs(params));
    }
    var list = demoOrders();
    if (opts.status) list = list.filter(function (o) { return o.status === opts.status; });
    return Promise.resolve(list);
  }

  function staffUpdateOrder(orderId, patch) {
    if (configured) return invoke("update-order-status", { order_id: orderId, status: patch.status, payment_status: patch.payment_status });
    var list = demoOrders().map(function (o) {
      if (o.id !== orderId && o.order_code !== orderId) return o;
      var next = Object.assign({}, o, patch);
      if (patch.payment_status === "paid" && !next.paid_at) next.paid_at = nowIso();
      if (patch.status === "completed" && !next.completed_at) next.completed_at = nowIso();
      return next;
    });
    saveDemoOrders(list);
    return Promise.resolve(true);
  }

  // Save the REAL delivery content (e.g. license key) entered by staff.
  // items: [{ order_item_id, product_name, delivered_content }]
  function staffSaveDeliveries(orderId, items, sentTo) {
    if (!configured) return Promise.reject(new Error("Backend diperlukan untuk simpan penghantaran."));
    var valid = (items || []).filter(function (i) {
      return i && i.order_item_id && (i.delivered_content || "").trim().length > 0;
    });
    if (!valid.length) return Promise.reject(new Error("Sila masukkan kandungan penghantaran untuk sekurang-kurangnya satu item."));
    var now = new Date().toISOString();
    var itemIds = valid.map(function (i) { return i.order_item_id; });
    // Replace any previous delivery for these items (delete then insert).
    return restDelete("deliveries", "order_item_id=in.(" + itemIds.join(",") + ")")
      .then(function () {
        var rows = valid.map(function (i) {
          return {
            order_id: orderId,
            order_item_id: i.order_item_id,
            delivered_content: i.delivered_content.trim(),
            delivery_type: "manual",
            status: "sent",
            sent_at: now,
            sent_to: sentTo || null,
          };
        });
        return restInsert("deliveries", rows, { upsert: false });
      })
      .then(function () { return true; });
  }

  function staffGetCustomers() {
    if (configured) return restGet("profiles", "select=id,email,full_name,phone,role,is_active,created_at&order=created_at.desc&limit=300");
    // derive from demo orders + a couple of seeded staff rows
    var seen = {};
    demoOrders().forEach(function (o) {
      seen[o.customer_email] = {
        email: o.customer_email,
        full_name: o.customer_name,
        phone: o.customer_whatsapp,
        role: "customer",
        created_at: o.created_at,
      };
    });
    return Promise.resolve(Object.keys(seen).map(function (k) { return seen[k]; }));
  }

  function staffGetStaff() {
    if (configured) return restGet("profiles", "select=id,email,full_name,role,is_active,created_at&role=in.(owner,admin,reseller)&order=created_at.desc");
    return Promise.resolve([
      { id: "demo-owner", email: "owner@fyxiterz.com", full_name: "Pemilik Demo", role: "owner", is_active: true, created_at: nowIso() },
      { id: "demo-admin", email: "admin@fyxiterz.com", full_name: "Admin Demo", role: "admin", is_active: true, created_at: nowIso() },
      { id: "demo-reseller", email: "reseller@fyxiterz.com", full_name: "Reseller Demo", role: "reseller", is_active: true, created_at: nowIso() },
    ]);
  }

  function staffCreateStaff(payload) {
    if (configured) return invoke("create-staff", payload);
    return Promise.reject(new Error("Demo mode: penciptaan staf memerlukan Supabase + Edge Functions."));
  }
  function staffUpdateStaff(payload) {
    if (configured) return invoke("update-staff", payload);
    return Promise.reject(new Error("Demo mode: kemas kini staf memerlukan Supabase."));
  }
  function staffDeleteStaff(userId) {
    if (configured) return invoke("delete-staff", { user_id: userId });
    return Promise.reject(new Error("Demo mode: pemadaman staf memerlukan Supabase."));
  }

  function staffGetDiscountCodes() {
    if (configured) return restGet("discount_codes", "select=*&order=created_at.desc");
    return Promise.resolve(seed.discount_codes.slice());
  }

  function staffSaveDiscountCode(dc) {
    if (configured) {
      if (dc.id) return restPatch("discount_codes", "id=eq." + dc.id, dc).then(first);
      return restInsert("discount_codes", dc).then(first);
    }
    var list = seed.discount_codes.slice();
    dc.id = dc.id || uuidv4();
    list.push(dc);
    return Promise.resolve(dc);
  }

  function staffGetStats() {
    if (configured) return invoke("dashboard-statistics", {});
    var orders = demoOrders();
    var paid = orders.filter(function (o) { return o.payment_status === "paid"; });
    var byDay = {};
    orders.forEach(function (o) {
      var d = (o.created_at || "").slice(0, 10);
      byDay[d] = (byDay[d] || 0) + Number(o.total || 0);
    });
    var top = demoProducts().slice().sort(function (a, b) { return b.sales_count - a.sales_count; }).slice(0, 5);
    return Promise.resolve({
      demo: true,
      total_sales: round2(paid.reduce(function (s, o) { return s + Number(o.total || 0); }, 0)),
      total_orders: orders.length,
      pending_orders: orders.filter(function (o) { return o.status === "pending"; }).length,
      completed_orders: orders.filter(function (o) { return o.status === "completed"; }).length,
      cancelled_orders: orders.filter(function (o) { return o.status === "cancelled"; }).length,
      total_customers: staffGetCustomersSync().length,
      total_resellers: 1,
      total_products: demoProducts().length,
      low_stock_products: demoProducts().filter(function (p) { return p.stock > 0 && p.stock <= 10; }).length,
      low_stock_list: demoProducts()
        .filter(function (p) { return p.stock > 0 && p.stock <= 10; })
        .sort(function (a, b) { return a.stock - b.stock; })
        .slice(0, 10)
        .map(function (p) { return { name: p.name, stock: p.stock }; }),
      recent_orders: orders.slice(0, 8),
      sales_by_day: Object.keys(byDay).sort().slice(-14).map(function (d) { return { day: d, total: round2(byDay[d]) }; }),
      top_products: top.map(function (p) { return { name: p.name, sales_count: p.sales_count, price: p.regular_price }; }),
      revenue_by_category: [],
    });
  }

  function staffGetCustomersSync() {
    var seen = {};
    demoOrders().forEach(function (o) { seen[o.customer_email] = 1; });
    return Object.keys(seen);
  }

  function staffGetAuditLogs() {
    if (configured) return restGet("audit_logs", "select=*&order=created_at.desc&limit=100");
    return Promise.resolve([
      { created_at: nowIso(), actor_email: "owner@fyxiterz.com", action: "login", entity_type: "auth", entity_id: "-", details: { demo: true } },
    ]);
  }

  function staffGetTransactions() {
    if (configured) return restGet("transactions", "select=*&order=created_at.desc&limit=200");
    return Promise.resolve(
      demoOrders().map(function (o) {
        return {
          created_at: o.created_at,
          type: "sale",
          amount: o.total,
          status: o.payment_status === "paid" ? "success" : "pending",
          reference: o.order_code,
          description: o.customer_email,
        };
      })
    );
  }

  function staffGetResellers() {
    if (configured)
      return restGet(
        "reseller_accounts",
        "select=*,profile:profiles(id,email,full_name),reseller_prices(price,product_id,variant_id)&order=created_at.desc"
      );
    return Promise.resolve([
      {
        id: "demo-ra",
        profile: { id: "demo-reseller", email: "reseller@fyxiterz.com", full_name: "Reseller Demo" },
        business_name: "Demo Reseller Enterprise",
        tier: "basic",
        discount_percent: 30,
        status: "active",
        created_at: nowIso(),
      },
    ]);
  }

  function staffUpdateReseller(id, patch) {
    if (configured) return restPatch("reseller_accounts", "id=eq." + id, patch).then(first);
    return Promise.resolve(patch);
  }

  function staffSetResellerPrice(row) {
    if (configured) return restInsert("reseller_prices", row, { upsert: true }).then(first);
    return Promise.resolve(row);
  }

  function first(rows) {
    return Array.isArray(rows) ? rows[0] : rows;
  }

  /* ---------------------------------------------------------- reseller self */
  function resellerGetDashboard() {
    if (!configured) {
      var orders = demoOrders();
      return Promise.resolve({
        demo: true,
        total_orders: orders.length,
        total_sales: round2(orders.reduce(function (s, o) { return s + Number(o.total || 0); }, 0)),
        orders: orders.slice(0, 20),
        wallet: { balance: 0, currency: "MYR" },
        wallet_transactions: [],
        transactions: [],
      });
    }
    // Real mode: dashboard-statistics is staff-only, so a reseller reads its
    // own rows directly through RLS (orders/order_items/transactions/payments
    // self-read policies + wallet self-read).
    return auth.getUser().then(function (u) {
      if (!u || !u.id) throw new Error("Sesi tidak sah.");
      return restGet(
        "reseller_accounts",
        "select=id,tier,discount_percent,status&profile_id=eq." + u.id + "&limit=1"
      ).then(function (accounts) {
        var acc = accounts && accounts[0];
        if (!acc) throw new Error("Tiada akaun reseller untuk pengguna ini.");
        var ordersP = restGet(
          "orders",
          "select=*,order_items(*)&reseller_id=eq." + acc.id + "&order=created_at.desc&limit=200"
        );
        var walletP = restGet(
          "wallets",
          "select=id,balance,currency&profile_id=eq." + u.id + "&limit=1"
        );
        var txP = restGet("transactions", "select=*&order=created_at.desc&limit=200");
        return Promise.all([ordersP, walletP, txP]).then(function (res) {
          var orders = res[0] || [];
          var wallet = (res[1] && res[1][0]) || { balance: 0, currency: "MYR" };
          var txs = res[2] || [];
          var walletTxP = wallet.id
            ? restGet(
                "wallet_transactions",
                "select=*&wallet_id=eq." + wallet.id + "&order=created_at.desc&limit=200"
              )
            : Promise.resolve([]);
          return walletTxP.then(function (wtx) {
            return {
              total_orders: orders.length,
              total_sales: round2(
                orders
                  .filter(function (o) { return o.payment_status === "paid"; })
                  .reduce(function (s, o) { return s + Number(o.total || 0); }, 0)
              ),
              discount_percent: acc.discount_percent || 0,
              tier: acc.tier || "basic",
              status: acc.status,
              orders: orders,
              wallet: { balance: wallet.balance || 0, currency: wallet.currency || "MYR", id: wallet.id },
              wallet_transactions: wtx || [],
              transactions: txs,
            };
          });
        });
      });
    });
  }

  function resellerPurchase(payload) {
    if (configured) return invoke("reseller-purchase", payload);
    return createOrder(payload);
  }

  return {
    configured: configured,
    demo: !configured,
    base: BASE,
    auth: auth,
    invoke: invoke,
    rest: { get: restGet, insert: restInsert, patch: restPatch, del: restDelete, rpc: restRpc },
    data: {
      getSettings: dataGetSettings,
      getCategories: dataGetCategories,
      getProducts: dataGetProducts,
      getProductBySlug: dataGetProductBySlug,
      getVariants: dataGetVariants,
      applyDiscount: applyDiscount,
      createOrder: createOrder,
      createPayment: createPayment,
      verifyPayment: verifyPayment,
      trackOrder: trackOrder,
    },
    staff: {
      getProducts: staffGetProducts,
      saveProduct: staffSaveProduct,
      deleteProduct: staffDeleteProduct,
      uploadImage: uploadProductImage,
      getCategories: staffGetCategoriesSafe,
      saveCategory: staffSaveCategory,
      getOrders: staffGetOrders,
      updateOrder: staffUpdateOrder,
      saveDeliveries: staffSaveDeliveries,
      getCustomers: staffGetCustomers,
      getStaff: staffGetStaff,
      createStaff: staffCreateStaff,
      updateStaff: staffUpdateStaff,
      deleteStaff: staffDeleteStaff,
      getDiscountCodes: staffGetDiscountCodes,
      saveDiscountCode: staffSaveDiscountCode,
      getStats: staffGetStats,
      getAuditLogs: staffGetAuditLogs,
      getTransactions: staffGetTransactions,
      getResellers: staffGetResellers,
      updateReseller: staffUpdateReseller,
      setResellerPrice: staffSetResellerPrice,
    },
    reseller: {
      getDashboard: resellerGetDashboard,
      purchase: resellerPurchase,
    },
    utils: { uuidv4: uuidv4, round2: round2, nowIso: nowIso },
  };

  function staffGetCategoriesSafe() {
    if (configured) return restGet("categories", "select=*&order=sort_order.asc");
    return demoListCategories();
  }
})();
