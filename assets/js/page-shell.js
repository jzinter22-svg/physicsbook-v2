/* ===========================================================================
   Shared shell for the 4 book-wide tool pages (formulas/, dictionary/,
   units/, calculator/) — window.PBToolsShell.
   ---------------------------------------------------------------------------
   These pages sit alongside the chapter hubs (not inside any one chapter),
   so they reuse the site-wide header pattern from
   templates/chapter-behavior-template.js's buildHeader() (brand + theme
   toggle + language switcher + search button in .header-actions) but skip
   the per-chapter sidebar/lesson-nav, which doesn't apply here. A small
   "tools" sub-nav bar (this file's only new UI piece) replaces it, letting
   users jump between the 4 modules and back home — the closest equivalent
   of "follow the existing navigation system" for pages that aren't part of
   any chapter.

   One shell, reused by 4 tiny per-page scripts, keeps the header/theme/
   language/search wiring defined exactly once instead of copy-pasted 4x.
   =========================================================================== */
(function(){
  "use strict";

  var THEME_KEY = "pb_theme";
  var TOOLS = [
    {id: "home", href: "../index.html", icon: "home", label: "الرئيسية"},
    {id: "formulas", href: "../formulas/index.html", icon: "ruler", label: "القوانين الفيزيائية"},
    {id: "dictionary", href: "../dictionary/index.html", icon: "book", label: "قاموس المصطلحات"},
    {id: "units", href: "../units/index.html", icon: "refresh", label: "الوحدات والتحويلات"},
    {id: "calculator", href: "../calculator/index.html", icon: "calculator", label: "الآلة الحاسبة العلمية"},
    {id: "exam-bank", href: "../exam-bank/index.html", icon: "bank", label: "بنك الأسئلة الوزارية"}
  ];

  function svgIcon(key){
    return '<svg class="icon" aria-hidden="true"><use href="#icon-'+key+'"></use></svg>';
  }

  function t(key, params){
    return window.PBI18n ? window.PBI18n.t(key, params) : key;
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

  function buildHeader(activeId){
    var header = document.querySelector(".site-header");
    if(!header) return;

    var brand = document.createElement("a");
    brand.className = "brand";
    brand.href = "../index.html";
    brand.innerHTML = '<span class="brand-badge">P</span><span>' + t("brand.name") + "</span>";

    var themeBtn = document.createElement("button");
    themeBtn.className = "neu-icon-btn";
    themeBtn.id = "themeToggle";
    themeBtn.title = t("common.toggleTheme");
    themeBtn.setAttribute("aria-label", t("common.toggleTheme"));
    themeBtn.innerHTML = svgIcon("sun-moon");
    themeBtn.addEventListener("click", toggleTheme);

    var actions = document.createElement("div");
    actions.className = "header-actions";
    actions.appendChild(themeBtn);
    if(window.PBI18n) window.PBI18n.mountSwitcher(actions);
    if(window.PBSearch) window.PBSearch.mountButton(actions);

    header.innerHTML = "";
    var container = document.createElement("div");
    container.className = "container";
    container.appendChild(brand);
    container.appendChild(actions);
    header.appendChild(container);

    buildSubnav(activeId);
  }

  function buildSubnav(activeId){
    var prev = document.getElementById("toolsSubnav");
    if(prev) prev.remove();
    var nav = document.createElement("nav");
    nav.className = "tools-subnav";
    nav.id = "toolsSubnav";
    nav.setAttribute("aria-label", "أدوات الكتاب");
    var html = '<div class="container tools-subnav-inner">';
    TOOLS.forEach(function(tool){
      var isCurrent = tool.id === activeId;
      html += '<a href="' + tool.href + '" class="tools-subnav-link' + (isCurrent ? " is-active" : "") + '"' +
        (isCurrent ? ' aria-current="page"' : "") + ">" + svgIcon(tool.icon) + " " + tool.label + "</a>";
    });
    html += "</div>";
    nav.innerHTML = html;
    var header = document.querySelector(".site-header");
    header.insertAdjacentElement("afterend", nav);
  }

  function revealOnScroll(){
    var items = document.querySelectorAll(".fade-up");
    if(!("IntersectionObserver" in window)){
      items.forEach(function(i){ i.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, {threshold: .01, rootMargin: "400px 0px 400px 0px"});
    items.forEach(function(i, idx){
      io.observe(i);
      setTimeout(function(){ i.classList.add("in"); }, 300 + idx * 40);
    });
  }

  function typesetOnceReady(cb){
    if(window.MathJax && window.MathJax.startup && window.MathJax.startup.promise){
      window.MathJax.startup.promise.then(function(){
        window.MathJax.typesetPromise().then(cb).catch(cb);
      });
    } else if(window.MathJax) {
      setTimeout(function(){ typesetOnceReady(cb); }, 30);
    } else if(cb) { cb(); }
  }

  // For re-typesetting after the page's own JS rebuilds a grid of formula
  // cards (e.g. on every search/filter change) — mirrors the chapter
  // template's window.PBChapter.typeset retry wrapper, since these pages
  // don't load a chapter behavior script.
  function retypeset(elements){
    function attempt(){
      if(window.MathJax && window.MathJax.typesetPromise){
        window.MathJax.typesetClear && elements && window.MathJax.typesetClear(elements);
        window.MathJax.typesetPromise(elements);
      } else {
        setTimeout(attempt, 30);
      }
    }
    attempt();
  }

  function init(activeId, onReady){
    applyTheme();
    var start = function(){
      buildHeader(activeId);
      revealOnScroll();
      if(window.PBI18n) window.PBI18n.onChange(function(){ buildHeader(activeId); });
      if(onReady) onReady();
    };
    if(window.PBI18n) window.PBI18n.ready(start); else start();
  }

  window.PBToolsShell = {
    init: init, typesetOnceReady: typesetOnceReady, retypeset: retypeset,
    // Exposed so a page that inserts its own .fade-up content *after*
    // init()'s callback (e.g. units/ building its category cards once its
    // JSON fetch resolves) can re-run the reveal pass for that content —
    // the querySelectorAll(".fade-up") inside init() only ever sees what
    // already existed in the DOM at that moment.
    revealOnScroll: revealOnScroll
  };
})();
