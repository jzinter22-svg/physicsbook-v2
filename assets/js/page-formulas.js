/* Formula Reference page (formulas/index.html). Reuses window.PBSearch's
   already-fetched, already-normalized index (no second fetch, no
   duplicated Arabic-normalization logic) and window.PBToolsShell for the
   header/subnav + MathJax retypeset helper. */
(function(){
  "use strict";

  var DEBOUNCE_MS = 150;
  var chapters = [];
  var chapterByNum = {};
  var lessonByHref = {};
  var formulaItems = [];
  var state = {query: "", chapter: "all"};

  function render(){
    var grid = document.getElementById("formulaGrid");
    var countEl = document.getElementById("formulaCount");
    var qNorm = window.PBSearch.normalizeArabic(state.query);
    var regex = state.query ? window.PBSearch.buildFuzzyRegex(state.query) : null;

    var list = formulaItems.filter(function(it){
      if(state.chapter !== "all" && it.chapterNum !== state.chapter) return false;
      if(qNorm && it.norm.indexOf(qNorm) === -1) return false;
      return true;
    });

    countEl.textContent = list.length ? (list.length + " قانون") : "";

    if(!list.length){
      grid.innerHTML = '<div class="tools-emptystate"><span class="icon" aria-hidden="true">📐</span>' +
        "لا توجد قوانين مطابقة لبحثك. جرّب كلمة أخرى أو غيّر تصفية الفصل.</div>";
      return;
    }

    var esc = window.PBSearch.escapeHtml;
    var hl = function(s){ return regex ? window.PBSearch.highlight(s, regex) : esc(s); };

    grid.innerHTML = list.map(function(it){
      var chapter = chapterByNum[it.chapterNum];
      var lesson = lessonByHref[it.href];
      var crumbs = (chapter ? "الفصل " + chapter.num + ": " + chapter.title : "") +
        (lesson ? " · " + lesson.title : "");
      var qtyHtml = (it.quantities || []).map(function(q){
        return '<span class="formula-qty-chip"><b>' + esc(q.symbol) + "</b> " + esc(q.name) +
          " — " + esc(q.unit) + "</span>";
      }).join("");
      return (
        '<article class="formula-card">' +
          '<div class="formula-card-crumbs">' + esc(crumbs) + "</div>" +
          '<div class="formula-card-title">' + hl(it.title || "") + "</div>" +
          '<div class="formula-eq">' + (it.raw || esc(it.formula || "")) + "</div>" +
          (it.explanation ? '<p class="formula-explain">' + hl(it.explanation) + "</p>" : "") +
          (qtyHtml ? '<div class="formula-quantities">' + qtyHtml + "</div>" : "") +
          '<a class="formula-card-open" href="../' + esc(it.href) + '">فتح الدرس ←</a>' +
        "</article>"
      );
    }).join("");

    window.PBToolsShell.retypeset([grid]);
  }

  function buildFilters(){
    var wrap = document.getElementById("formulaFilters");
    var html = '<button type="button" class="tools-chip is-active" data-chapter="all">الكل</button>';
    chapters.forEach(function(c){
      html += '<button type="button" class="tools-chip" data-chapter="' + c.num + '">الفصل ' + c.num + "</button>";
    });
    wrap.innerHTML = html;
    wrap.addEventListener("click", function(e){
      var chip = e.target.closest(".tools-chip");
      if(!chip) return;
      wrap.querySelectorAll(".tools-chip").forEach(function(c){ c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      var v = chip.getAttribute("data-chapter");
      state.chapter = v === "all" ? "all" : Number(v);
      render();
    });
  }

  function init(){
    window.PBToolsShell.init("formulas", function(){
      window.PBSearch.fetchIndex().then(function(data){
        chapters = data.chapters;
        chapters.forEach(function(c){ chapterByNum[c.num] = c; });
        data.lessons.forEach(function(l){ lessonByHref[l.href] = l; });
        formulaItems = data.items.filter(function(it){ return it.type === "formula"; });
        buildFilters();
        render();

        var input = document.getElementById("formulaSearch");
        var timer = null;
        input.addEventListener("input", function(){
          clearTimeout(timer);
          timer = setTimeout(function(){ state.query = input.value.trim(); render(); }, DEBOUNCE_MS);
        });
      }).catch(function(){
        document.getElementById("formulaGrid").innerHTML =
          '<div class="tools-emptystate"><span class="icon">⚠️</span>تعذّر تحميل فهرس القوانين.</div>';
      });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
