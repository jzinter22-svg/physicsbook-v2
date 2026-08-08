/* Reusable internationalization engine — subject-agnostic, used by every
   page (home, chapter hubs, and future lessons).

   Contract:
   - <html> must carry a `data-assets` attribute giving the relative path
     to the assets/ folder from that page ("" at the repo root, "../" one
     level down, "../../" two levels down — same convention as the existing
     `data-base` attribute used for page-to-page links).
   - Static markup opts into translation with:
       data-i18n="dotted.key"            -> element.textContent
       data-i18n-aria-label="dotted.key" -> aria-label attribute
       data-i18n-title="dotted.key"      -> title attribute
       data-i18n-placeholder="dotted.key"-> placeholder attribute
       data-i18n-content="dotted.key"    -> content attribute (meta tags)
       data-i18n-title-tag="dotted.key"  -> document.title (put this on the
                                             <title> element itself)
     Any of the above may be paired with:
       data-i18n-params='{"n":5}'        -> interpolated into {n} tokens
   - Dynamically-built markup (header/sidebar/etc., injected via JS) should
     call PBI18n.t(key, params) directly while constructing strings, and the
     owning script should re-run that construction inside a
     PBI18n.onChange(...) callback so it stays in sync with the active
     language.
   - Only the active language's JSON is ever fetched — switching languages
     fetches the new one and discards the old, nothing is preloaded. */
(function(){
  "use strict";

  var LANGS = ["ar", "ku", "en"];
  var RTL_LANGS = { ar: true, ku: true };
  var DEFAULT_LANG = "ar";
  var STORAGE_KEY = "pb_lang";

  var dict = null;
  var currentLang = null;
  var listeners = [];
  var readyPromise = null;

  function getAssetsBase(){
    var d = document.documentElement.getAttribute("data-assets");
    return d != null ? d : "";
  }

  function getStoredLang(){
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return LANGS.indexOf(v) !== -1 ? v : null;
    } catch(e){ return null; }
  }
  function storeLang(lang){
    try { localStorage.setItem(STORAGE_KEY, lang); } catch(e){}
  }

  function resolvePath(obj, path){
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++){
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interpolate(str, params){
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function(m, k){
      return params[k] !== undefined ? params[k] : m;
    });
  }

  function t(key, params){
    var val = dict ? resolvePath(dict, key) : undefined;
    if (val === undefined){
      console.warn("[i18n] missing key:", key, "for lang", currentLang);
      return key;
    }
    return interpolate(val, params);
  }

  function readParams(el){
    var raw = el.getAttribute("data-i18n-params");
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch(e){ console.warn("[i18n] invalid data-i18n-params on", el, e); return null; }
  }

  function applyDom(root){
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function(el){
      el.textContent = t(el.getAttribute("data-i18n"), readParams(el));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach(function(el){
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label"), readParams(el)));
    });
    root.querySelectorAll("[data-i18n-title]").forEach(function(el){
      el.setAttribute("title", t(el.getAttribute("data-i18n-title"), readParams(el)));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function(el){
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"), readParams(el)));
    });
    root.querySelectorAll("[data-i18n-content]").forEach(function(el){
      el.setAttribute("content", t(el.getAttribute("data-i18n-content"), readParams(el)));
    });
    var titleEl = root.querySelector ? root.querySelector("[data-i18n-title-tag]") : null;
    if (titleEl) document.title = t(titleEl.getAttribute("data-i18n-title-tag"), readParams(titleEl));
  }

  function applyDirection(lang){
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", RTL_LANGS[lang] ? "rtl" : "ltr");
  }

  function loadLang(lang){
    return fetch(getAssetsBase() + "assets/i18n/" + lang + ".json").then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function setLanguage(lang){
    if (LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    readyPromise = loadLang(lang).then(function(json){
      dict = json;
      currentLang = lang;
      storeLang(lang);
      applyDirection(lang);
      applyDom(document);
      listeners.forEach(function(cb){
        try { cb(lang); } catch(e){ console.error("[i18n] onChange listener error:", e); }
      });
      document.dispatchEvent(new CustomEvent("pb:langchange", { detail: { lang: lang } }));
    }).catch(function(err){
      console.error("[i18n] failed to load language:", lang, err);
    });
    return readyPromise;
  }

  function getLanguage(){ return currentLang || DEFAULT_LANG; }

  function onChange(cb){ listeners.push(cb); }

  function ready(cb){
    if (readyPromise) readyPromise.then(cb);
    else cb();
  }

  function closeAllMenus(except){
    document.querySelectorAll(".lang-menu.open").forEach(function(m){
      if (m !== except) m.classList.remove("open");
    });
  }

  function buildSwitcher(){
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "neu-icon-btn lang-switch-btn";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-globe"></use></svg>';

    var menu = document.createElement("ul");
    menu.className = "lang-menu";
    menu.setAttribute("role", "menu");

    LANGS.forEach(function(l){
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.className = "lang-menu-item";
      item.setAttribute("data-lang", l);
      item.textContent = t("lang." + l);
      li.appendChild(item);
      menu.appendChild(li);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function closeMenu(){ menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    function openMenu(){ closeAllMenus(menu); menu.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }

    btn.addEventListener("click", function(e){
      e.stopPropagation();
      if (menu.classList.contains("open")) closeMenu(); else openMenu();
    });
    document.addEventListener("click", function(e){
      if (!wrap.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape") closeMenu();
    });
    menu.querySelectorAll(".lang-menu-item").forEach(function(item){
      item.addEventListener("click", function(){
        var lang = item.getAttribute("data-lang");
        closeMenu();
        if (lang !== getLanguage()) setLanguage(lang);
      });
    });

    function refresh(){
      menu.querySelectorAll(".lang-menu-item").forEach(function(item){
        item.textContent = t("lang." + item.getAttribute("data-lang"));
        var isCurrent = item.getAttribute("data-lang") === getLanguage();
        item.classList.toggle("active", isCurrent);
        item.setAttribute("aria-current", isCurrent ? "true" : "false");
      });
      var label = t("common.languageSwitcher");
      btn.setAttribute("aria-label", label);
      btn.title = label;
    }
    onChange(refresh);
    ready(refresh);

    return wrap;
  }

  function mountSwitcher(container){
    if (!container) return;
    var existing = container.querySelector(".lang-switch");
    if (existing) existing.remove();
    container.appendChild(buildSwitcher());
  }

  function init(){
    return setLanguage(getStoredLang() || DEFAULT_LANG);
  }

  window.PBI18n = {
    t: t,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    onChange: onChange,
    applyDom: applyDom,
    mountSwitcher: mountSwitcher,
    ready: ready,
    LANGS: LANGS
  };

  init();
})();
