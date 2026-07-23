/* ===========================================================================
   CHAPTER BEHAVIOR TEMPLATE
   ---------------------------------------------------------------------------
   To add a new chapter:
     1. Copy this file to assets/js/site-ch<N>.js (e.g. assets/js/site-ch1.js).
     2. Fill in the CONFIG block below for that chapter.
     3. Reference it from chapter-<N>/index.html and every
        chapter-<N>/lessons/lesson-<M>.html, e.g.:
          <script src="../assets/js/site-ch1.js"></script>   (from index.html)
          <script src="../../assets/js/site-ch1.js"></script> (from lessons/)
     4. Add <body data-page="index.html"> on the chapter home page and
        <body data-page="lessons/lesson-<M>.html"> on each lesson page —
        LESSONS below matches on this exact string.

   Each chapter gets its own copy of this script (mirrors the Math Book's
   architecture: one behavior file per chapter, never shared/mutated across
   chapters) so a chapter's own lesson list, storage key, and branding never
   need to touch another chapter's file. All chapter scripts publish to the
   SAME window.PBChapter namespace — safe because only one chapter's script
   is ever loaded on a given page.
   =========================================================================== */
(function(){
  "use strict";

  // ---- CONFIG: fill in per chapter -----------------------------------------
  var CONFIG = {
    // Unique key prefix for this chapter's localStorage progress record.
    // e.g. "ch1", "ch2" — must be unique across chapters.
    storageKeyPrefix: "chN",

    // Short label shown in the sticky header brand, e.g. "Chapter 1 · Kinematics"
    headerTitle: "[Chapter N · Topic]",

    // 1-2 character glyph/initial shown in the header/sidebar brand badge.
    brandBadge: "N",

    // Full chapter title + short English subtitle shown under the brand in
    // the sidebar, e.g. "Kinematics · Motion in One Dimension"
    sidebarSubtitle: "[Chapter subtitle]",

    // Ordered list of every page in this chapter, root page first.
    // `href` is relative to the chapter's own folder (e.g. chapter-1/).
    lessons: [
      { href: "index.html", title: "Chapter Home", root: true }
      // { href: "lessons/lesson-1.html", title: "1) [Lesson title]" },
      // { href: "lessons/lesson-2.html", title: "2) [Lesson title]" },
      // ... add one entry per lesson, in order
    ],

    // Decorative ambient background glyphs (see .ambient-bg in theme.css).
    // Purely visual flourish — replace with short notation/labels relevant
    // to this chapter, or leave generic.
    bgSymbols: ["•", "∘", "×", "+", "–", "="]
  };
  // ---------------------------------------------------------------------------

  var STORAGE_KEY = CONFIG.storageKeyPrefix + "_progress_v1";
  var THEME_KEY = "pb_theme"; /* shared site-wide theme preference across chapters */
  var LESSONS = CONFIG.lessons;

  function getBase(){
    var d = document.documentElement.getAttribute("data-base");
    return d || "";
  }

  function loadProgress(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch(e){ return {}; }
  }
  function saveProgress(p){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }catch(e){}
  }
  window.PBChapter = window.PBChapter || {};
  window.PBChapter.typeset = function(elements){
    /* Safe, retrying wrapper around MathJax.typesetPromise for widgets that
       render a formula in response to user input (sliders, calculators...).
       window.MathJax is only the plain config object until MathJax's async
       script finishes loading, so a plain "if it exists, call it" check can
       silently no-op on a slow-loading page. Retry until it's really ready. */
    function attempt(){
      if(window.MathJax && window.MathJax.typesetPromise){
        window.MathJax.typesetPromise(elements);
      } else {
        setTimeout(attempt, 30);
      }
    }
    attempt();
  };
  window.PBChapter.markComplete = function(id){
    var p = loadProgress();
    p[id] = true;
    saveProgress(p);
    updateProgressUI();
  };
  window.PBChapter.isComplete = function(id){
    return !!loadProgress()[id];
  };

  function updateProgressUI(){
    var p = loadProgress();
    var total = LESSONS.length - 1;
    var done = 0;
    LESSONS.forEach(function(l){ if(!l.root && p[l.href]) done++; });
    var pct = total ? Math.round((done/total)*100) : 0;
    document.querySelectorAll(".progress-fill").forEach(function(f){ f.style.width = pct + "%"; });
    document.querySelectorAll(".progress-label").forEach(function(f){ f.textContent = pct + "% complete"; });
    document.querySelectorAll(".sidebar-link").forEach(function(a){
      var href = a.getAttribute("data-href");
      if(href && p[href]) a.classList.add("is-done");
    });
  }

  function applyTheme(){
    var t = localStorage.getItem(THEME_KEY);
    if(t) document.documentElement.setAttribute("data-theme", t);
  }
  function toggleTheme(){
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  function buildHeader(){
    var header = document.querySelector(".site-header");
    if(!header) return;
    var base = getBase();
    document.body.classList.add("has-sidebar");

    var toggleBtn = document.createElement("button");
    toggleBtn.className = "neu-icon-btn sidebar-toggle-btn";
    toggleBtn.id = "sidebarToggle";
    toggleBtn.setAttribute("aria-label", "Table of contents");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-controls", "sidebarNav");
    toggleBtn.title = "Table of contents";
    toggleBtn.textContent = "☰";

    var brand = document.createElement("a");
    brand.className = "brand";
    brand.href = base + "index.html";
    brand.innerHTML = '<span class="brand-badge">' + CONFIG.brandBadge + '</span><span>' + CONFIG.headerTitle + '</span>';

    var actions = document.createElement("div");
    actions.className = "header-actions";
    actions.innerHTML = '<button class="neu-icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme">🌓</button>';
    actions.insertBefore(toggleBtn, actions.firstChild);

    header.innerHTML = "";
    var container = document.createElement("div");
    container.className = "container";
    container.appendChild(brand);
    container.appendChild(actions);
    header.appendChild(container);

    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  function buildSidebar(){
    var overlay = document.createElement("div");
    overlay.className = "toc-overlay";
    overlay.id = "sidebarOverlay";
    var aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.id = "sidebarNav";
    var base = getBase();
    var current = (document.body.getAttribute("data-page") || "");

    var html = '<div class="sidebar-inner">' +
      '<div class="sidebar-topbar">' +
        '<button class="neu-icon-btn sidebar-close-btn" id="sidebarClose" aria-label="Close menu">✕</button>' +
      '</div>' +
      '<a class="sidebar-brand" href="'+base+'index.html"><span class="brand-badge">'+CONFIG.brandBadge+'</span><span>'+CONFIG.headerTitle+'</span></a>' +
      '<div class="sidebar-subtitle">'+CONFIG.sidebarSubtitle+'</div>' +
      '<div class="sidebar-progress">' +
        '<div class="progress-track"><div class="progress-fill"></div></div>' +
        '<div class="progress-label"></div>' +
      '</div>' +
      '<nav class="sidebar-nav" aria-label="Chapter lessons"><ul class="sidebar-list">';

    LESSONS.forEach(function(l){
      var href = base + l.href;
      var isCur = current === l.href;
      html += '<li class="sidebar-item'+(isCur?" active":"")+'">' +
        '<a href="'+href+'" data-href="'+l.href+'" class="sidebar-link'+(l.root?" root":"")+(isCur?" current":"")+'"'+(isCur?' aria-current="page"':'')+'>'+l.title+'</a>';
      if(isCur){
        var subs = document.querySelectorAll("main section[id][data-navlabel]");
        if(subs.length){
          html += '<ul class="sidebar-sublist">';
          subs.forEach(function(s){
            html += '<li><a href="#'+s.id+'" class="sidebar-sublink" data-target="'+s.id+'">'+s.getAttribute("data-navlabel")+'</a></li>';
          });
          html += '</ul>';
        }
      }
      html += '</li>';
    });
    html += '</ul></nav></div>';
    aside.innerHTML = html;

    document.body.appendChild(overlay);
    document.body.appendChild(aside);

    overlay.addEventListener("click", closeSidebar);
    var closeBtn = document.getElementById("sidebarClose");
    if(closeBtn) closeBtn.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && aside.classList.contains("open")) closeSidebar();
    });
    aside.querySelectorAll(".sidebar-sublink").forEach(function(a){
      a.addEventListener("click", function(){ if(window.innerWidth < 1180) closeSidebar(); });
    });
    aside.querySelectorAll(".sidebar-link").forEach(function(a){
      a.addEventListener("click", function(){ if(window.innerWidth < 1180) closeSidebar(); });
    });

    setupScrollspy();
  }

  function openSidebar(){
    document.getElementById("sidebarOverlay").classList.add("open");
    document.getElementById("sidebarNav").classList.add("open");
    document.getElementById("sidebarToggle").setAttribute("aria-expanded", "true");
  }
  function closeSidebar(){
    document.getElementById("sidebarOverlay").classList.remove("open");
    document.getElementById("sidebarNav").classList.remove("open");
    var t = document.getElementById("sidebarToggle");
    if(t) t.setAttribute("aria-expanded", "false");
  }
  function toggleSidebar(){
    var nav = document.getElementById("sidebarNav");
    if(nav.classList.contains("open")) closeSidebar(); else openSidebar();
  }

  function setupScrollspy(){
    var subs = document.querySelectorAll("main section[id][data-navlabel]");
    var links = document.querySelectorAll(".sidebar-sublink");
    if(!subs.length || !links.length || !("IntersectionObserver" in window)) return;
    var linkMap = {};
    links.forEach(function(l){ linkMap[l.getAttribute("data-target")] = l; });
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        var link = linkMap[e.target.id];
        if(!link) return;
        if(e.isIntersecting) link.classList.add("in-view");
        else link.classList.remove("in-view");
      });
    }, {rootMargin:"-20% 0px -70% 0px", threshold:0});
    subs.forEach(function(s){ io.observe(s); });
  }

  function buildLessonNav(){
    var nav = document.querySelector(".lesson-nav[data-auto]");
    if(!nav) return;
    var current = document.body.getAttribute("data-page");
    var idx = -1;
    LESSONS.forEach(function(l,i){ if(l.href === current) idx = i; });
    if(idx === -1) return;
    var base = getBase();
    var prev = LESSONS[idx-1];
    var next = LESSONS[idx+1];
    var html = "";
    if(prev){
      html += '<a href="'+base+prev.href+'" class="neu nav-link-card"><span style="font-size:1.4rem" aria-hidden="true">←</span>' +
        '<span><span class="dir">Previous</span><br><span class="lbl">'+prev.title+'</span></span></a>';
    } else { html += "<span></span>"; }
    if(next){
      html += '<a href="'+base+next.href+'" class="neu nav-link-card" style="margin-inline-start:auto;flex-direction:row-reverse;text-align:end">' +
        '<span style="font-size:1.4rem" aria-hidden="true">→</span>' +
        '<span><span class="dir">Next</span><br><span class="lbl">'+next.title+'</span></span></a>';
    }
    nav.innerHTML = html;
  }

  function revealOnScroll(){
    /* Elements already in view get a quick staggered entrance; anything below
       the fold is revealed the instant it nears the viewport. Nothing is ever
       left permanently hidden (unlike a pure IntersectionObserver approach,
       which can leave off-screen content at opacity:0 if it never scrolls
       into view or if the observer never fires during a snapshot/print). */
    var items = document.querySelectorAll(".fade-up");
    if(!("IntersectionObserver" in window)){
      items.forEach(function(i){ i.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, {threshold:.01, rootMargin:"400px 0px 400px 0px"});
    items.forEach(function(i, idx){
      io.observe(i);
      setTimeout(function(){ i.classList.add("in"); }, 900 + idx*40);
    });
  }

  function setupStepReveals(){
    document.querySelectorAll("[data-reveal-steps]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var target = document.getElementById(btn.getAttribute("data-reveal-steps"));
        if(!target) return;
        var already = target.classList.contains("shown");
        if(already){
          target.classList.remove("shown");
          btn.setAttribute("aria-expanded", "false");
          btn.textContent = btn.getAttribute("data-show-label") || "Show solution steps";
        } else {
          target.classList.add("shown");
          btn.setAttribute("aria-expanded", "true");
          var steps = target.querySelectorAll(".step");
          steps.forEach(function(s,i){ s.style.animationDelay = (i*0.15)+"s"; });
          btn.textContent = btn.getAttribute("data-hide-label") || "Hide solution steps";
        }
      });
    });
  }

  function buildAmbientBackground(){
    if(document.querySelector(".ambient-bg")) return;
    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var symbols = CONFIG.bgSymbols;
    if(!symbols || !symbols.length) return;
    var wrap = document.createElement("div");
    wrap.className = "ambient-bg";
    wrap.setAttribute("aria-hidden", "true");
    var n = window.innerWidth < 700 ? 9 : 16;
    for(var i=0;i<n;i++){
      var s = document.createElement("span");
      s.className = "ambient-bg-item";
      s.textContent = symbols[i % symbols.length];
      s.style.left = (3 + Math.random()*82) + "%";
      s.style.top = (4 + Math.random()*88) + "%";
      s.style.fontSize = (1.1 + Math.random()*1.7) + "rem";
      s.style.animationDuration = (26 + Math.random()*28) + "s";
      s.style.animationDelay = (-(Math.random()*30)) + "s";
      s.style.setProperty("--drift", (Math.random()>.5?1:-1) * (20 + Math.random()*40) + "px");
      wrap.appendChild(s);
    }
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  function forceRepaintAfterFonts(){
    /* Headless/low-power Chromium can leave stale glyph rasterization on
       shadowed elements after a web font swaps in. Forcing one reflow once
       fonts are confirmed ready guarantees a clean repaint. */
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){
        var prev = document.body.style.display;
        document.body.style.display = "none";
        void document.body.offsetHeight;
        document.body.style.display = prev;
      });
    }
  }

  function typesetOnceReady(){
    /* MathJax's own automatic startup typeset can race this page's explicit
       call on lessons with heavier inline scripts. Startup auto-typeset
       should be disabled per-page (see each lesson's MathJax config,
       startup:{typeset:false}) so there is exactly one typeset pass, ever.
       MathJax.startup.promise is the documented full-readiness signal — it
       resolves once startup truly completes, whether or not an automatic
       pass ran. */
    if(window.MathJax && window.MathJax.startup && window.MathJax.startup.promise){
      window.MathJax.startup.promise.then(function(){
        window.MathJax.typesetPromise();
      });
    } else {
      setTimeout(typesetOnceReady, 30);
    }
  }

  function init(){
    applyTheme();
    forceRepaintAfterFonts();
    buildAmbientBackground();
    buildHeader();
    buildSidebar();
    buildLessonNav();
    updateProgressUI();
    revealOnScroll();
    setupStepReveals();
    if(window.PBQuiz) window.PBQuiz.init();
    typesetOnceReady();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
