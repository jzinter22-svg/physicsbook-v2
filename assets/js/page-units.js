/* Units & Conversion Center (units/index.html). Pure client-side converter
   — no server, no build step. Every unit stores {a,b} such that
   valueInSI = value*a + b (b is 0 for every linear unit and non-zero only
   for temperature), so convert() needs no special-casing per category. */
(function(){
  "use strict";

  var DATA_URL = "assets/data/units.json";
  var categories = [];

  function esc(s){ return window.PBSearch ? window.PBSearch.escapeHtml(s) : String(s); }

  function formatNumber(n){
    if(!isFinite(n)) return "—";
    var abs = Math.abs(n);
    if(abs !== 0 && (abs < 1e-4 || abs >= 1e9)){
      var parts = n.toExponential(4).split("e");
      return parts[0] + " × 10^" + parseInt(parts[1], 10);
    }
    return String(Number(n.toPrecision(6)));
  }

  function toSI(value, unit){ return value * unit.a + unit.b; }
  function fromSI(valueSI, unit){ return (valueSI - unit.b) / unit.a; }
  function convert(cat, value, fromId, toId){
    var from = cat.units.filter(function(u){ return u.id === fromId; })[0];
    var to = cat.units.filter(function(u){ return u.id === toId; })[0];
    if(!from || !to) return NaN;
    return fromSI(toSI(value, from), to);
  }

  function unitOptions(units, selectedId){
    return units.map(function(u){
      return '<option value="' + u.id + '"' + (u.id === selectedId ? " selected" : "") + ">" +
        esc(u.name) + " (" + esc(u.symbol) + ")</option>";
    }).join("");
  }

  function categoryHtml(cat){
    var defaultFrom = cat.units[0].id;
    var defaultTo = cat.units[1] ? cat.units[1].id : cat.units[0].id;
    var tableRows = cat.units.map(function(u){
      return "<tr><td>" + esc(u.name) + " (" + esc(u.symbol) + ")</td><td>1 " + esc(u.symbol) + " = " +
        formatNumber(u.a) + " " + esc(cat.siSymbol) + (u.b ? " + " + formatNumber(u.b) : "") + "</td></tr>";
    }).join("");
    var formulaNote = cat.affine
      ? "درجة الحرارة تحويل خطي غير متجانس (affine): القيمة بالكلفن = القيمة × a + b لكل وحدة — راجع جدول التحويل أعلاه لقيم a و b الخاصة بكل وحدة."
      : "الصيغة العامة: (القيمة بوحدة المصدر × معامل وحدة المصدر) ÷ معامل وحدة الهدف = القيمة بوحدة الهدف.";

    return (
      '<section class="units-category neu fade-up" id="cat-' + cat.id + '" data-cat-name="' + esc(cat.name) + '">' +
        '<div class="units-cat-head">' +
          '<span class="units-cat-icon" aria-hidden="true">' + cat.icon + "</span>" +
          "<div><h2>" + esc(cat.name) + "</h2><span class=\"units-cat-si\">الوحدة الأساسية (SI): " +
            esc(cat.siName) + " (" + esc(cat.siSymbol) + ")</span></div>" +
        "</div>" +
        '<div class="units-converter" data-cat="' + cat.id + '">' +
          '<div class="units-converter-row">' +
            '<input type="number" class="units-input" value="1" data-role="value" aria-label="القيمة — ' + esc(cat.name) + '">' +
            '<select class="units-select" data-role="from" aria-label="من وحدة">' + unitOptions(cat.units, defaultFrom) + "</select>" +
            '<button type="button" class="units-swap" data-role="swap" aria-label="تبديل الوحدتين">⇄</button>' +
            '<select class="units-select" data-role="to" aria-label="إلى وحدة">' + unitOptions(cat.units, defaultTo) + "</select>" +
          "</div>" +
          '<div class="units-result" data-role="result">النتيجة: <b>—</b></div>' +
        "</div>" +
        '<details class="units-table-details"><summary>جدول التحويل (نسبة إلى الوحدة الأساسية)</summary>' +
          "<table><thead><tr><th>الوحدة</th><th>التحويل إلى " + esc(cat.siSymbol) + "</th></tr></thead><tbody>" +
          tableRows + "</tbody></table></details>" +
        '<p class="units-formula-note">' + formulaNote + "</p>" +
        '<p class="units-example" data-role="example"></p>' +
      "</section>"
    );
  }

  function updateConverter(section, cat){
    var conv = section.querySelector(".units-converter");
    var valueInput = conv.querySelector('[data-role="value"]');
    var fromSel = conv.querySelector('[data-role="from"]');
    var toSel = conv.querySelector('[data-role="to"]');
    var resultEl = conv.querySelector('[data-role="result"] b');
    var value = parseFloat(valueInput.value);
    if(isNaN(value)){ resultEl.textContent = "—"; return; }
    var result = convert(cat, value, fromSel.value, toSel.value);
    var fromU = cat.units.filter(function(u){ return u.id === fromSel.value; })[0];
    var toU = cat.units.filter(function(u){ return u.id === toSel.value; })[0];
    resultEl.textContent = formatNumber(value) + " " + fromU.symbol + " = " + formatNumber(result) + " " + toU.symbol;

    // "Examples" is a fixed illustrative statement (default from/to units,
    // value 1) computed with this exact same convert() function, so it can
    // never drift out of sync with the live converter's own math.
    var exEl = section.querySelector('[data-role="example"]');
    if(exEl && !exEl.dataset.filled){
      var exFrom = cat.units[0], exTo = cat.units[1] || cat.units[0];
      var exResult = convert(cat, 1, exFrom.id, exTo.id);
      exEl.textContent = "مثال: 1 " + exFrom.symbol + " = " + formatNumber(exResult) + " " + exTo.symbol;
      exEl.dataset.filled = "1";
    }
  }

  function wireConverter(section, cat){
    var conv = section.querySelector(".units-converter");
    ["input", "change"].forEach(function(evt){
      conv.addEventListener(evt, function(e){
        if(e.target.getAttribute("data-role") === "swap") return;
        updateConverter(section, cat);
      });
    });
    conv.querySelector('[data-role="swap"]').addEventListener("click", function(){
      var fromSel = conv.querySelector('[data-role="from"]');
      var toSel = conv.querySelector('[data-role="to"]');
      var tmp = fromSel.value;
      fromSel.value = toSel.value;
      toSel.value = tmp;
      updateConverter(section, cat);
    });
    updateConverter(section, cat);
  }

  function buildJumplist(){
    var wrap = document.getElementById("unitsJumplist");
    wrap.innerHTML = categories.map(function(cat){
      return '<a href="#cat-' + cat.id + '" data-cat-name="' + esc(cat.name) + '">' + cat.icon + " " + esc(cat.name) + "</a>";
    }).join("");
  }

  function wireFilter(){
    var input = document.getElementById("unitsFilter");
    var timer = null;
    input.addEventListener("input", function(){
      clearTimeout(timer);
      timer = setTimeout(applyFilter, 150);
    });
  }

  function applyFilter(){
    var q = window.PBSearch.normalizeArabic(document.getElementById("unitsFilter").value.trim());
    var visibleIds = [];
    categories.forEach(function(cat){
      var haystack = window.PBSearch.normalizeArabic(
        cat.name + " " + cat.units.map(function(u){ return u.name + " " + u.symbol; }).join(" ")
      );
      var match = !q || haystack.indexOf(q) !== -1;
      var section = document.getElementById("cat-" + cat.id);
      if(section) section.hidden = !match;
      if(match) visibleIds.push(cat.id);
    });
    document.querySelectorAll("#unitsJumplist a").forEach(function(a, i){
      a.hidden = visibleIds.indexOf(categories[i].id) === -1;
    });
  }

  function init(){
    window.PBToolsShell.init("units", function(){
      fetch(document.documentElement.getAttribute("data-assets") + DATA_URL)
        .then(function(r){ return r.json(); })
        .then(function(data){
          categories = data.categories;
          var wrap = document.getElementById("unitsCategories");
          wrap.innerHTML = categories.map(categoryHtml).join("");
          buildJumplist();
          categories.forEach(function(cat){
            wireConverter(document.getElementById("cat-" + cat.id), cat);
          });
          wireFilter();
          window.PBToolsShell.revealOnScroll();
        })
        .catch(function(){
          document.getElementById("unitsCategories").innerHTML =
            '<div class="tools-emptystate"><svg class="icon"><use href="#icon-alert-triangle"></use></svg>تعذّر تحميل بيانات الوحدات.</div>';
        });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
