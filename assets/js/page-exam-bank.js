/* Ministry-style Exam Bank page (exam-bank/index.html). Loads its own
   dataset (assets/data/exam-bank.ar.json — full questions + model answers,
   too large to duplicate inside the shared Smart Search index) via fetch(),
   same pattern as page-units.js's init(). Search still reuses
   window.PBSearch's normalizeArabic()/buildFuzzyRegex()/highlight()/
   escapeHtml() exactly like page-formulas.js and page-dictionary.js do —
   no second Arabic-normalization function here.

   highlight() escapes its input before wrapping matches, so it is only
   ever run against a PLAIN-TEXT snippet built from each question (tags and
   LaTeX delimiters stripped) — never against the question's real prompt/
   answer HTML, which contains trusted <b>/<br> markup and MathJax source
   that must reach the DOM untouched (the same reason formula-card's raw
   LaTeX field is inserted unescaped in page-formulas.js instead of being
   run through hl()). The full rich prompt/answer render below that
   snippet, unmodified, exactly like the book's own worked-example blocks. */
(function(){
  "use strict";

  var DEBOUNCE_MS = 150;
  var DATA_URL = "assets/data/exam-bank.ar.json";
  var SNIPPET_LEN = 110;

  var chapters = []; // [{num, title}]
  var items = []; // [{id, chapterNum, kind, prompt, answer, plain, norm}]
  var state = {query: "", chapter: "all"};
  var stripEl = null; // detached element reused to strip tags from trusted, static JSON strings

  var GREEK = {
    omega: "ω", alpha: "α", beta: "β", tau: "τ", lambda: "λ", rho: "ρ",
    theta: "θ", phi: "φ", varphi: "φ", mu: "μ", Delta: "Δ", delta: "δ",
    nu: "ν", epsilon: "ε"
  };
  // Mirrors tools/build-search-index.py's clean_text() LaTeX-unwrapping
  // rules (kept in sync by hand — this one only feeds a short display
  // snippet, so it doesn't need clean_text()'s full generality) so the
  // .examq-title preview never shows raw "\dfrac{...}" / "\text{...}"
  // command source the way a naive tag-strip + truncate would.
  function cleanMathText(s){
    if(!s) return "";
    s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "").replace(/\$\$?/g, "");
    s = s.replace(/\\text\{([^{}]*)\}/g, "$1");
    for(var pass = 0; pass < 2; pass++){
      s = s.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
    }
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    s = s.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\pm/g, "±");
    s = s.replace(/\\[,;:!]/g, " ");
    for(var name in GREEK){ s = s.split("\\" + name).join(GREEK[name]); }
    s = s.replace(/\\[A-Za-z]+/g, "");
    s = s.replace(/[{}\\]/g, "");
    return s.replace(/\s+/g, " ").trim();
  }

  function stripHtml(s){
    if(!s) return "";
    if(!stripEl) stripEl = document.createElement("div");
    stripEl.innerHTML = s;
    return (stripEl.textContent || "").replace(/\s+/g, " ").trim();
  }

  function render(){
    var list = document.getElementById("examqList");
    var countEl = document.getElementById("examqCount");
    var qNorm = window.PBSearch.normalizeArabic(state.query);
    var regex = state.query ? window.PBSearch.buildFuzzyRegex(state.query) : null;

    var filtered = items.filter(function(it){
      if(state.chapter !== "all" && it.chapterNum !== state.chapter) return false;
      if(qNorm && it.norm.indexOf(qNorm) === -1) return false;
      return true;
    });

    countEl.textContent = filtered.length ? (filtered.length + " سؤال") : "";

    if(!filtered.length){
      list.innerHTML = '<div class="tools-emptystate"><svg class="icon" aria-hidden="true"><use href="#icon-bank"></use></svg>' +
        "لا توجد أسئلة مطابقة لبحثك. جرّب كلمة أخرى أو غيّر تصفية الفصل.</div>";
      return;
    }

    var esc = window.PBSearch.escapeHtml;
    var hl = function(s){ return regex ? window.PBSearch.highlight(s, regex) : esc(s); };
    var chapterByNum = {};
    chapters.forEach(function(c){ chapterByNum[c.num] = c; });

    list.innerHTML = filtered.map(function(it){
      var chapter = chapterByNum[it.chapterNum];
      var crumbs = chapter ? ("الفصل " + chapter.num + ": " + chapter.title) : "";
      var snippet = it.plainPrompt.length > SNIPPET_LEN
        ? it.plainPrompt.slice(0, SNIPPET_LEN).trim() + "…"
        : it.plainPrompt;
      var ansId = "examq-ans-" + it.id;
      return (
        '<article class="neu examq-card" id="' + esc(it.id) + '">' +
          '<div class="examq-card-head">' +
            '<span class="examq-kind-badge">' + esc(it.kind) + "</span>" +
            '<span class="examq-crumbs">' + esc(crumbs) + "</span>" +
          "</div>" +
          '<p class="examq-title">' + hl(snippet) + "</p>" +
          '<div class="example">' +
            '<div class="example-problem">' + it.prompt + "</div>" +
          "</div>" +
          '<div class="example" style="border-inline-start:4px solid var(--accent-blue)">' +
            '<div class="example-head">' +
              '<div class="example-title" style="color:var(--accent-blue-text)">' +
                '<span class="example-badge" style="background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple))"><svg class="icon" aria-hidden="true"><use href="#icon-check-circle"></use></svg></span> الإجابة النموذجية' +
              "</div>" +
              '<button type="button" class="neu-btn" data-examq-reveal="' + esc(ansId) + '" aria-expanded="false">إظهار الإجابة النموذجية</button>' +
            "</div>" +
            '<div class="hidden-steps" id="' + esc(ansId) + '">' + it.answer + "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");

    window.PBToolsShell.retypeset([list]);
  }

  function buildFilters(){
    var wrap = document.getElementById("examqFilters");
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

  // Same tiny reveal/hide toggle lesson-engine.js's wireRevealSteps() uses
  // for worked-solution blocks — reimplemented here (not imported) since
  // this standalone tool page never loads lesson-engine.js, which owns
  // only chapter/lesson content pages.
  function wireReveal(){
    document.getElementById("examqList").addEventListener("click", function(e){
      var btn = e.target.closest("[data-examq-reveal]");
      if(!btn) return;
      var target = document.getElementById(btn.getAttribute("data-examq-reveal"));
      if(!target) return;
      var open = target.classList.toggle("shown");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "إخفاء الإجابة النموذجية" : "إظهار الإجابة النموذجية";
    });
  }

  function init(){
    window.PBToolsShell.init("exam-bank", function(){
      fetch(document.documentElement.getAttribute("data-assets") + DATA_URL)
        .then(function(r){ return r.json(); })
        .then(function(data){
          chapters = data.chapters.map(function(c){ return {num: c.num, title: c.title}; });
          data.chapters.forEach(function(c){
            c.questions.forEach(function(q){
              var cleanPrompt = cleanMathText(stripHtml(q.prompt));
              var cleanAnswer = cleanMathText(stripHtml(q.answer));
              items.push({
                id: q.id, chapterNum: c.num, kind: q.kind,
                prompt: q.prompt, answer: q.answer,
                plainPrompt: cleanPrompt,
                norm: window.PBSearch.normalizeArabic(cleanPrompt + " " + cleanAnswer)
              });
            });
          });

          buildFilters();
          render();
          wireReveal();

          var input = document.getElementById("examqSearch");
          var timer = null;
          input.addEventListener("input", function(){
            clearTimeout(timer);
            timer = setTimeout(function(){ state.query = input.value.trim(); render(); }, DEBOUNCE_MS);
          });

          // Smart-Search "#pbsearch:<snippet>" jump lands on this page too
          // (search.js's own JUMP_CANDIDATES already includes ".example",
          // which every question card contains) — nothing extra to wire.
        })
        .catch(function(){
          document.getElementById("examqList").innerHTML =
            '<div class="tools-emptystate"><svg class="icon"><use href="#icon-alert-triangle"></use></svg>تعذّر تحميل بنك الأسئلة الوزارية.</div>';
        });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
