/* ==========================================================================
   FYXITERZ — authentication.js
   Staff authentication (Supabase Auth) + shared dashboard shell (FYX_DASH).

   Roles: owner, admin, reseller. Customer login is NOT required.
   Route protection here is a UX guard only — every privileged operation is
   re-verified on the backend (RLS + Edge Function role checks). In demo mode
   (no Supabase configured) the guard is client-side and clearly labelled.
   ========================================================================== */

window.FYX_DASH = (function () {
  "use strict";

  var C = window.FYX_CONFIG || {};
  var SESSION_ROLE_KEY = "fyx_staff_profile";

  /* ------------------------------------------------------------------ icons */
  var ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V4a1 1 0 011-1h8a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8a2 2 0 00-2-2H5a2 2 0 010-4h13v4"/><path d="M3 6v12a2 2 0 002 2h15v-8H5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11h.1a2 2 0 110 4H21"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg>',
  };

  function icon(n) { return ICONS[n] || ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function money(n) { return (C.CURRENCY_SYMBOL || "RM") + " " + (Number(n) || 0).toFixed(2); }
  function date(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("ms-MY", { day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return iso; }
  }
  function dateTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return iso; }
  }

  function toast(msg, type) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    var t = document.createElement("div");
    t.className = "toast" + (type === "ok" ? " toast--ok" : "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 3200);
  }

  /* -------------------------------------------------------------------- auth */
  var DemoSession = {
    key: "fyx_demo_staff",
    get: function () {
      try { return JSON.parse(localStorage.getItem(this.key) || "null"); } catch (e) { return null; }
    },
    set: function (p) { localStorage.setItem(this.key, JSON.stringify(p)); },
    clear: function () { localStorage.removeItem(this.key); },
  };

  var auth = {
    login: function (email, password) {
      if (!FYX.configured) return Promise.reject(new Error("Demo mode: autentikasi memerlukan Supabase."));
      return FYX.auth.signIn(email, password);
    },
    demoLogin: function (role) {
      var names = { owner: "Pemilik Demo", admin: "Admin Demo", reseller: "Reseller Demo" };
      DemoSession.set({ id: "demo-" + role, email: role + "@fyxiterz.com", full_name: names[role] || "Demo", role: role, demo: true });
      return Promise.resolve(DemoSession.get());
    },
    logout: function () {
      DemoSession.clear();
      return FYX.auth.signOut().then(function () { location.href = "staff-login.html"; });
    },
    profile: function () {
      if (!FYX.configured) return Promise.resolve(DemoSession.get());
      var cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(SESSION_ROLE_KEY) || "null"); } catch (e) {}
      if (cached) return Promise.resolve(cached);
      return FYX.auth.getUser().then(function (u) {
        if (!u) return null;
        return FYX.rest
          .get("profiles", "select=id,email,full_name,role,is_active&id=eq." + u.id + "&limit=1")
          .then(function (rows) {
            var p = rows && rows[0];
            if (!p) return { id: u.id, email: u.email, role: "customer" };
            sessionStorage.setItem(SESSION_ROLE_KEY, JSON.stringify(p));
            return p;
          });
      });
    },
    resetPassword: function (email) { return FYX.auth.resetPassword(email); },
  };

  function guard(allowed) {
    return auth.profile().then(function (p) {
      if (!p || !p.role || allowed.indexOf(p.role) < 0 || p.is_active === false) {
        location.href = "staff-login.html?denied=" + encodeURIComponent(allowed.join(","));
        throw new Error("unauthorized");
      }
      return p;
    });
  }

  /* ---------------------------------------------------------------- shell */
  var current = { sections: {}, active: null, profile: null, nav: [] };

  function mountShell(opts) {
    current.sections = opts.sections || {};
    current.nav = opts.nav || [];
    current.active = opts.default || (current.nav[0] && current.nav[0].key);

    var app = document.getElementById("app");
    app.innerHTML =
      '<aside class="sidebar" id="sidebar"></aside>' +
      '<div class="sidebar-backdrop" id="sidebar-backdrop"></div>' +
      '<div class="main">' +
      '<header class="topbar" id="topbar"></header>' +
      '<div class="content" id="content"></div>' +
      "</div>";

    var modalBackdrop = document.createElement("div");
    modalBackdrop.className = "modal-backdrop";
    modalBackdrop.id = "modal";
    document.body.appendChild(modalBackdrop);

    renderSidebar();
    renderTopbar();
    wireNav();

    if (FYX.demo) {
      var banner = document.createElement("div");
      banner.className = "db-alert db-alert--warn";
      banner.style.margin = "0";
      banner.style.borderRadius = "0";
      banner.textContent = "DEMO VIEW — Supabase belum dikonfigurasi. Anda melihat contoh antara muka; operasi tulis sebenar dilindungi pelayan.";
      document.getElementById("content").appendChild(banner);
    }

    var promptSection = new URLSearchParams(location.search).get("section");
    go(promptSection && current.sections[promptSection] ? promptSection : current.active);
  }

  function renderSidebar() {
    var p = current.profile || {};
    var navHtml = "";
    var groups = {};
    current.nav.forEach(function (n) {
      var g = n.group || "Utama";
      (groups[g] = groups[g] || []).push(n);
    });
    Object.keys(groups).forEach(function (g) {
      navHtml += '<div class="side-nav__label">' + esc(g) + "</div>";
      groups[g].forEach(function (n) {
        navHtml +=
          '<a class="side-link' + (n.key === current.active ? " is-active" : "") + '" data-key="' + n.key + '" href="#' + n.key + '">' +
          icon(n.icon) + esc(n.label) + "</a>";
      });
    });

    document.getElementById("sidebar").innerHTML =
      '<a class="sidebar__brand" href="index.html">' +
      '<img src="assets/img/logo2.svg" alt="' + esc(C.SITE_NAME) + '"/>' +
      '<span class="sidebar__role">' + esc((p.role || "").toUpperCase()) + "</span></a>" +
      '<nav class="side-nav">' + navHtml + "</nav>" +
      '<div class="sidebar__foot">' + esc(C.SITE_NAME) + " Console<br/>v1.0.0</div>";
  }

  function renderTopbar() {
    var p = current.profile || {};
    var nav = current.nav.filter(function (n) { return n.key === current.active; })[0] || {};
    document.getElementById("topbar").innerHTML =
      '<div class="topbar__left">' +
      '<button class="burger" id="burger">' + icon("menu") + "</button>" +
      '<div><div class="topbar__title">' + esc(nav.label || "Dashboard") + "</div>" +
      '<div class="topbar__sub">FYXITERZ Console • ' + esc((p.role || "")) + "</div></div></div>" +
      '<div class="topbar__right">' +
      '<a class="btn btn--ghost btn--sm" href="index.html" title="Lihat Kedai">' + icon("globe") + '<span class="btn-label">Lihat Kedai</span></a>' +
      '<button class="btn btn--danger btn--sm" id="logout-btn" title="Log Keluar">' + icon("logout") + '<span class="btn-label">Log Keluar</span></button>' +
      '<div class="userchip"><span class="avatar">' + esc((p.full_name || p.email || "?").charAt(0)) + "</span>" +
      '<span class="userchip__name">' + esc(p.full_name || p.email) + "</span></div>" +
      "</div>";

    document.getElementById("logout-btn").addEventListener("click", function () { auth.logout(); });
    var burger = document.getElementById("burger");
    var sb = document.getElementById("sidebar");
    var bd = document.getElementById("sidebar-backdrop");
    burger.addEventListener("click", function () { sb.classList.add("is-open"); bd.classList.add("is-open"); });
    bd.addEventListener("click", function () { sb.classList.remove("is-open"); bd.classList.remove("is-open"); });
  }

  function wireNav() {
    document.querySelectorAll(".side-link").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        go(a.getAttribute("data-key"));
        document.getElementById("sidebar").classList.remove("is-open");
        document.getElementById("sidebar-backdrop").classList.remove("is-open");
      });
    });
  }

  function go(key) {
    if (!current.sections[key]) return;
    current.active = key;
    history.replaceState(null, "", "#" + key);
    document.querySelectorAll(".side-link").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-key") === key);
    });
    var nav = current.nav.filter(function (n) { return n.key === key; })[0] || {};
    var t = document.querySelector(".topbar__title");
    if (t) t.textContent = nav.label || "Dashboard";
    var content = document.getElementById("content");
    var banner = content.querySelector(".db-alert");
    content.innerHTML = "";
    if (banner) content.appendChild(banner);
    current.sections[key](content);
  }

  /* ------------------------------------------------------------------ modal */
  function openModal(title, bodyHtml) {
    var m = document.getElementById("modal");
    m.innerHTML =
      '<div class="modal"><div class="modal__head"><div class="modal__title">' + esc(title) + "</div>" +
      '<button class="modal__close" id="modal-close">' + icon("x") + "</button></div>" +
      '<div id="modal-body">' + bodyHtml + "</div></div>";
    m.classList.add("is-open");
    document.getElementById("modal-close").addEventListener("click", closeModal);
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(); });
    return m;
  }
  function closeModal() {
    var m = document.getElementById("modal");
    if (m) { m.classList.remove("is-open"); m.innerHTML = ""; }
  }

  /* ----------------------------------------------------------------- helpers */
  function statusPill(s) { return '<span class="pill pill--' + esc(s) + '">' + esc(s) + "</span>"; }

  function table(cols, rows, empty) {
    if (!rows || !rows.length) return '<div class="tbl-empty">' + esc(empty || "Tiada data.") + "</div>";
    return (
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      cols.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr>" + cols.map(function (c) { return "<td" + (c.nowrap ? ' class="nowrap"' : "") + ">" + c.render(r) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>"
    );
  }

  function statCard(label, value, iconName, cls) {
    return (
      '<div class="stat ' + (cls || "") + '">' +
      '<div class="stat__label">' + (iconName ? icon(iconName) : "") + esc(label) + "</div>" +
      '<div class="stat__value">' + value + "</div></div>"
    );
  }

  function spinner() { return '<div class="db-spinner"></div>'; }

  return {
    auth: auth,
    guard: guard,
    mountShell: mountShell,
    go: go,
    setProfile: function (p) { current.profile = p; },
    getProfile: function () { return current.profile; },
    icon: icon,
    esc: esc,
    money: money,
    date: date,
    dateTime: dateTime,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    statusPill: statusPill,
    table: table,
    statCard: statCard,
    spinner: spinner,
  };
})();
