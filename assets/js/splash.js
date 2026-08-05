/* Home-page splash screen: shows for exactly 4s, then fades into the hub
   content that is already rendered underneath it, and removes itself.
   Timing/state only — all visuals are pure CSS (see assets/css/splash.css).
   Runs once per page load; does not touch chapter/i18n/quiz logic. */
(function(){
  "use strict";

  var DISPLAY_MS = 4000;
  var FADE_MS = 600;

  function buildParticles(host){
    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var n = window.innerWidth < 600 ? 6 : 11;
    for(var i=0;i<n;i++){
      var p = document.createElement("span");
      p.className = "splash-particle";
      var size = 4 + Math.random()*6;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = (4 + Math.random()*92) + "%";
      p.style.top = (10 + Math.random()*80) + "%";
      p.style.animationDuration = (7 + Math.random()*6) + "s";
      p.style.animationDelay = (-(Math.random()*10)) + "s";
      p.style.setProperty("--drift", (Math.random()>.5?1:-1) * (16+Math.random()*26) + "px");
      host.appendChild(p);
    }
  }

  function init(){
    var splash = document.getElementById("splashScreen");
    if(!splash) return;

    var particleHost = splash.querySelector(".splash-particles");
    if(particleHost) buildParticles(particleHost);

    /* Keep the hub content underneath un-scrollable and out of the tab
       order / AT tree while the splash sits on top of it. */
    document.body.classList.add("splash-active");
    var locked = [document.querySelector(".site-header"), document.getElementById("main"), document.querySelector(".site-footer")];
    locked.forEach(function(el){ if(el) el.inert = true; });

    setTimeout(function(){
      splash.classList.add("splash-hide");
      document.body.classList.remove("splash-active");
      locked.forEach(function(el){ if(el) el.inert = false; });
      setTimeout(function(){ splash.remove(); }, FADE_MS);
    }, DISPLAY_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
