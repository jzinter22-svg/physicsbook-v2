/* Home-page splash screen: shows for exactly DISPLAY_MS, then fades into the
   hub content that is already rendered underneath it, and removes itself.
   Timing/state only — all visuals are pure CSS (see assets/css/splash.css).
   Shown once per browser (localStorage pb_splash_seen) — on every load
   after the first, index.html's own early inline script (right after the
   #splashScreen markup) already removes the element before this file even
   runs, so init()'s existing "if(!splash) return;" is what makes repeat
   visits a no-op here.
   DISPLAY_MS must match splash.css's .splash-progress-fill
   splashProgressGrow duration exactly, so the loading bar reaches 100%
   right as the splash disappears instead of visibly snapping or stalling
   partway through. */
(function(){
  "use strict";

  var SEEN_KEY = "pb_splash_seen";
  var DISPLAY_MS = 2400;
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
      try{ localStorage.setItem(SEEN_KEY, "1"); }catch(e){}
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
