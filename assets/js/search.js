/* ===========================================================================
   Smart Search — window.PBSearch
   ---------------------------------------------------------------------------
   A single, page-agnostic module loaded on every page (index.html, every
   chapter hub, every lesson) that:
     1. Lazily fetches the prebuilt static index (assets/search/index.json,
        generated offline by tools/build-search-index.py) once and keeps it
        in memory — every keystroke afterward searches that in-memory copy,
        never the DOM/HTML and never a re-fetch.
     2. Builds one fullscreen search overlay (built once, reused — never
        rebuilt per open) with instant, debounced, Arabic-aware search,
        filters, keyboard navigation, suggestions and a "no results" state.
     3. Exposes mountButton(container) so every page's header-actions (see
        templates/chapter-behavior-template.js buildHeader()) can drop the
        trigger button in next to the existing theme toggle / language
        switcher, and registers the Ctrl+K / "/" shortcuts globally so
        search opens from anywhere, not just when the button is visible.
     4. On every page load, checks location.hash for a "#pbsearch:<snippet>"
        marker left by a result's "Open Result" link, scrolls the matching
        content into view and flashes a highlight — this is what makes
        opening a result land on the right paragraph, not just the page.

   No existing architecture is touched: this file only ever *reads* the
   header-actions container handed to it and *appends* to <body>; nothing
   here mutates theme.css, i18n.js, quiz.js, or any per-chapter script.
   =========================================================================== */
(function(){
  "use strict";

  // Per-language index files (assets/search/index.ar.json / index.en.json,
  // built by tools/build-search-index.py) — "ar" covers the whole book,
  // "en" currently covers chapter 1 only (the multilingual pilot's scope).
  // A language with no index yet falls back to "ar", same as
  // lesson-engine.js's own SUPPORTED_LANGS fallback.
  var INDEX_LANGS = ["ar", "en"];
  function indexLang(){
    var lang = window.PBI18n ? window.PBI18n.getLanguage() : "ar";
    return INDEX_LANGS.indexOf(lang) === -1 ? "ar" : lang;
  }
  function indexUrl(){ return "assets/search/index." + indexLang() + ".json"; }
  // A handful of result-card/status strings that vary with the *content*
  // language (as opposed to the rest of the overlay's static chrome —
  // placeholder, aria-labels, suggestion headings — which stays Arabic
  // site-wide today, matching every other chapter's not-yet-translated
  // search UI; only these are shown as a direct function of which
  // language's index the user is actually searching).
  var SEARCH_STRINGS = {
    ar: {
      chapterPrefix: "الفصل", openResult: "فتح النتيجة ←", unit: "الوحدة",
      relatedFormulas: "قوانين ذات صلة", relatedLessons: "دروس ذات صلة",
      loading: "جارٍ تحميل فهرس البحث…", loadError: "تعذّر تحميل فهرس البحث.",
      noResultsInFilter: "لا نتائج ضمن هذا التصفية.",
    },
    en: {
      chapterPrefix: "Chapter", openResult: "Open Result →", unit: "Unit",
      relatedFormulas: "Related formulas", relatedLessons: "Related lessons",
      loading: "Loading search index…", loadError: "Couldn't load the search index.",
      noResultsInFilter: "No results in this filter.",
    },
  };
  function ss(key){ return (SEARCH_STRINGS[indexLang()] || SEARCH_STRINGS.ar)[key]; }
  var DEBOUNCE_MS = 150;
  var MAX_RESULTS = 30;
  var MAX_RECENT = 8;
  var LS_RECENT = "pb_search_recent_v1";
  var LS_LAST_OPENED = "pb_search_lastopened_v1";

  // Type metadata: icon + fallback Arabic label (also mirrors the filter
  // chip list from the feature spec — "All / Definitions / Scientific
  // Explanations / Enumerations / Examples / Exercises / Solutions /
  // Simulations / Figures / Formulas / Lessons / Chapters"). Tables and
  // quantities are indexed and fully searchable but intentionally have no
  // dedicated filter chip, matching that exact spec list.
  function typeIconSvg(key){
    return '<svg class="icon" aria-hidden="true"><use href="#icon-' + key + '"></use></svg>';
  }
  var TYPE_ICON_KEY = {
    definition: "pin", explanation: "search", enumeration: "list-numbers", example: "pencil",
    exercise: "help-circle", solution: "check-circle", simulation: "joystick", figure: "image",
    formula: "ruler", table: "table", lesson: "book", chapter: "books", quantity: "atom", tool: "toolbox",
    examQuestion: "bank"
  };
  var TYPE_ICON = {};
  Object.keys(TYPE_ICON_KEY).forEach(function(k){ TYPE_ICON[k] = typeIconSvg(TYPE_ICON_KEY[k]); });
  var FILTER_TYPES = ["definition", "explanation", "enumeration", "example",
    "exercise", "solution", "simulation", "figure", "formula", "lesson", "chapter", "tool", "examQuestion"];

  // Base ranking per content type — approximates the spec's stated priority
  // (lesson title > definition > explanation > keyword/quantity > example >
  // exercise > solution > body text) as a per-type weight; matchScore()
  // layers exact/prefix-title bonuses on top so a literal title match always
  // wins regardless of type.
  var TYPE_RANK = {
    lesson: 100, chapter: 95, definition: 90, explanation: 85, quantity: 80, tool: 70,
    example: 60, exercise: 55, examQuestion: 55, solution: 50, formula: 45, enumeration: 40,
    simulation: 35, figure: 30, table: 20
  };

  var POPULAR_SEARCHES = [
    "السرعة الزاوية", "قانون نيوتن الثاني", "التداخل", "الحث الكهرومغناطيسي",
    "دائرة التيار المتناوب", "الليزر", "النفط الخام", "السبائك"
  ];

  // -------------------------------------------------------------------------
  // Arabic-aware normalization. MUST mirror tools/build-search-index.py's
  // documented rules exactly: fold hamza carriers / alef-maqsura / ta-marbuta
  // to one canonical form and strip diacritics/tatweel, so "سرعة" and
  // "السرعة", or "الطاقه" and "الطاقة", normalize to the same string.
  // -------------------------------------------------------------------------
  var DIACRITICS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
  var TATWEEL_RE = /ـ/g;
  var ALEF_RE = /[أإآٱء]/g;
  var WAW_HAMZA_RE = /ؤ/g;
  var YA_RE = /[ئى]/g;
  var TA_MARBUTA_RE = /ة/g;
  var WS_RE = /\s+/g;

  function normalizeArabic(s){
    if(!s) return "";
    s = s.replace(DIACRITICS_RE, "").replace(TATWEEL_RE, "");
    s = s.replace(ALEF_RE, "ا").replace(WAW_HAMZA_RE, "و").replace(YA_RE, "ي").replace(TA_MARBUTA_RE, "ه");
    return s.toLowerCase().replace(WS_RE, " ").trim();
  }

  // Equivalence-class regex built from the RAW (un-normalized) query, used
  // only for highlighting the handful of already-matched, already-displayed
  // result previews against their original text — so highlight positions
  // never need to be translated back from normalized offsets.
  var EQUIV = {
    "ا": "[اأإآٱ]", "أ": "[اأإآٱ]", "إ": "[اأإآٱ]", "آ": "[اأإآٱ]", "ٱ": "[اأإآٱ]",
    "ه": "[هة]", "ة": "[هة]",
    "ي": "[يىئ]", "ى": "[يىئ]", "ئ": "[يىئ]",
    "و": "[وؤ]", "ؤ": "[وؤ]"
  };
  function buildFuzzyRegex(q){
    if(!q) return null;
    var out = "";
    for(var i=0;i<q.length;i++){
      var ch = q[i];
      if(/\s/.test(ch)){ out += "\\s+"; continue; }
      out += EQUIV[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    try{ return new RegExp(out, "gi"); }catch(e){ return null; }
  }

  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function highlight(text, regex){
    var safe = escapeHtml(text);
    if(!regex) return safe;
    // Run the fuzzy regex against the RAW text (positions match 1:1 since
    // this corpus contains no diacritics to shift offsets), then escape and
    // wrap each matched slice — walking the raw string keeps every escaped
    // entity intact instead of regexing already-escaped HTML.
    var out = "", last = 0, m;
    regex.lastIndex = 0;
    while((m = regex.exec(text))){
      if(m[0].length === 0){ regex.lastIndex++; continue; }
      out += escapeHtml(text.slice(last, m.index));
      out += '<mark class="pbsearch-mark">' + escapeHtml(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    out += escapeHtml(text.slice(last));
    return out || safe;
  }

  // -------------------------------------------------------------------------
  // Index loading — fetched once per language, normalized once, cached in
  // memory. A language switch invalidates the cache (see the PBI18n.onChange
  // listener near the bottom of this file) so search results always come
  // from content in the currently active UI language, not a stale fetch.
  // -------------------------------------------------------------------------
  var indexData = null;
  var indexPromise = null;
  var indexPromiseLang = null;
  var lessonByHref = {};
  var chapterByNum = {};

  function assetsBase(){
    return document.documentElement.getAttribute("data-assets") || "";
  }
  function navBase(){
    return document.documentElement.getAttribute("data-base") || "";
  }

  function fetchIndex(){
    var lang = indexLang();
    if(indexPromise && indexPromiseLang === lang) return indexPromise;
    indexPromiseLang = lang;
    lessonByHref = {};
    chapterByNum = {};
    indexPromise = fetch(assetsBase() + indexUrl(), {credentials: "same-origin"})
      .then(function(r){ if(!r.ok) throw new Error("search index HTTP " + r.status); return r.json(); })
      .then(function(data){
        data.items.forEach(function(it){
          it.norm = normalizeArabic((it.title || "") + " " + (it.text || it.formula || ""));
        });
        data.quantities.forEach(function(q){
          q.norm = normalizeArabic([q.symbol, q.name, q.unit].concat(q.aliases || []).join(" "));
        });
        data.chapters.forEach(function(c){ chapterByNum[c.num] = c; });
        data.lessons.forEach(function(l){ lessonByHref[l.href] = l; });
        indexData = data;
        return data;
      })
      .catch(function(err){
        indexPromise = null; // allow a retry on the next open() rather than caching a permanent failure
        indexPromiseLang = null;
        throw err;
      });
    return indexPromise;
  }

  // -------------------------------------------------------------------------
  // Ranking
  // -------------------------------------------------------------------------
  function matchScore(norm, titleNorm, type, qWords, qNorm){
    if(qWords.length <= 1){
      var idx = norm.indexOf(qNorm);
      if(idx === -1) return -1;
      var score = TYPE_RANK[type] || 10;
      if(titleNorm === qNorm) score += 1000; // exact title match — top priority regardless of type
      else if(titleNorm.indexOf(qNorm) === 0) score += 300; // title starts with query
      else if(titleNorm.indexOf(qNorm) !== -1) score += 150; // title contains query
      else score += 20; // only the body text matched
      score -= Math.min(idx, 50) * 0.05; // earlier occurrence, tiny tie-breaker nudge
      return score;
    }
    for(var i=0;i<qWords.length;i++){
      if(norm.indexOf(qWords[i]) === -1) return -1; // every query word must appear (AND)
    }
    var s = TYPE_RANK[type] || 10;
    var allInTitle = qWords.every(function(w){ return titleNorm.indexOf(w) !== -1; });
    s += allInTitle ? 200 : 20;
    return s;
  }

  function searchItems(query, filter){
    if(!indexData) return [];
    var qNorm = normalizeArabic(query);
    if(!qNorm) return [];
    var qWords = qNorm.split(" ").filter(Boolean);
    var results = [];
    for(var i=0;i<indexData.items.length;i++){
      var it = indexData.items[i];
      if(filter && filter !== "all" && it.type !== filter) continue;
      var titleNorm = it._titleNorm || (it._titleNorm = normalizeArabic(it.title || ""));
      var sc = matchScore(it.norm, titleNorm, it.type, qWords, qNorm);
      if(sc > 0) results.push({item: it, score: sc});
    }
    results.sort(function(a,b){ return b.score - a.score; });
    return results.slice(0, MAX_RESULTS).map(function(r){ return r.item; });
  }

  function searchQuantities(query){
    if(!indexData) return [];
    var qNorm = normalizeArabic(query);
    if(!qNorm) return [];
    return indexData.quantities.filter(function(q){
      return q.norm.indexOf(qNorm) !== -1 || normalizeArabic(q.symbol) === qNorm;
    });
  }

  // "Similar keyword" / "nearby lesson" suggestions for the no-results state:
  // a lightweight character-bigram overlap score against every lesson title
  // — good enough to surface a plausible near-miss without a real fuzzy-
  // matching library.
  function bigrams(s){
    var out = {};
    for(var i=0;i<s.length-1;i++){ var g = s.substr(i,2); out[g] = (out[g]||0)+1; }
    return out;
  }
  function bigramOverlap(a, b){
    var ga = bigrams(a), gb = bigrams(b), score = 0;
    for(var g in ga){ if(gb[g]) score += Math.min(ga[g], gb[g]); }
    return score;
  }
  function suggestNear(query){
    if(!indexData) return [];
    var qNorm = normalizeArabic(query);
    return indexData.lessons
      .map(function(l){ return {lesson: l, score: bigramOverlap(qNorm, normalizeArabic(l.title))}; })
      .filter(function(x){ return x.score > 0; })
      .sort(function(a,b){ return b.score - a.score; })
      .slice(0, 4)
      .map(function(x){ return x.lesson; });
  }

  // -------------------------------------------------------------------------
  // Recent searches / last-opened lessons (localStorage, small JSON arrays)
  // -------------------------------------------------------------------------
  function readList(key){
    try{ var v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; }catch(e){ return []; }
  }
  function writeList(key, list){
    try{ localStorage.setItem(key, JSON.stringify(list)); }catch(e){}
  }
  function pushRecent(query){
    query = query.trim();
    if(!query) return;
    var list = readList(LS_RECENT).filter(function(q){ return q !== query; });
    list.unshift(query);
    writeList(LS_RECENT, list.slice(0, MAX_RECENT));
  }
  function recordLastOpened(href, title){
    var list = readList(LS_LAST_OPENED).filter(function(l){ return l.href !== href; });
    list.unshift({href: href, title: title});
    writeList(LS_LAST_OPENED, list.slice(0, 5));
  }

  // -------------------------------------------------------------------------
  // Overlay UI — built once (lazily, on first open) and reused.
  // -------------------------------------------------------------------------
  var els = null; // DOM refs, populated by buildOverlay()
  var state = {filter: "all", results: [], activeIndex: -1, lastTrigger: null};

  function typeLabel(type){
    var labels = (indexData && indexData.typeLabels) || {};
    return labels[type] || type;
  }

  function buildOverlay(){
    if(els) return els;
    var overlay = document.createElement("div");
    overlay.className = "pbsearch-overlay";
    overlay.id = "pbsearchOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "بحث ذكي في الكتاب");
    overlay.hidden = true;

    var filterChips = '<button type="button" class="pbsearch-chip is-active" data-filter="all" role="tab" aria-selected="true">الكل</button>';
    FILTER_TYPES.forEach(function(t){
      filterChips += '<button type="button" class="pbsearch-chip" data-filter="' + t + '" role="tab" aria-selected="false">' +
        (TYPE_ICON[t] || "") + " " + escapeHtml(typeLabel(t)) + "</button>";
    });

    overlay.innerHTML =
      '<div class="pbsearch-backdrop" data-pbsearch-close></div>' +
      '<div class="pbsearch-panel">' +
        '<div class="pbsearch-inputrow">' +
          '<span class="pbsearch-icon" aria-hidden="true">' + typeIconSvg("search") + '</span>' +
          '<input type="text" class="pbsearch-input" id="pbsearchInput" autocomplete="off" spellcheck="false" ' +
            'placeholder="ابحث في تعريفات وأمثلة وقوانين وأدوات الكتاب كله…" ' +
            'aria-label="بحث ذكي" role="combobox" aria-expanded="true" aria-controls="pbsearchResults" aria-autocomplete="list">' +
          '<button type="button" class="pbsearch-clearbtn" id="pbsearchClear" aria-label="مسح البحث" hidden>' + typeIconSvg("x") + '</button>' +
          '<button type="button" class="neu-icon-btn pbsearch-closebtn" id="pbsearchCloseBtn" aria-label="إغلاق البحث">' + typeIconSvg("x") + '</button>' +
        '</div>' +
        '<div class="pbsearch-filters" id="pbsearchFilters" role="tablist" aria-label="تصفية نوع النتائج">' + filterChips + '</div>' +
        '<div class="pbsearch-body" id="pbsearchBody">' +
          '<div class="pbsearch-results" id="pbsearchResults" role="listbox" aria-label="نتائج البحث"></div>' +
        '</div>' +
        '<div class="pbsearch-footer">' +
          '<span><kbd>↑</kbd><kbd>↓</kbd> للتنقل</span>' +
          '<span><kbd>Enter</kbd> لفتح النتيجة</span>' +
          '<span><kbd>Esc</kbd> للإغلاق</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    els = {
      overlay: overlay,
      input: overlay.querySelector("#pbsearchInput"),
      clearBtn: overlay.querySelector("#pbsearchClear"),
      closeBtn: overlay.querySelector("#pbsearchCloseBtn"),
      filters: overlay.querySelector("#pbsearchFilters"),
      body: overlay.querySelector("#pbsearchBody"),
      results: overlay.querySelector("#pbsearchResults")
    };

    overlay.addEventListener("click", function(e){
      if(e.target.hasAttribute("data-pbsearch-close")) close();
    });
    els.closeBtn.addEventListener("click", close);
    els.clearBtn.addEventListener("click", function(){
      els.input.value = "";
      els.clearBtn.hidden = true;
      runSearch();
      els.input.focus();
    });
    els.filters.addEventListener("click", function(e){
      var chip = e.target.closest(".pbsearch-chip");
      if(!chip) return;
      els.filters.querySelectorAll(".pbsearch-chip").forEach(function(c){
        c.classList.remove("is-active"); c.setAttribute("aria-selected", "false");
      });
      chip.classList.add("is-active"); chip.setAttribute("aria-selected", "true");
      state.filter = chip.getAttribute("data-filter");
      runSearch();
    });

    var debounceTimer = null;
    els.input.addEventListener("input", function(){
      els.clearBtn.hidden = !els.input.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
    });
    els.input.addEventListener("keydown", onInputKeydown);
    els.results.addEventListener("click", function(e){
      var card = e.target.closest("[data-pbsearch-open]");
      if(card) openResult(card.getAttribute("data-pbsearch-open"));
    });
    // Standard modal focus trap: result cards themselves are reached via
    // ArrowUp/ArrowDown (a combobox/listbox pattern, not Tab — see
    // onInputKeydown), so Tab only ever needs to cycle the panel's own
    // controls (input, clear, close, filter chips) rather than escaping
    // into the page hidden behind the overlay.
    overlay.addEventListener("keydown", function(e){
      if(e.key !== "Tab") return;
      var focusable = Array.prototype.slice.call(
        overlay.querySelectorAll('button:not([hidden]), input, [href], [tabindex]:not([tabindex="-1"])')
      );
      if(!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    });

    return els;
  }

  function onInputKeydown(e){
    if(e.key === "Escape"){ e.preventDefault(); close(); return; }
    if(e.key === "ArrowDown"){ e.preventDefault(); moveActive(1); return; }
    if(e.key === "ArrowUp"){ e.preventDefault(); moveActive(-1); return; }
    if(e.key === "Enter"){
      e.preventDefault();
      var target = state.activeIndex >= 0 ? state.results[state.activeIndex] : state.results[0];
      if(target){ pushRecent(els.input.value); openResult(target.id); }
    }
  }

  function moveActive(delta){
    if(!state.results.length) return;
    state.activeIndex = (state.activeIndex + delta + state.results.length) % state.results.length;
    renderActiveState();
  }
  function renderActiveState(){
    var cards = els.results.querySelectorAll(".pbsearch-card");
    cards.forEach(function(c, i){
      var on = i === state.activeIndex;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
      if(on) c.scrollIntoView({block: "nearest"});
    });
  }

  function openResult(id){
    var item = indexData.items.filter(function(it){ return it.id === id; })[0];
    if(!item) return;
    if(item.type === "lesson" || item.type === "chapter") recordLastOpened(item.href, item.title);
    var hash = item.jump ? "#pbsearch:" + encodeURIComponent(item.jump) : "";
    window.location.href = navBase() + item.href + hash;
  }

  // ---- Rendering ------------------------------------------------------------
  function cardHtml(item, regex){
    var chapter = chapterByNum[item.chapterNum];
    var lesson = item.lessonNum ? lessonByHref[item.href] : null;
    var crumbs = [];
    if(chapter) crumbs.push(escapeHtml(ss("chapterPrefix") + " " + chapter.num + ": " + chapter.title));
    if(lesson && item.type !== "lesson") crumbs.push(escapeHtml(lesson.title));
    var preview = item.text || item.formula || "";
    return (
      '<div class="pbsearch-card" role="option" tabindex="-1" data-pbsearch-open="' + escapeHtml(item.id) + '">' +
        '<div class="pbsearch-card-top">' +
          '<span class="pbsearch-card-type">' + (TYPE_ICON[item.type] || "") + " " + escapeHtml(typeLabel(item.type)) + '</span>' +
          (crumbs.length ? '<span class="pbsearch-card-crumbs">' + crumbs.join(" · ") + '</span>' : "") +
        '</div>' +
        '<div class="pbsearch-card-title">' + highlight(item.title || "", regex) + '</div>' +
        (preview ? '<div class="pbsearch-card-preview">' + highlight(preview, regex) + '</div>' : "") +
        '<span class="pbsearch-card-open">' + escapeHtml(ss("openResult")) + '</span>' +
      '</div>'
    );
  }

  function quantityCardHtml(q){
    var lessons = (q.relatedLessons || []).slice(0, 4).map(function(href){
      var l = lessonByHref[href];
      return l ? '<a href="' + escapeHtml(navBase() + href) + '" class="pbsearch-qty-lesson">' + escapeHtml(l.title) + '</a>' : "";
    }).join("");
    var formulas = (q.relatedFormulas || []).slice(0, 3).map(function(f){
      var short = f.length > 70 ? f.slice(0, 70).trim() + "…" : f;
      return '<code class="pbsearch-qty-formula">' + escapeHtml(short) + '</code>';
    }).join("");
    return (
      '<div class="pbsearch-qtycard">' +
        '<div class="pbsearch-qtycard-head">' +
          '<span class="pbsearch-qtycard-symbol">' + escapeHtml(q.symbol) + '</span>' +
          '<div><div class="pbsearch-qtycard-name">' + escapeHtml(q.name) + '</div>' +
          '<div class="pbsearch-qtycard-unit">' + escapeHtml(ss("unit")) + ': ' + escapeHtml(q.unit) + '</div></div>' +
        '</div>' +
        (formulas ? '<div class="pbsearch-qtycard-section"><b>' + escapeHtml(ss("relatedFormulas")) + '</b><div class="pbsearch-qty-formulas">' + formulas + '</div></div>' : "") +
        (lessons ? '<div class="pbsearch-qtycard-section"><b>' + escapeHtml(ss("relatedLessons")) + '</b><div class="pbsearch-qty-lessons">' + lessons + '</div></div>' : "") +
      '</div>'
    );
  }

  function renderSuggestions(){
    var recent = readList(LS_RECENT);
    var lastOpened = readList(LS_LAST_OPENED);
    var html = '<div class="pbsearch-suggestions">';
    if(recent.length){
      html += '<div class="pbsearch-suggest-group"><h3>' + typeIconSvg("clock") + ' عمليات بحث سابقة</h3><div class="pbsearch-chiplist">' +
        recent.map(function(q){ return '<button type="button" class="pbsearch-suggest-chip" data-pbsearch-query="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>'; }).join("") +
        '</div></div>';
    }
    html += '<div class="pbsearch-suggest-group"><h3>' + typeIconSvg("flame") + ' عمليات بحث شائعة</h3><div class="pbsearch-chiplist">' +
      POPULAR_SEARCHES.map(function(q){ return '<button type="button" class="pbsearch-suggest-chip" data-pbsearch-query="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>'; }).join("") +
      '</div></div>';
    if(indexData){
      html += '<div class="pbsearch-suggest-group"><h3>' + typeIconSvg("books") + ' مواضيع مقترحة</h3><div class="pbsearch-chiplist">' +
        indexData.chapters.map(function(c){ return '<button type="button" class="pbsearch-suggest-chip" data-pbsearch-query="' + escapeHtml(c.title) + '">' + escapeHtml(c.title) + '</button>'; }).join("") +
        '</div></div>';
    }
    if(lastOpened.length){
      html += '<div class="pbsearch-suggest-group"><h3>' + typeIconSvg("book") + ' آخر الدروس التي فتحتها</h3><div class="pbsearch-results-inline">' +
        lastOpened.map(function(l){
          return '<a class="pbsearch-lastopened" href="' + escapeHtml(navBase() + l.href) + '">' + escapeHtml(l.title) + '</a>';
        }).join("") + '</div></div>';
    }
    html += "</div>";
    els.results.innerHTML = html;
    els.results.querySelectorAll("[data-pbsearch-query]").forEach(function(chip){
      chip.addEventListener("click", function(){
        els.input.value = chip.getAttribute("data-pbsearch-query");
        els.clearBtn.hidden = !els.input.value;
        runSearch();
        els.input.focus();
      });
    });
  }

  function renderNoResults(query){
    var near = suggestNear(query);
    var html = '<div class="pbsearch-empty">' +
      '<div class="pbsearch-empty-icon" aria-hidden="true">' + typeIconSvg("telescope") + '</div>' +
      '<p class="pbsearch-empty-title">لم يتم العثور على نتائج لـ「' + escapeHtml(query) + '」</p>' +
      '<p class="pbsearch-empty-sub">جرّب كلمة أخرى أو أقصر، أو تحقق من الإملاء.</p>';
    if(near.length){
      html += '<div class="pbsearch-suggest-group"><h3>ربما تقصد أحد هذه الدروس القريبة</h3><div class="pbsearch-chiplist">' +
        near.map(function(l){ return '<a class="pbsearch-suggest-chip" href="' + escapeHtml(navBase() + l.href) + '">' + escapeHtml(l.title) + '</a>'; }).join("") +
        '</div></div>';
    }
    html += '<div class="pbsearch-suggest-group"><h3>عمليات بحث شائعة</h3><div class="pbsearch-chiplist">' +
      POPULAR_SEARCHES.map(function(q){ return '<button type="button" class="pbsearch-suggest-chip" data-pbsearch-query="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>'; }).join("") +
      '</div></div></div>';
    els.results.innerHTML = html;
    els.results.querySelectorAll("[data-pbsearch-query]").forEach(function(chip){
      chip.addEventListener("click", function(){
        els.input.value = chip.getAttribute("data-pbsearch-query");
        els.clearBtn.hidden = !els.input.value;
        runSearch();
        els.input.focus();
      });
    });
  }

  function renderLoading(){
    els.results.innerHTML = '<div class="pbsearch-loading">' + escapeHtml(ss("loading")) + '</div>';
  }

  function runSearch(){
    var query = els.input.value.trim();
    state.activeIndex = -1;

    if(!indexData){
      renderLoading();
      fetchIndex().then(runSearch).catch(function(){
        els.results.innerHTML = '<div class="pbsearch-empty"><p class="pbsearch-empty-title">' + escapeHtml(ss("loadError")) + '</p></div>';
      });
      return;
    }

    if(!query){
      state.results = [];
      renderSuggestions();
      return;
    }

    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var results = searchItems(query, state.filter);
    var quantities = (state.filter === "all") ? searchQuantities(query) : [];
    state.results = results;

    if(!results.length && !quantities.length){
      renderNoResults(query);
      return;
    }

    var regex = buildFuzzyRegex(query);
    var html = "";
    // A strong quantity match (spec's "Quantity Dictionary") gets its own
    // rich card above the regular result list, not just a generic row.
    quantities.slice(0, 2).forEach(function(q){ html += quantityCardHtml(q); });
    html += results.map(function(it){ return cardHtml(it, regex); }).join("");
    els.results.innerHTML = html || '<div class="pbsearch-empty"><p class="pbsearch-empty-title">' + escapeHtml(ss("noResultsInFilter")) + '</p></div>';

    if(t0 && window.console && console.debug){
      var dt = performance.now() - t0;
      if(dt > 50) console.debug("[PBSearch] search took " + dt.toFixed(1) + "ms for " + results.length + " results");
    }
  }

  // -------------------------------------------------------------------------
  // Open / close
  // -------------------------------------------------------------------------
  function open(triggerEl){
    buildOverlay();
    state.lastTrigger = triggerEl || document.activeElement;
    els.overlay.hidden = false;
    document.body.classList.add("pbsearch-locked");
    fetchIndex().then(function(){
      if(!els.input.value) renderSuggestions();
    }).catch(function(){});
    if(!els.input.value) renderSuggestions();
    els.input.focus();
    els.input.select();
  }
  function close(){
    if(!els || els.overlay.hidden) return;
    els.overlay.hidden = true;
    document.body.classList.remove("pbsearch-locked");
    if(state.lastTrigger && typeof state.lastTrigger.focus === "function") state.lastTrigger.focus();
  }
  function isOpen(){ return !!(els && !els.overlay.hidden); }

  // -------------------------------------------------------------------------
  // Header integration — mirrors PBI18n.mountSwitcher's contract exactly so
  // every page's buildHeader() can call it the same way.
  // -------------------------------------------------------------------------
  function mountButton(container){
    if(!container || container.querySelector(".pbsearch-trigger")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "neu-icon-btn pbsearch-trigger";
    btn.id = "pbsearchTrigger";
    btn.title = "بحث ذكي (Ctrl+K)";
    btn.setAttribute("aria-label", "بحث ذكي في الكتاب");
    btn.innerHTML = typeIconSvg("search");
    btn.addEventListener("click", function(){ open(btn); });
    container.appendChild(btn);
  }

  // -------------------------------------------------------------------------
  // Scroll-to-result + highlight flash on the destination page.
  // -------------------------------------------------------------------------
  var JUMP_CANDIDATES = ".quiz-q,.def-box,.callout,.example,.rule-box,.diagram-wrap,table,section[id]";
  function handleIncomingJump(){
    var hash = window.location.hash;
    if(hash.indexOf("#pbsearch:") !== 0) return;
    var snippet = decodeURIComponent(hash.slice("#pbsearch:".length));
    if(!snippet) return;
    var run = function(){
      var nodes = document.querySelectorAll(JUMP_CANDIDATES);
      var target = null;
      for(var i=0;i<nodes.length;i++){
        if(nodes[i].textContent.indexOf(snippet) !== -1){ target = nodes[i]; break; }
      }
      if(!target) return;
      target.scrollIntoView({behavior: "smooth", block: "center"});
      target.classList.add("pbsearch-flash");
      setTimeout(function(){ target.classList.remove("pbsearch-flash"); }, 2200);
      if(window.history && history.replaceState){
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    // MathJax/layout settle a beat after DOMContentLoaded; a short delay
    // keeps scrollIntoView's target position accurate.
    setTimeout(run, 350);
  }

  // -------------------------------------------------------------------------
  // Global shortcuts + boot
  // -------------------------------------------------------------------------
  function onGlobalKeydown(e){
    var tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || (document.activeElement && document.activeElement.isContentEditable);
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){
      e.preventDefault();
      isOpen() ? close() : open();
      return;
    }
    if(e.key === "/" && !typing && !isOpen()){
      e.preventDefault();
      open();
    }
  }

  function recordVisitIfLesson(){
    var page = document.body.getAttribute("data-page") || "";
    if(!/^lessons\//.test(page)) return;
    // Reconstruct the site-root-relative href from the URL's last two
    // segments (chapter-N/lessons/lesson-M.html) rather than data-base,
    // since data-base points *up* from a lesson, not to it.
    var parts = location.pathname.split("/").filter(Boolean);
    if(parts.length < 2) return;
    var href = parts.slice(-3).join("/");
    var title = (document.querySelector("h1") && document.querySelector("h1").textContent.trim()) || document.title;
    recordLastOpened(href, title);
  }

  // Refreshes the filter-chip labels in place from indexData.typeLabels —
  // buildOverlay() only ever runs once, so its chip text needs a manual
  // update after a language switch loads a differently-labeled index.
  function relabelFilterChips(){
    if(!els) return;
    var chips = els.filters.querySelectorAll(".pbsearch-chip[data-filter]");
    chips.forEach(function(chip){
      var t = chip.getAttribute("data-filter");
      if(t === "all") return;
      chip.innerHTML = (TYPE_ICON[t] || "") + " " + escapeHtml(typeLabel(t));
    });
  }

  function onLanguageChanged(){
    // Discard the previous language's cached index immediately so a
    // search fired before the new fetch resolves doesn't silently return
    // stale-language results; runSearch()'s "!indexData" branch shows the
    // loading state and re-runs once fetchIndex() settles.
    indexData = null;
    fetchIndex().then(function(){
      relabelFilterChips();
      if(els && !els.overlay.hidden) runSearch();
    }).catch(function(){});
  }

  function init(){
    document.addEventListener("keydown", onGlobalKeydown);
    handleIncomingJump();
    recordVisitIfLesson();
    // Warm the index in the background once the page has settled, so the
    // first real open() already has it in memory (open() also awaits the
    // same promise, so this is purely a head start, never a requirement).
    var idle = window.requestIdleCallback || function(fn){ setTimeout(fn, 1200); };
    idle(function(){ fetchIndex().catch(function(){}); });
    if(window.PBI18n) window.PBI18n.onChange(onLanguageChanged);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  window.PBSearch = {
    open: open, close: close, mountButton: mountButton,
    // Shared utilities reused by the Formula Reference / Terminology
    // Dictionary pages so Arabic normalization and highlight rendering
    // live in exactly one place rather than being copy-pasted per page.
    normalizeArabic: normalizeArabic,
    buildFuzzyRegex: buildFuzzyRegex,
    highlight: highlight,
    escapeHtml: escapeHtml,
    fetchIndex: fetchIndex
  };
})();
