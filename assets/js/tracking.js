/* ==========================================================================
   FYXITERZ — tracking.js
   Order tracking: email + order code -> live status timeline and delivery.
   ========================================================================== */

(function () {
  "use strict";

  FYX_UI.init({ active: "track" });

  var emailEl = document.getElementById("t-email");
  var codeEl = document.getElementById("t-code");
  var btn = document.getElementById("track-btn");
  var alertEl = document.getElementById("track-alert");
  var resultEl = document.getElementById("track-result");

  var savedEmail = sessionStorage.getItem("fyx_buyer_email");
  if (savedEmail) emailEl.value = savedEmail;
  var preCode = FYX_UI.param("code");
  if (preCode) codeEl.value = preCode;

  var STAGES = [
    { key: "pending", label: "Pesanan Dibuat", desc: "Menunggu pembayaran" },
    { key: "paid", label: "Pembayaran Disahkan", desc: "Bayaran diterima" },
    { key: "processing", label: "Sedang Diproses", desc: "Key disediakan" },
    { key: "completed", label: "Selesai", desc: "Key dihantar ke email" },
  ];

  function showAlert(m) {
    alertEl.textContent = m;
    alertEl.classList.remove("alert--hidden");
  }

  function stageIndex(status) {
    var i = STAGES.map(function (s) { return s.key; }).indexOf(status);
    return i < 0 ? 0 : i;
  }

  function render(order) {
    var idx = stageIndex(order.status);
    var paid = order.payment_status === "paid";

    var steps = STAGES.map(function (s, i) {
      var cls = i < idx ? "is-done" : i === idx ? (i === idx && idx === STAGES.length - 1 ? "is-done" : "is-current") : "";
      if (paid && i === 1) cls = "is-done";
      var time = "";
      if (i === 0 && order.created_at) time = fmt(order.created_at);
      if (i === 1 && order.paid_at) time = fmt(order.paid_at);
      if (i === 3 && order.completed_at) time = fmt(order.completed_at);
      return (
        '<div class="step ' + cls + '">' +
        '<div class="step__dot">' + (i < idx || (paid && i === 1) ? FYX_UI.icon("check", 13) : i + 1) + "</div>" +
        "<div><div class=\"step__title\">" + s.label + "</div>" +
        '<div class="step__time">' + (time || s.desc) + "</div></div></div>"
      );
    }).join("");

    var items = (order.items || [])
      .map(function (i) {
        return (
          '<div class="cart-line"><div class="cart-line__info">' +
          '<div class="cart-line__name">' + FYX_UI.esc(i.product_name) + "</div>" +
          '<div class="cart-line__sub">' + (i.variant_name ? FYX_UI.esc(i.variant_name) + " • " : "") + "x" + i.quantity + "</div></div>" +
          '<b style="font-size:13px">' + FYX_UI.money(i.subtotal) + "</b></div>"
        );
      })
      .join("");

    var deliveries = (order.deliveries && order.deliveries.length)
      ? '<div class="card mt-16"><div class="card__title">Penghantaran</div>' +
        order.deliveries.map(function (d) {
          return '<div class="summary-row"><span>' + FYX_UI.esc(d.product_name) + '</span><b class="mono">' + FYX_UI.esc(d.delivered_content || "—") + "</b></div>";
        }).join("") + "</div>"
      : "";

    resultEl.innerHTML =
      '<div class="card">' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">' +
      '<div><div class="text-faint" style="font-size:11px;letter-spacing:1px">KOD PESANAN</div>' +
      '<div class="mono" style="font-size:20px;font-weight:800">' + FYX_UI.esc(order.order_code) + "</div></div>" +
      '<div style="display:flex;gap:8px">' +
      '<span class="status-pill status-pill--' + order.status + '">' + order.status + "</span>" +
      '<span class="status-pill status-pill--' + order.payment_status + '">' + order.payment_status + "</span>" +
      "</div></div>" +
      '<div class="steps mt-24">' + steps + "</div>" +
      '<div class="summary-row summary-row--total"><span>Jumlah</span><b>' + FYX_UI.money(order.total) + "</b></div>" +
      "</div>" +
      '<div class="card mt-16"><div class="card__title">Item</div>' + items + "</div>" +
      deliveries;
  }

  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return iso;
    }
  }

  function track() {
    var email = emailEl.value.trim();
    var code = codeEl.value.trim().toUpperCase();
    alertEl.classList.add("alert--hidden");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert("Sila masukkan email yang sah.");
    if (!code) return showAlert("Sila masukkan kode pesanan.");

    btn.disabled = true;
    btn.textContent = "Mencari...";
    sessionStorage.setItem("fyx_buyer_email", email);

    FYX.data
      .trackOrder({ email: email, order_code: code })
      .then(function (order) {
        render(order);
      })
      .catch(function (err) {
        resultEl.innerHTML = "";
        showAlert(err.message || "Pesanan tidak dijumpai.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Lacak Pesanan";
      });
  }

  btn.addEventListener("click", track);
  [emailEl, codeEl].forEach(function (el) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") track();
    });
  });

  if (preCode && savedEmail) track();
})();
