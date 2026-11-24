/* ==========================================================================
   FYXITERZ — products.js
   Catalogue page: category filter, live search, sorting and grid rendering.
   ========================================================================== */

(function () {
  "use strict";

  FYX_UI.init({ active: "products" });

  var state = {
    cat: FYX_UI.param("cat") || "",
    q: FYX_UI.param("q") || "",
    sort: FYX_UI.param("sort") || "bestseller",
    all: [],
    cats: [],
  };

  var grid = document.getElementById("grid");
  var countEl = document.getElementById("result-count");
  var subEl = document.getElementById("page-sub");
  var searchEl = document.getElementById("filter-search");
  var sortEl = document.getElementById("sort-select");

  if (state.q) searchEl.value = state.q;
  sortEl.value = normSort(state.sort);

  function normSort(s) {
    // "bestseller" comes from the homepage link; map to the select's default
    return ["price-asc", "price-desc", "name-asc", "newest"].indexOf(s) >= 0 ? s : "bestseller";
  }

  function renderChips() {
    var el = document.getElementById("cats");
    var html = '<a class="chip' + (!state.cat ? " is-active" : "") + '" href="products.html">SEMUA</a>';
    state.cats.forEach(function (c) {
      html += '<a class="chip' + (state.cat === c.slug ? " is-active" : "") + '" href="?cat=' +
        encodeURIComponent(c.slug) + '">' + FYX_UI.esc(c.name.toUpperCase()) + "</a>";
    });
    el.innerHTML = html;
  }

  function apply() {
    var list = state.all.slice();
    if (state.q) {
      var q = state.q.toLowerCase();
      list = list.filter(function (p) {
        return (p.name + " " + (p.description || "") + " " + ((p.category && p.category.name) || ""))
          .toLowerCase().indexOf(q) >= 0;
      });
    }
    if (state.sort === "price-asc") list.sort(function (a, b) { return a.regular_price - b.regular_price; });
    else if (state.sort === "price-desc") list.sort(function (a, b) { return b.regular_price - a.regular_price; });
    else if (state.sort === "name-asc") list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (state.sort === "newest") list.reverse();
    else list.sort(function (a, b) { return (b.sales_count || 0) - (a.sales_count || 0); });

    countEl.textContent = list.length + " produk";
    grid.innerHTML = list.length ? list.map(FYX_UI.card).join("") : FYX_UI.emptyState("Tiada produk sepadan dijumpai.");
  }

  function load() {
    grid.innerHTML = FYX_UI.skeletonCards(8);
    FYX.data
      .getProducts({ category: state.cat || undefined })
      .then(function (products) {
        state.all = products || [];
        apply();
      })
      .catch(function (err) {
        grid.innerHTML = FYX_UI.emptyState(err.message || "Gagal memuatkan produk.");
      });
  }

  FYX.data.getCategories().then(function (cats) {
    state.cats = cats || [];
    renderChips();
    if (state.cat) {
      var c = state.cats.filter(function (x) { return x.slug === state.cat; })[0];
      if (c) subEl.textContent = "Kategori: " + c.name + " — update real-time";
    }
    load();
  });

  var t;
  searchEl.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      state.q = searchEl.value.trim();
      apply();
    }, 160);
  });

  sortEl.addEventListener("change", function () {
    state.sort = sortEl.value;
    apply();
  });
})();
