/* Terminology Dictionary page (dictionary/index.html). Reuses
   window.PBSearch's fetched/normalized index — no second fetch, no
   duplicated Arabic-normalization or highlighting logic. */
(function(){
  "use strict";

  var DEBOUNCE_MS = 150;
  var chapters = [];
  var chapterByNum = {};
  var lessonByHref = {};
  var terms = []; // {item, term, sortKey}
  var state = {query: "", chapter: "all"};
  var collator = (window.Intl && Intl.Collator) ? new Intl.Collator("ar") : null;

  // Sorting AND the letter-group headers both key off the same
  // Arabic-normalized string (see search.js's normalizeArabic — folds
  // hamza-alef variants to one form), so "أحمد"/"استخلاص"/"آلة" all land
  // in one "ا" group in a stable order, instead of alphabetizing by raw
  // hamza-carrier and interleaving near-identical letters.

  function stripNumberPrefix(s){
    return (s || "").replace(/^[\d٠-٩\-.\s]+/, "").trim() || s;
  }

  function render(){
    var container = document.getElementById("dictResults");
    var countEl = document.getElementById("dictCount");
    var qNorm = window.PBSearch.normalizeArabic(state.query);
    var regex = state.query ? window.PBSearch.buildFuzzyRegex(state.query) : null;

    var list = terms.filter(function(t){
      if(state.chapter !== "all" && t.item.chapterNum !== state.chapter) return false;
      if(qNorm && t.item.norm.indexOf(qNorm) === -1) return false;
      return true;
    });

    countEl.textContent = list.length ? (list.length + " مصطلح") : "";

    if(!list.length){
      container.innerHTML = '<div class="tools-emptystate"><span class="icon" aria-hidden="true">📖</span>' +
        "لا توجد مصطلحات مطابقة لبحثك.</div>";
      return;
    }

    var esc = window.PBSearch.escapeHtml;
    var hl = function(s){ return regex ? window.PBSearch.highlight(s, regex) : esc(s); };

    var html = "";
    var lastLetter = null;
    list.forEach(function(t){
      var letter = t.sortKey.charAt(0).toUpperCase();
      var openGroup = letter !== lastLetter;
      if(openGroup){
        if(lastLetter !== null) html += "</div></div>";
        html += '<div class="dict-group"><h2 class="dict-letter">' + esc(letter) + '</h2><div class="dict-grid">';
        lastLetter = letter;
      }
      var chapter = chapterByNum[t.item.chapterNum];
      var lesson = lessonByHref[t.item.href];
      var crumbs = (chapter ? "الفصل " + chapter.num + ": " + chapter.title : "") + (lesson ? " · " + lesson.title : "");
      html +=
        '<article class="dict-card">' +
          '<div class="dict-term">' + hl(t.term) + "</div>" +
          '<div class="dict-def">' + hl(t.item.text || "") + "</div>" +
          '<div class="dict-card-crumbs">' + esc(crumbs) + "</div>" +
          '<a class="dict-card-open" href="../' + esc(t.item.href) + '">فتح الدرس ←</a>' +
        "</article>";
    });
    html += "</div></div>";
    container.innerHTML = html;
  }

  function buildFilters(){
    var wrap = document.getElementById("dictFilters");
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
    window.PBToolsShell.init("dictionary", function(){
      window.PBSearch.fetchIndex().then(function(data){
        chapters = data.chapters;
        chapters.forEach(function(c){ chapterByNum[c.num] = c; });
        data.lessons.forEach(function(l){ lessonByHref[l.href] = l; });

        terms = data.items
          .filter(function(it){ return it.type === "definition"; })
          .map(function(it){
            var term = stripNumberPrefix(it.title);
            return {item: it, term: term, sortKey: window.PBSearch.normalizeArabic(term)};
          })
          .sort(function(a, b){
            return collator ? collator.compare(a.sortKey, b.sortKey) : (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0);
          });

        buildFilters();
        render();

        var input = document.getElementById("dictSearch");
        var timer = null;
        input.addEventListener("input", function(){
          clearTimeout(timer);
          timer = setTimeout(function(){ state.query = input.value.trim(); render(); }, DEBOUNCE_MS);
        });
      }).catch(function(){
        document.getElementById("dictResults").innerHTML =
          '<div class="tools-emptystate"><span class="icon">⚠️</span>تعذّر تحميل فهرس المصطلحات.</div>';
      });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
