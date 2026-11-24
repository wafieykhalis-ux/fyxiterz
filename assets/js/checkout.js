/* ==========================================================================
   FYXITERZ — checkout.js
   Cart review, buyer details, discount code and order creation.

   Prices are ALWAYS recomputed by the backend (create-order Edge Function);
   the totals shown here are only a preview. A payment is never treated as
   successful based on a redirect — the webhook / verify-payment reconcile it.
   ========================================================================== */

(function () {
  "use strict";

  var C = window.FYX_CONFIG || {};
  FYX_UI.init({ active: "" });

  var state = { discount: null, submitting: false, payment_method: null, payment_mode: "gateway", settings: null };
  var linesEl = document.getElementById("cart-lines");
  var alertEl = document.getElementById("checkout-alert");

  function showAlert(msg) {
    alertEl.textContent = msg;
    alertEl.classList.remove("alert--hidden");
  }
  function hideAlert() {
    alertEl.classList.add("alert--hidden");
  }

  /* ------------------------------------------------------------------ render */
  function renderLines() {
    var items = FYX_UI.cart.list();
    if (!items.length) {
      linesEl.innerHTML = FYX_UI.emptyState("Bakul anda kosong.");
      document.getElementById("place-order").disabled = true;
      renderTotals();
      return;
    }
    linesEl.innerHTML = items
      .map(function (i, idx) {
        return (
          '<div class="cart-line">' +
          '<div class="cart-line__thumb"><img src="' + (i.image || "") + '" alt=""/></div>' +
          '<div class="cart-line__info"><div class="cart-line__name">' + FYX_UI.esc(i.product_name) + "</div>" +
          '<div class="cart-line__sub">' + (i.variant_name ? FYX_UI.esc(i.variant_name) + " • " : "") + FYX_UI.money(i.unit_price) + "</div></div>" +
          '<div class="qty" data-idx="' + idx + '">' +
          '<button data-act="dec" aria-label="Kurang">−</button>' +
          "<span>" + (i.quantity || 1) + "</span>" +
          '<button data-act="inc" aria-label="Tambah">+</button>' +
          "</div>" +
          '<button class="icon-btn" data-act="rm" aria-label="Buang">' + FYX_UI.icon("trash", 16) + "</button>" +
          "</div>"
        );
      })
      .join("");

    linesEl.querySelectorAll(".qty button").forEach(function (b) {
      b.addEventListener("click", function () {
        var idx = parseInt(b.parentNode.getAttribute("data-idx"), 10);
        var it = FYX_UI.cart.list()[idx];
        var q = (it.quantity || 1) + (b.getAttribute("data-act") === "inc" ? 1 : -1);
        if (q < 1) return;
        FYX_UI.cart.setQty(it.product_id, it.variant_id, q);
        renderLines();
      });
    });
    linesEl.querySelectorAll('[data-act="rm"]').forEach(function (b) {
      b.addEventListener("click", function () {
        var idx = parseInt(b.parentNode.getAttribute("data-idx"), 10);
        var it = FYX_UI.cart.list()[idx];
        FYX_UI.cart.remove(it.product_id, it.variant_id);
        state.discount = null;
        renderLines();
      });
    });
    renderTotals();
  }

  function renderTotals() {
    var subtotal = FYX_UI.cart.subtotal();
    var discount = state.discount ? state.discount.discount_amount : 0;
    var total = Math.max(0, subtotal - discount);
    document.getElementById("sum-subtotal").textContent = FYX_UI.money(subtotal);
    document.getElementById("sum-discount").textContent = "- " + FYX_UI.money(discount);
    document.getElementById("sum-total").textContent = FYX_UI.money(total);
    var qa = document.getElementById("qr-amount");
    if (qa) qa.textContent = FYX_UI.money(total);
  }

  function renderPaymentMethods() {
    var s = state.settings || {};
    // Owner-set values in website_settings win; config.js is the fallback.
    var mode = String(s.payment_mode || C.PAYMENT_MODE || "gateway").toLowerCase();
    state.payment_mode = mode;
    var el = document.getElementById("payment-methods");
    if (mode === "qr") {
      renderQrPanel(el);
      return;
    }

    var provider = String(s.payment_provider || C.PAYMENT_PROVIDER || "chip").toLowerCase();
    var all = C.PAYMENT_METHODS || [];
    var methods = all.filter(function (m) {
      return !m.providers || m.providers.indexOf(provider) !== -1;
    });
    if (!methods.length) {
      methods = [{ id: "default", label: provider.toUpperCase(), sub: "Kaedah bayaran gateway." }];
    }
    // Choose the default, falling back to the first supported channel.
    var def = methods.filter(function (m) { return m.id === C.DEFAULT_PAYMENT_METHOD; })[0] || methods[0];
    state.payment_method = def.id;

    el.innerHTML =
      methods
        .map(function (m) {
          return (
            '<button type="button" class="variant pm-option' + (m.id === def.id ? " is-selected" : "") +
            '" data-pm="' + FYX_UI.esc(m.id) + '">' +
            '<span><span class="variant__name">' + FYX_UI.esc(m.label) + "</span>" +
            '<span class="variant__sub">' + FYX_UI.esc(m.sub || "") + "</span></span>" +
            '<span class="variant__price">' + FYX_UI.icon(m.id === def.id ? "check" : "shield", 18) + "</span>" +
            "</button>"
          );
        })
        .join("") +
      (FYX.demo
        ? '<div class="alert alert--warn mt-16">Demo mode aktif — tiada gateway pembayaran sebenar dikonfigurasi. Pesanan akan disimpan sebagai demo.</div>'
        : '<div class="alert alert--info mt-16">Bayaran diproses oleh <b>' + FYX_UI.esc(provider.toUpperCase()) +
          "</b>. Anda akan dihalakan ke halaman bayaran yang selamat untuk menyelesaikan pembayaran.</div>");

    setPayHint("Pembayaran diproses oleh gateway yang selamat & harga disahkan di pelayan.");

    el.querySelectorAll(".pm-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.payment_method = btn.getAttribute("data-pm");
        el.querySelectorAll(".pm-option").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-selected", on);
          var slot = b.querySelector(".variant__price");
          if (slot) slot.innerHTML = FYX_UI.icon(on ? "check" : "shield", 18);
        });
      });
    });
  }

  function setPayHint(text) {
    var h = document.getElementById("pay-hint");
    if (h) h.textContent = text;
  }

  /* ---- QR transfer mode: customer transfers to our QR, staff verifies ---- */
  function qrConfig() {
    var q = C.QR_PAYMENT || {};
    var s = state.settings || {};
    var inst = s.payment_instructions;
    if (typeof inst === "string") {
      try { inst = JSON.parse(inst); } catch (e) { inst = null; }
    }
    if (!Array.isArray(inst) || !inst.length) inst = q.INSTRUCTIONS || [];
    return {
      image: s.payment_qr_url || q.QR_IMAGE || "assets/img/payment-qr-placeholder.svg",
      payee: s.payment_qr_payee || q.PAYEE || C.SITE_NAME || "FYXITERZ",
      instructions: inst,
    };
  }

  function renderQrPanel(el) {
    var q = qrConfig();
    state.payment_method = "qr_transfer";
    el.innerHTML =
      '<div class="qr-pay">' +
        '<div class="qr-pay__code"><img src="' + FYX_UI.esc(q.image) + '" alt="Kod QR pembayaran" width="200" height="200"/></div>' +
        '<div class="qr-pay__meta">' +
          '<div class="qr-pay__payee">Bayar kepada <b>' + FYX_UI.esc(q.payee) + "</b></div>" +
          '<div class="qr-pay__amount">Jumlah <b id="qr-amount">RM 0.00</b></div>' +
          '<ol class="qr-pay__steps">' +
            q.instructions.map(function (s) { return "<li>" + FYX_UI.esc(s) + "</li>"; }).join("") +
          "</ol>" +
        "</div>" +
      "</div>" +
      '<div class="alert alert--info mt-16">Selepas transfer, hantar bukti pembayaran ke WhatsApp kami. Pesanan disahkan oleh staf, kemudian key dihantar.</div>';
    setPayHint("Pesanan disahkan oleh staf selepas bukti pembayaran diterima.");
    renderTotals();
  }

  /* ---------------------------------------------------------------- discount */
  document.getElementById("apply-discount").addEventListener("click", function () {
    var code = document.getElementById("c-discount").value.trim();
    var msg = document.getElementById("discount-msg");
    if (!code) {
      msg.textContent = "Masukkan kod diskaun.";
      return;
    }
    var subtotal = FYX_UI.cart.subtotal();
    if (!subtotal) {
      msg.textContent = "Bakul kosong.";
      return;
    }
    this.disabled = true;
    var self = this;
    FYX.data
      .applyDiscount({ code: code, subtotal: subtotal, email: document.getElementById("c-email").value.trim() })
      .then(function (r) {
        if (r && r.valid) {
          state.discount = r;
          msg.textContent = "✓ " + (r.message || "Kod digunakan.") + " (-" + FYX_UI.money(r.discount_amount) + ")";
          msg.style.color = "#86efac";
        } else {
          state.discount = null;
          msg.textContent = "✕ " + ((r && r.message) || "Kod tidak sah.");
          msg.style.color = "#fca5a5";
        }
        renderTotals();
      })
      .catch(function (e) {
        state.discount = null;
        msg.textContent = "✕ " + e.message;
        msg.style.color = "#fca5a5";
      })
      .finally(function () {
        self.disabled = false;
      });
  });

  /* ------------------------------------------------------------ place order */
  document.getElementById("place-order").addEventListener("click", function () {
    if (state.submitting) return;
    hideAlert();

    var email = document.getElementById("c-email").value.trim();
    var name = document.getElementById("c-name").value.trim();
    var wa = document.getElementById("c-wa").value.trim();
    var gameId = document.getElementById("c-gameid").value.trim();
    var serverId = document.getElementById("c-server").value.trim();
    var note = document.getElementById("c-note").value.trim();
    var items = FYX_UI.cart.list();

    if (!items.length) return showAlert("Bakul anda kosong.");
    if (name.length < 2) return showAlert("Sila masukkan nama penuh.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert("Sila masukkan email yang sah.");
    if (!/^[0-9+\-\s]{8,}$/.test(wa)) return showAlert("Sila masukkan nombor WhatsApp yang sah.");

    state.submitting = true;
    this.disabled = true;
    this.textContent = "Memproses...";

    var payload = {
      customer: { name: name, email: email, whatsapp: wa, game_id: gameId || null, server_id: serverId || null },
      items: items.map(function (i) {
        return { product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity || 1 };
      }),
      discount_code: state.discount ? state.discount.code : null,
      payment_method: state.payment_method || null,
      notes: note || null,
    };

    FYX.data
      .createOrder(payload)
      .then(function (order) {
        sessionStorage.setItem("fyx_buyer_email", email);
        // QR transfer mode: show the QR + proof instructions. A payment is never
        // treated as confirmed here — a staff member verifies the transfer.
        if (state.payment_mode === "qr") {
          openConfirmQr(order, name);
          return;
        }
        // Gateway mode: start payment BEFORE showing confirmation so the
        // checkout_url can be surfaced. Still never treated as paid here.
        return FYX.data
          .createPayment(order.order_code, state.payment_method)
          .then(function (pay) { openConfirm(order, pay); })
          .catch(function (e) { openConfirm(order, null, e); });
      })
      .catch(function (err) {
        showAlert(err.message || "Gagal membuat pesanan.");
      })
      .finally(function () {
        state.submitting = false;
        var b = document.getElementById("place-order");
        b.disabled = false;
        b.textContent = "Buat Pesanan";
      });
  });

  function openConfirm(order, payment, payError) {
    FYX_UI.cart.clear();
    document.getElementById("confirm-code").textContent = order.order_code;
    document.getElementById("confirm-track").href = "track-order.html?code=" + encodeURIComponent(order.order_code);

    var checkoutUrl = payment && payment.checkout_url;
    var body = document.getElementById("confirm-body");
    if (checkoutUrl) {
      document.getElementById("confirm-pay").href = checkoutUrl;
      document.getElementById("confirm-pay").style.display = "";
      body.innerHTML = '<div class="alert alert--info mt-16">Teruskan ke halaman pembayaran yang selamat untuk menyelesaikan bayaran <b>' +
        FYX_UI.money(order.total) + "</b>." +
        (payment.provider ? " Gateway: <b>" + FYX_UI.esc(String(payment.provider)) + "</b>." : "") +
        "</div>";
    } else {
      document.getElementById("confirm-pay").style.display = "none";
      var warn = (payment && payment.message) || (payError && payError.message) ||
        "Pembayaran tidak dapat dimulakan. Konfigurasikan gateway (ToyyibPay/CHIP) pada backend.";
      body.innerHTML = '<div class="alert alert--warn mt-16">' + FYX_UI.esc(warn) +
        " Pesanan anda telah disimpan — gunakan halaman <b>Lacak Pesanan</b> dengan kod di atas.</div>";
    }
    document.getElementById("confirm-modal").classList.add("is-open");
  }

  /* QR transfer confirmation: show the QR, amount and a WhatsApp proof button. */
  function openConfirmQr(order, buyerName) {
    FYX_UI.cart.clear();
    var q = qrConfig();
    document.getElementById("confirm-code").textContent = order.order_code;
    document.getElementById("confirm-track").href =
      "track-order.html?code=" + encodeURIComponent(order.order_code);

    document.getElementById("confirm-body").innerHTML =
      '<div class="qr-pay mt-16">' +
        '<div class="qr-pay__code"><img src="' + FYX_UI.esc(q.image) + '" alt="Kod QR pembayaran" width="200" height="200"/></div>' +
        '<div class="qr-pay__meta">' +
          '<div class="qr-pay__payee">Bayar kepada <b>' + FYX_UI.esc(q.payee) + "</b></div>" +
          '<div class="qr-pay__amount">Jumlah <b>' + FYX_UI.money(order.total) + "</b></div>" +
          '<div class="alert alert--info mt-16">Imbas QR, transfer <b>jumlah tepat</b>, kemudian hantar bukti WhatsApp. Key dihantar selepas staf mengesahkan pembayaran.</div>' +
        "</div>" +
      "</div>";

    var wa = String(C.WHATSAPP || "").replace(/[^0-9]/g, "");
    var msg =
      "Saya sudah buat pembayaran untuk pesanan " + order.order_code +
      " (" + FYX_UI.money(order.total) + ")" + (buyerName ? " atas nama " + buyerName : "") +
      ". Ini bukti pembayaran saya:";
    var pay = document.getElementById("confirm-pay");
    if (wa) {
      pay.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(msg);
      pay.textContent = "Hantar Bukti ke WhatsApp";
      pay.style.display = "";
    } else {
      pay.style.display = "none";
    }
    document.getElementById("confirm-modal").classList.add("is-open");
  }

  /* -------------------------------------------------------------------- init */
  renderLines();
  // Settings may override the QR image / payee / instructions, so fetch first.
  FYX.data
    .getSettings()
    .then(function (s) { state.settings = s || {}; })
    .catch(function () { state.settings = {}; })
    .finally(function () { renderPaymentMethods(); });

  // prefill email saved from the product page
  var saved = sessionStorage.getItem("fyx_buyer_email");
  if (saved) document.getElementById("c-email").value = saved;

  document.addEventListener("fyx:cart", renderLines);
})();
