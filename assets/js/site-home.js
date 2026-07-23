/* Site-wide home page behaviour: theme toggle and fade-up reveal.
   This is the top-level book hub, so unlike the per-chapter behavior
   scripts (see templates/chapter-behavior-template.js) it has no sidebar,
   lesson list, or progress tracker. */
(function(){
  "use strict";

  var THEME_KEY = "pb_theme"; /* shared site-wide theme preference across chapters */

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
    }, {threshold:.01, rootMargin:"400px 0px 400px 0px"});
    items.forEach(function(i, idx){
      io.observe(i);
      setTimeout(function(){ i.classList.add("in"); }, 300 + idx*60);
    });
  }

  function init(){
    applyTheme();
    revealOnScroll();
    var toggleBtn = document.getElementById("themeToggle");
    if(toggleBtn) toggleBtn.addEventListener("click", toggleTheme);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
