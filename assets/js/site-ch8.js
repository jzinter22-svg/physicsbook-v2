/* Chapter 8 — behavior script instantiated from
   templates/chapter-behavior-template.js. Covers PDF pages 110-120
   (Part 2 — Chemistry, Chapter 8: الفلزات والسبائك / Metals and Alloys). */
(function(){
  "use strict";

  var CONFIG = {
    storageKeyPrefix: "ch8",
    chapterNumber: 8,
    brandBadge: "8",
    sidebarSubtitleKey: "ch8.sidebarSubtitle",
    lessons: [
      { href: "index.html", titleKey: "common.chapterHome", root: true },
      { href: "lessons/lesson-1.html", titleKey: "ch8.lesson1NavTitle" },
      { href: "lessons/lesson-2.html", titleKey: "ch8.lesson2NavTitle" },
      { href: "lessons/lesson-3.html", titleKey: "ch8.lesson3NavTitle" },
      { href: "lessons/lesson-4.html", titleKey: "ch8.lesson4NavTitle" },
      { href: "lessons/lesson-5.html", titleKey: "ch8.lesson5NavTitle" },
      { href: "lessons/lesson-6.html", titleKey: "ch8.lesson6NavTitle" },
      { href: "lessons/lesson-7.html", titleKey: "ch8.lesson7NavTitle" },
      { href: "lessons/lesson-8.html", titleKey: "ch8.lesson8NavTitle" },
      { href: "lessons/lesson-9.html", titleKey: "ch8.lesson9NavTitle" }
    ],
    bgSymbols: ["Fe", "Cu", "Al", "⚙", "⚗", "🔩"]
  };
  // ---------------------------------------------------------------------------

  var STORAGE_KEY = CONFIG.storageKeyPrefix + "_progress_v1";
  var THEME_KEY = "pb_theme"; /* shared site-wide theme preference across chapters */
  var LESSONS = CONFIG.lessons;

  function t(key, params){
    return window.PBI18n ? window.PBI18n.t(key, params) : key;
  }

  function svgIcon(key){
    return '<svg class="icon" aria-hidden="true"><use href="#icon-'+key+'"></use></svg>';
  }

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
    document.querySelectorAll(".progress-label").forEach(function(f){ f.textContent = t("common.percentComplete", {pct: pct}); });
    document.querySelectorAll(".sidebar-link").forEach(function(a){
      var href = a.getAttribute("data-href");
      if(href && p[href]) a.classList.add("is-done");
    });
  }

  function applyTheme(){
    var theme = localStorage.getItem(THEME_KEY);
    if(theme) document.documentElement.setAttribute("data-theme", theme);
  }
  function toggleTheme(){
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  function chapterTitle(){
    return t("chapter.titleWithNumber", {n: CONFIG.chapterNumber});
  }

  function buildHeader(){
    var header = document.querySelector(".site-header");
    if(!header) return;
    var base = getBase();
    document.body.classList.add("has-sidebar");

    var toggleBtn = document.createElement("button");
    toggleBtn.className = "neu-icon-btn sidebar-toggle-btn";
    toggleBtn.id = "sidebarToggle";
    toggleBtn.setAttribute("aria-label", t("common.tableOfContents"));
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-controls", "sidebarNav");
    toggleBtn.title = t("common.tableOfContents");
    toggleBtn.innerHTML = svgIcon("menu");

    var brand = document.createElement("a");
    brand.className = "brand";
    brand.href = base + "index.html";
    brand.innerHTML = '<span class="brand-badge">' + CONFIG.brandBadge + '</span><span>' + chapterTitle() + '</span>';

    var themeBtn = document.createElement("button");
    themeBtn.className = "neu-icon-btn";
    themeBtn.id = "themeToggle";
    themeBtn.title = t("common.toggleTheme");
    themeBtn.setAttribute("aria-label", t("common.toggleTheme"));
    themeBtn.innerHTML = svgIcon("sun-moon");

    var actions = document.createElement("div");
    actions.className = "header-actions";
    actions.appendChild(toggleBtn);
    actions.appendChild(themeBtn);
    if (window.PBI18n) window.PBI18n.mountSwitcher(actions);
    if (window.PBSearch) window.PBSearch.mountButton(actions);

    header.innerHTML = "";
    var container = document.createElement("div");
    container.className = "container";
    container.appendChild(brand);
    container.appendChild(actions);
    header.appendChild(container);

    themeBtn.addEventListener("click", toggleTheme);
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  function buildSidebar(){
    // Remove any previous instance (rebuilt on language change) so repeated
    // calls never stack duplicate sidebars/overlays.
    var prevOverlay = document.getElementById("sidebarOverlay");
    if (prevOverlay) prevOverlay.remove();
    var prevAside = document.getElementById("sidebarNav");
    if (prevAside) prevAside.remove();

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
        '<button class="neu-icon-btn sidebar-close-btn" id="sidebarClose" aria-label="'+t("common.closeMenu")+'">'+svgIcon('x')+'</button>' +
      '</div>' +
      '<a class="sidebar-brand" href="'+base+'index.html"><span class="brand-badge">'+CONFIG.brandBadge+'</span><span>'+chapterTitle()+'</span></a>' +
      '<div class="sidebar-subtitle">'+t(CONFIG.sidebarSubtitleKey)+'</div>' +
      '<div class="sidebar-progress">' +
        '<div class="progress-track"><div class="progress-fill"></div></div>' +
        '<div class="progress-label"></div>' +
      '</div>' +
      '<nav class="sidebar-nav" aria-label="'+t("common.chapterLessonsNav")+'"><ul class="sidebar-list">';

    LESSONS.forEach(function(l){
      var href = base + l.href;
      var isCur = current === l.href;
      var title = t(l.titleKey, l.titleParams);
      if(title.indexOf("🏆") !== -1) title = title.replace("🏆", svgIcon("trophy"));
      html += '<li class="sidebar-item'+(isCur?" active":"")+'">' +
        '<a href="'+href+'" data-href="'+l.href+'" class="sidebar-link'+(l.root?" root":"")+(isCur?" current":"")+'"'+(isCur?' aria-current="page"':'')+'>'+title+'</a>';
      if(isCur){
        var subs = document.querySelectorAll("main section[id][data-navlabel]");
        if(subs.length){
          html += '<ul class="sidebar-sublist">';
          subs.forEach(function(s){
            var navIcon = s.getAttribute("data-navicon");
            html += '<li><a href="#'+s.id+'" class="sidebar-sublink" data-target="'+s.id+'">'+(navIcon?svgIcon(navIcon):"")+'<span>'+s.getAttribute("data-navlabel")+'</span></a></li>';
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
    var toggleBtn = document.getElementById("sidebarToggle");
    if(toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
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
        '<span><span class="dir">'+t("common.previous")+'</span><br><span class="lbl">'+t(prev.titleKey, prev.titleParams)+'</span></span></a>';
    } else { html += "<span></span>"; }
    if(next){
      html += '<a href="'+base+next.href+'" class="neu nav-link-card" style="margin-inline-start:auto;flex-direction:row-reverse;text-align:end">' +
        '<span style="font-size:1.4rem" aria-hidden="true">→</span>' +
        '<span><span class="dir">'+t("common.next")+'</span><br><span class="lbl">'+t(next.titleKey, next.titleParams)+'</span></span></a>';
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

  /* Reveal-toggle buttons carry translation keys (not literal text) for
     their two states, e.g. data-i18n-show="common.showSteps"
     data-i18n-hide="common.hideSteps" (mind-map toggles use
     common.showMap/common.hideMap instead). Re-run refreshRevealButton on
     every language change so a button already in its "expanded" state
     keeps showing the correct translated "hide" label instead of being
     reset to "show" by a naive static data-i18n binding. */
  function refreshRevealButton(btn){
    var target = document.getElementById(btn.getAttribute("data-reveal-steps"));
    var expanded = !!(target && target.classList.contains("shown"));
    var showKey = btn.getAttribute("data-i18n-show") || "common.showSteps";
    var hideKey = btn.getAttribute("data-i18n-hide") || "common.hideSteps";
    btn.textContent = t(expanded ? hideKey : showKey);
  }
  function refreshAllRevealButtons(){
    document.querySelectorAll("[data-reveal-steps]").forEach(refreshRevealButton);
  }
  function setupStepReveals(){
    document.querySelectorAll("[data-reveal-steps]").forEach(function(btn){
      refreshRevealButton(btn);
      btn.addEventListener("click", function(){
        var target = document.getElementById(btn.getAttribute("data-reveal-steps"));
        if(!target) return;
        var already = target.classList.contains("shown");
        if(already){
          target.classList.remove("shown");
          btn.setAttribute("aria-expanded", "false");
        } else {
          target.classList.add("shown");
          btn.setAttribute("aria-expanded", "true");
          var steps = target.querySelectorAll(".step");
          steps.forEach(function(s,i){ s.style.animationDelay = (i*0.15)+"s"; });
        }
        refreshRevealButton(btn);
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

  function renderDynamicUI(){
    buildHeader();
    buildSidebar();
    buildLessonNav();
    updateProgressUI();
  }

  function init(){
    applyTheme();
    forceRepaintAfterFonts();
    buildAmbientBackground();
    renderDynamicUI();
    revealOnScroll();
    setupStepReveals();
    if(window.PBQuiz) window.PBQuiz.init();
    typesetOnceReady();
    if (window.PBI18n) window.PBI18n.onChange(function(){
      renderDynamicUI();
      refreshAllRevealButtons();
    });
  }

  function start(){
    if (window.PBI18n) window.PBI18n.ready(init); else init();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  } else { start(); }
})();
