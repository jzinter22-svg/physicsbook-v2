/* ===========================================================================
   Lesson content engine — window.PBLessonEngine.
   ---------------------------------------------------------------------------
   Renders any chapter's lesson (or that chapter's hub) from content/<lang>/
   chapter-<N>/*.json (see content/README.md for the full schema) instead of
   static HTML, and re-renders in place — no page reload — when the site
   language changes, preserving scroll position, which reveal-steps blocks
   are open, and the visible interactive-simulation state. Chapter number is
   read from the URL (getContext()), not hardcoded — every chapter with a
   content/ar/chapter-<N> + content/en/chapter-<N> pair works automatically,
   no engine change needed to add one; each chapter still owns its own
   site-ch<N>.js for header/sidebar/scrollspy chrome (untouched by this file).

   Deliberately independent of templates/chapter-behavior-template.js /
   site-chN.js: this engine owns only the <main> content area. Header,
   sidebar, theme, and the language switcher itself are untouched — they
   already work, and re-implementing them here would duplicate real,
   working code. The two compose through window.PBI18n.onChange, which
   already supports multiple independent listeners.
   =========================================================================== */
(function(){
  "use strict";

  var SUPPORTED_LANGS = ["ar", "en"]; // content/<lang>/chapter-<N> — ku follows the same shape once translated
  var cache = {}; // "lang:chapterNum:lessonNum|hub" -> parsed JSON (in-memory, per session)
  var currentSimLabels = {}; // this render's simulation label dicts, keyed by widget svgId/section
  var pendingRelabel = []; // callbacks widgets register to re-run their own redraw after a language change

  function esc(s){ return window.PBSearch ? window.PBSearch.escapeHtml(s) : String(s == null ? "" : s); }
  function html(s){ return s == null ? "" : s; } // pass-through for fields that are already-safe HTML (our own extracted/translated content)

  function assetsBase(){ return document.documentElement.getAttribute("data-assets") || ""; }
  function navBase(){ return document.documentElement.getAttribute("data-base") || ""; }

  function getContext(){
    var m = /chapter-(\d+)/.exec(location.pathname);
    var chapterNum = m ? parseInt(m[1], 10) : null;
    var page = document.body.getAttribute("data-page") || "";
    var lm = /^lessons\/lesson-(\d+)\.html$/.exec(page);
    return {chapterNum: chapterNum, lessonNum: lm ? parseInt(lm[1], 10) : null, isHub: page === "index.html"};
  }

  function activeLang(){
    var lang = window.PBI18n ? window.PBI18n.getLanguage() : "ar";
    return SUPPORTED_LANGS.indexOf(lang) === -1 ? "ar" : lang;
  }

  function fetchContent(lang, ctx){
    var key = lang + ":" + ctx.chapterNum + ":" + (ctx.isHub ? "hub" : ctx.lessonNum);
    if(cache[key]) return cache[key];
    var file = ctx.isHub ? "index.json" : ("lesson-" + ctx.lessonNum + ".json");
    var url = assetsBase() + "content/" + lang + "/chapter-" + ctx.chapterNum + "/" + file;
    cache[key] = fetch(url).then(function(r){
      if(!r.ok) throw new Error("content fetch HTTP " + r.status + " for " + url);
      return r.json();
    });
    return cache[key];
  }

  // ===== Block renderers ====================================================

  // "definition" and "enumeration" are always def-box-derived (have a
  // `label` field). "explanation" is ambiguous by design: it comes from
  // EITHER a def-box (🔍 تعليل, has `label`) OR a plain .card heading+
  // paragraph (has `heading` instead) — tools/build-lesson-content.py
  // produces both under the same type name, matching the search index's
  // own classification, so branch on which field is actually present.
  var DEF_COLORS = {explanation: "var(--accent-orange)", enumeration: "var(--accent-green)"};

  function renderDefBox(b){
    var color = DEF_COLORS[b.type];
    var style = color ? ' style="border-inline-start-color:' + color + '"' : "";
    var labelStyle = color ? ' style="color:' + color + '"' : "";
    var list = "";
    if(b.listItems && b.listItems.length){
      var tag = b.listOrdered ? "ol" : "ul";
      list = "<" + tag + (b.listStyle ? ' style="' + esc(b.listStyle) + '"' : "") + ">" +
        b.listItems.map(function(it){ return "<li>" + html(it) + "</li>"; }).join("") + "</" + tag + ">";
    }
    return '<div class="def-box"' + style + '><span class="def-label"' + labelStyle + ">" + html(b.label) + "</span><p style=\"margin:.3rem 0\">" + html(b.html) + "</p>" + list + "</div>";
  }

  function renderBlock(b, ctx){
    switch(b.type){
      case "explanation":
        if(b.label !== undefined) return renderDefBox(b); // def-box (🔍 تعليل)
        return '<div class="card neu"><h2>' + esc(b.heading) + "</h2><p>" + html(b.html) + "</p></div>";
      case "paragraph":
        return '<div class="card neu"><p>' + html(b.html) + "</p></div>";
      case "definition":
      case "enumeration":
        return renderDefBox(b);
      case "callout":
        return '<div class="callout tip"><span class="icon">' + esc(b.icon) + "</span><span>" + (b.strong ? "<b>" + esc(b.strong) + "</b> " : "") + html(b.html) + "</span></div>";
      case "formula":
        return '<div class="rule-box"' + (b.id ? ' id="' + esc(b.id) + '"' : "") + ">" + html(b.html) + "</div>";
      case "table":
        return renderTable(b);
      case "diagram":
        return '<div class="diagram-card neu"><div class="diagram-wrap">' + (b.heading ? "<h3 style=\"margin-top:0\">" + esc(b.heading) + "</h3>" : "") +
          (b.descHtml ? "<p>" + html(b.descHtml) + "</p>" : "") + html(b.svg) +
          '<span class="diagram-caption">' + esc(b.caption) + "</span></div></div>";
      case "sectionIntro":
        return "<h2 style=\"margin-bottom:.25rem\">" + esc(b.heading) + "</h2>" + (b.leadHtml ? '<p class="lead" style="margin-top:0">' + html(b.leadHtml) + "</p>" : "");
      case "list":
        return '<div class="card neu">' + (b.heading ? '<h3 style="margin-top:0">' + esc(b.heading) + "</h3>" : "") +
          (b.ordered
            ? '<ol class="obj-list">' + (b.items || []).map(function(it, i){
                return '<li><span class="obj-num">' + (i + 1) + "</span><span>" + html(it) + "</span></li>";
              }).join("") + "</ol>"
            : '<ul class="summary-list">' + (b.items || []).map(function(it){
                return "<li><span>" + html(it) + "</span></li>";
              }).join("") + "</ul>") + "</div>";
      case "example":
        return renderExample(b);
      case "simulation":
        return renderSimulation(b, ctx);
      default:
        return "";
    }
  }

  function renderTable(b){
    var headRow = b.headers.map(function(h){ return "<th style=\"padding:.7rem;border-bottom:2px solid var(--accent-blue)\">" + esc(h) + "</th>"; }).join("");
    var body = b.rows.map(function(row){
      return "<tr>" + row.map(function(cell, i){
        var border = i === row.length ? "" : "border-bottom:1px solid var(--shadow-dark);";
        return '<td style="padding:.6rem;' + border + '">' + html(cell) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="card neu" style="overflow-x:auto">' +
      (b.heading ? '<h2 style="margin-bottom:.8rem">' + esc(b.heading) + "</h2>" : "") +
      '<table style="width:100%;border-collapse:collapse;text-align:center;min-width:480px"><thead><tr style="background:var(--surface)">' +
      headRow + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function renderExample(b){
    // Lessons 1-7 use the standard numbered-badge "مثال (N)" title. Lesson
    // 8's mcq/illal/theory/problems items carry their own literal label
    // ("1", "مسألة 1", "السؤال") captured at extraction time instead — no
    // badge chip, just that label as-is (matching the source markup, which
    // has no .example-badge there either).
    var titleHtml = b.label != null
      ? esc(b.label)
      : '<span class="example-badge">' + b.number + "</span> " + esc((window.PBI18n && window.PBI18n.t("common.example")) || "مثال") + " (" + b.number + ")";
    var out = '<div class="example fade-up">' +
      '<div class="example-head"><div class="example-title">' + titleHtml + "</div></div>" +
      '<div class="example-problem">' + html(b.problemHtml) + "</div>";
    if(b.diagramSvg){
      out += '<div class="diagram-wrap" style="margin-top:1rem">' + b.diagramSvg + '<span class="diagram-caption">' + esc(b.diagramCaption) + "</span></div>";
    }
    out += "</div>";
    if(!b.solution) return out;
    var sol = b.solution;
    var stepsId = "steps-ex" + b.number;
    var solTitle = sol.label != null ? esc(sol.label) : esc((window.PBI18n && window.PBI18n.t("common.detailedSolution")) || "الحل التفصيلي");
    out += '<div class="example fade-up" style="border-inline-start:4px solid var(--accent-blue)">' +
      '<div class="example-head"><div class="example-title" style="color:var(--accent-blue)"><span class="example-badge" style="background:linear-gradient(135deg,#3fa9f5,#7c6fee)">✓</span> ' +
      solTitle + "</div>" +
      '<button class="neu-btn" data-reveal-steps="' + stepsId + '" aria-expanded="false" data-i18n-show="common.showSteps" data-i18n-hide="common.hideSteps">' +
      esc((window.PBI18n && window.PBI18n.t("common.showSteps")) || "إظهار خطوات الحل") + "</button></div>";
    if(sol.given && sol.given.length){
      out += '<p style="margin:0 0 .5rem;font-weight:800;color:var(--accent-purple)">📋 ' + esc((window.PBI18n && window.PBI18n.t("common.given")) || "المعطيات") + '</p><ul class="summary-list" style="margin-bottom:1rem">' +
        sol.given.map(function(g){ return "<li><span>" + html(g) + "</span></li>"; }).join("") + "</ul>";
    }
    if(sol.required){
      out += '<p style="margin:0 0 .5rem;font-weight:800;color:var(--accent-blue)">🎯 ' + esc((window.PBI18n && window.PBI18n.t("common.required")) || "المطلوب") + "</p><p style=\"margin:0 0 1rem\">" + html(sol.required) + "</p>";
    }
    if(sol.steps && sol.steps.length){
      out += '<ol class="steps hidden-steps" id="' + stepsId + '">' + sol.steps.map(function(st, i){
        var calc = (st.calc || []).map(function(c){
          var cls = c.kind === "arrow" ? "calc-arrow" : (c.kind === "box" ? "calc-line calc-box" : "calc-line");
          return '<div class="' + cls + '">' + html(c.latex) + "</div>";
        }).join("");
        return '<li class="step"><span class="step-dot">' + (i + 1) + '</span><div class="step-body">' +
          (st.note ? '<p class="calc-note">' + esc(st.note) + "</p>" : "") +
          (calc ? '<div class="calc-flow">' + calc + "</div>" : "") + "</div></li>";
      }).join("") + "</ol>";
    }
    if(sol.diagramSvg){
      out += '<div class="mindmap-wrap" style="margin-top:.6rem">' + sol.diagramSvg + "</div>";
      // A static diagram embedded in a solution can compose its own text
      // labels in JS (same simText() mechanism simulations use) rather than
      // baking them into the (otherwise empty) diagramSvg markup itself.
      if(sol.labels) currentSimLabels["ex" + b.number] = sol.labels;
    }
    if(sol.note){
      out += '<div class="callout tip" style="margin-top:.8rem"><span class="icon">' + esc(sol.note.icon) + "</span><span>" + (sol.note.strong ? "<b>" + esc(sol.note.strong) + "</b> " : "") + html(sol.note.html) + "</span></div>";
    }
    if(sol.final){
      out += '<div class="exercise-final">' + html(sol.final) + "</div>";
    }
    out += "</div>";
    return out;
  }

  function renderSimulation(b, ctx){
    var controls = (b.controls || []).map(function(c){
      if(!c.inputId) return "";
      var attrs = (c.rowId ? ' id="' + esc(c.rowId) + '"' : "") + (c.rowStyle ? ' style="' + esc(c.rowStyle) + '"' : "");
      var inputEl = c.inputType
        ? '<input type="' + esc(c.inputType) + '" id="' + esc(c.inputId) + '"' +
          (c.inputClass ? ' class="' + esc(c.inputClass) + '"' : "") +
          (c.inputMin != null ? ' min="' + esc(c.inputMin) + '"' : "") +
          (c.inputMax != null ? ' max="' + esc(c.inputMax) + '"' : "") +
          (c.inputStep != null ? ' step="' + esc(c.inputStep) + '"' : "") +
          (c.inputValue != null ? ' value="' + esc(c.inputValue) + '"' : "") + ">"
        : "";
      return '<div class="io-row"' + attrs + '><label for="' + esc(c.inputId) + '" style="min-width:9rem">' + html(c.labelHtml) + "</label>" + inputEl + "</div>";
    }).join("");
    var buttonEls = (b.buttons || []).map(function(btn){
      var dataAttrs = "";
      for(var k in (btn.data || {})){ dataAttrs += " " + esc(k) + '="' + esc(btn.data[k]) + '"'; }
      return '<button class="' + esc(btn.class || "neu-btn") + '"' + (btn.id ? ' id="' + esc(btn.id) + '"' : "") +
        (btn.style ? ' style="' + esc(btn.style) + '"' : "") + dataAttrs + ">" + html(btn.html) + "</button>";
    });
    // .io-panel is a CSS grid (one row per direct child): a lone toggle
    // button (the common case, e.g. a "reverse direction" button) sitting
    // as its own grid row is the tested/intended look, but 2+ buttons (a
    // multi-way picker, e.g. wavelength-select buttons) need the same
    // flex-wrap .io-row grouping "presets" already uses below, or they'd
    // stack one-per-row instead of wrapping horizontally as a button group.
    var buttons = buttonEls.length > 1
      ? '<div class="io-row" style="flex-wrap:wrap;gap:.5rem">' + buttonEls.join("") + "</div>"
      : buttonEls.join("");
    var presets = (b.presets || []).map(function(p){
      return '<button class="neu-btn" data-preset="' + esc(p.value) + '">' + esc(p.label) + "</button>";
    }).join("");
    var select = (b.selectId && b.selectOptions)
      ? '<select id="' + esc(b.selectId) + '" class="neu-btn" style="width:100%;text-align:center;cursor:pointer">' +
        b.selectOptions.map(function(o){ return '<option value="' + esc(o.value) + '">' + esc(o.text) + "</option>"; }).join("") +
        "</select>"
      : "";
    var ruleBoxes = (b.ruleBoxes || []).map(function(rb){
      return '<div class="' + esc(rb.wrapperClass || "rule-box") + '"' + (rb.id ? ' id="' + esc(rb.id) + '"' : "") + ">" + html(rb.html) + "</div>";
    }).join("");
    var svgAttrs = (b.svgViewBox ? ' viewBox="' + esc(b.svgViewBox) + '"' : "") +
      (b.svgWidth ? ' width="' + esc(b.svgWidth) + '"' : "") +
      (b.svgHeight ? ' height="' + esc(b.svgHeight) + '"' : "");
    var svgMount = b.svgId
      ? '<div class="mindmap-wrap"><svg id="' + esc(b.svgId) + '"' + svgAttrs + ' role="img" aria-label="' + esc(b.svgAriaLabel) + '"></svg></div>'
      : "";
    if(b.labels) currentSimLabels[b.svgId || b.sectionHeading] = b.labels;
    return '<div class="card neu"><h2>' + esc(b.sectionHeading) + "</h2>" +
      (b.descriptionHtml ? "<p>" + html(b.descriptionHtml) + "</p>" : "") +
      (presets ? '<div class="io-row" style="flex-wrap:wrap;gap:.5rem">' + presets + "</div>" : "") +
      '<div class="io-panel">' + select + svgMount + controls + buttons + ruleBoxes +
      (b.trailingHtml ? "<p>" + html(b.trailingHtml) + "</p>" : "") + "</div></div>";
  }

  // ===== Mindmap (shared geometry across every lesson + the hub) ===========

  function renderMindmapSvg(mm){
    if(!mm) return "";
    var vb = mm.viewBox || "0 0 820 300";
    var node = function(n, size, textSize){
      var lines = n.lines.map(function(line, i){
        var dy = n.lines.length === 1 ? 4 : (i === 0 ? -4 : 13);
        return '<text x="' + n.cx + '" y="' + (n.cy + dy) + '" text-anchor="middle" fill="#fff" font-weight="' + (size === "c" ? 800 : 700) +
          '" font-size="' + textSize + '" font-family="Cairo,sans-serif">' + esc(line) + "</text>";
      }).join("");
      return '<g><circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + n.r + '" fill="' + esc(n.color) + '"/>' + lines + "</g>";
    };
    var lines = (mm.satellites || []).map(function(s){
      return '<line x1="' + mm.center.cx + '" y1="' + mm.center.cy + '" x2="' + s.cx + '" y2="' + s.cy + '" stroke="#b3bdcc" stroke-width="2"/>';
    }).join("");
    var sats = (mm.satellites || []).map(function(s){ return node(s, "s", 11); }).join("");
    var center = mm.center ? node(Object.assign({color: "#7c6fee"}, mm.center), "c", 13) : "";
    return '<svg viewBox="' + esc(vb) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(mm.ariaLabel) + '">' + lines + center + sats + "</svg>";
  }

  // ===== Full lesson render =================================================

  function setText(sel, txt){ var el = document.querySelector(sel); if(el && txt != null) el.textContent = txt; }
  function setHtml(sel, htm){ var el = document.querySelector(sel); if(el && htm != null) el.innerHTML = htm; }

  // The source lesson pages group their cards into <section id="..."
  // data-navlabel="...">...</section> landmarks (see tools/
  // build-lesson-content.py's sectionGroup/sectionId/sectionNavLabel
  // comment) — reconstruct those same boundaries here from the flat
  // `content` array so the sidebar sub-nav, scrollspy, and per-card
  // fade-in keep working exactly as they did against the static HTML.
  function renderContentGroups(blocks, ctx){
    var out = "";
    var i = 0;
    while(i < blocks.length){
      var group = blocks[i].sectionGroup;
      var first = blocks[i];
      var rendered = "";
      while(i < blocks.length && blocks[i].sectionGroup === group){
        rendered += renderBlock(blocks[i], ctx);
        i++;
      }
      // No .fade-up here: that class starts at opacity:0 until site-ch1.js's
      // one-time, page-load IntersectionObserver adds .in — an observer set
      // up before this async render ever runs, so it would never see these
      // sections and they'd stay invisible. Render already-visible instead.
      var attrs = (first.sectionId ? ' id="' + esc(first.sectionId) + '"' : "") +
        (first.sectionNavLabel ? ' data-navlabel="' + esc(first.sectionNavLabel) + '"' : "");
      out += '<section class="section"' + attrs + '>' + rendered + "</section>";
    }
    return out;
  }

  function renderLesson(data, ctx){
    document.title = data.meta.pageTitle;
    var descEl = document.querySelector('meta[name="description"]');
    if(descEl) descEl.setAttribute("content", data.meta.description);
    setText(".breadcrumb li:nth-child(2) a", data.meta.breadcrumbChapter);
    setText(".breadcrumb li:nth-child(3)", data.meta.breadcrumbLesson);
    setText(".site-footer", data.meta.footer);

    setText(".hero .eyebrow", data.hero.eyebrow);
    setHtml(".hero h1", data.hero.title);
    setHtml(".hero p.lead", data.hero.lead);

    var objHeadEl = document.querySelector("#objectives h2");
    if(objHeadEl && data.objectivesHeading) objHeadEl.textContent = data.objectivesHeading;
    var objEl = document.querySelector("#objectives .obj-list");
    if(objEl){
      objEl.innerHTML = data.objectives.map(function(o, i){
        return '<li><span class="obj-num">' + (i + 1) + "</span><span>" + html(o) + "</span></li>";
      }).join("");
    }

    currentSimLabels = {};
    var contentHost = document.getElementById("lessonContentBlocks");
    if(contentHost){
      contentHost.innerHTML = renderContentGroups(data.content, ctx);
    }

    if(data.quiz){
      var quizWrap = document.querySelector("[data-quiz]");
      if(quizWrap){
        var quizHeadingEl = quizWrap.querySelector("h2");
        if(quizHeadingEl && data.quiz.heading) quizHeadingEl.textContent = data.quiz.heading;
        var container = document.createElement("div");
        container.innerHTML = data.quiz.questions.map(function(q, i){
          return '<div class="quiz-q" data-correct="' + q.correct + '">' +
            '<div class="quiz-q-title"><span>' + (i + 1) + ".</span><span>" + html(q.question) + "</span></div>" +
            '<div class="quiz-options">' + q.options.map(function(o){
              return '<label class="quiz-opt"><input type="radio"><span>' + html(o) + "</span></label>";
            }).join("") + "</div>" +
            '<div class="quiz-explain">' + html(q.explain) + "</div></div>";
        }).join("");
        var oldQs = quizWrap.querySelectorAll(".quiz-q");
        oldQs.forEach(function(el){ el.remove(); });
        var scoreEl = quizWrap.querySelector(".quiz-score");
        scoreEl.textContent = "";
        // Insert before the check-answers button (not the score element):
        // the original markup order is questions, then the button, then the
        // score — anchoring on scoreEl would land every question after the
        // button instead of before it.
        var checkBtn = quizWrap.querySelector("[data-quiz-check]");
        var anchor = checkBtn || scoreEl;
        Array.prototype.slice.call(container.children).forEach(function(q){ quizWrap.insertBefore(q, anchor); });
      }
    }

    if(data.summary){
      var sumWrap = document.querySelector("#summary .card");
      if(sumWrap){
        sumWrap.querySelector("h2").textContent = data.summary.heading;
        sumWrap.querySelector(".summary-list").innerHTML = data.summary.items.map(function(it){
          return "<li><span>" + html(it) + "</span></li>";
        }).join("");
      }
    }

    if(data.mindmap){
      var mmHeadEl = document.querySelector("#mindmap h2");
      if(mmHeadEl && data.mindmap.heading) mmHeadEl.textContent = data.mindmap.heading;
      var mmWrap = document.querySelector("#mindmap .mindmap-wrap");
      if(mmWrap) mmWrap.innerHTML = renderMindmapSvg(data.mindmap);
    }
  }

  function renderHub(data){
    document.title = data.meta.pageTitle;
    var descEl = document.querySelector('meta[name="description"]');
    if(descEl) descEl.setAttribute("content", data.meta.description);
    setText(".breadcrumb li:nth-child(2)", data.meta.breadcrumbChapter);
    setText(".site-footer", data.meta.footer);

    setText(".hero .eyebrow", data.hero.eyebrow);
    setHtml(".hero h1", data.hero.titleHtml);
    setHtml(".hero p.lead", data.hero.lead);
    setText(".hero .neu-btn.primary", data.hero.startLessonLabel);
    var tagsEl = document.querySelectorAll(".hero .tag");
    (data.hero.tags || []).forEach(function(tag, i){ if(tagsEl[i]) tagsEl[i].textContent = tag; });

    var objCard = document.querySelectorAll(".card.neu")[0];
    if(objCard){
      objCard.querySelector("h2").textContent = data.objectivesHeading;
      objCard.querySelector("p.lead").textContent = data.objectivesLead;
      objCard.querySelector(".obj-list").innerHTML = data.objectives.map(function(o, i){
        return '<li><span class="obj-num">' + (i + 1) + "</span><span>" + html(o) + "</span></li>";
      }).join("");
    }

    var lessonCards = document.querySelectorAll(".lesson-card");
    data.lessons.forEach(function(l, i){
      var card = lessonCards[i];
      if(!card) return;
      card.querySelector("h3").textContent = l.title;
      card.querySelector("p").textContent = l.description;
      card.querySelector(".lesson-go").textContent = data.enterLessonLabel;
    });

    if(data.mindmap){
      var hubMmHeadEl = document.querySelector("#mindmap h2");
      if(hubMmHeadEl && data.mindmap.heading) hubMmHeadEl.textContent = data.mindmap.heading;
      var hubMmWrap = document.querySelector("#mindmap .mindmap-wrap");
      if(hubMmWrap) hubMmWrap.innerHTML = renderMindmapSvg(data.mindmap);
    }
  }

  // ===== Reveal-steps (own tiny implementation — see comment at file top) ==

  function wireRevealSteps(){
    document.querySelectorAll("[data-reveal-steps]").forEach(function(btn){
      if(btn.__pbWired) return;
      btn.__pbWired = true;
      btn.addEventListener("click", function(){
        var target = document.getElementById(btn.getAttribute("data-reveal-steps"));
        if(!target) return;
        var open = target.classList.toggle("shown");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        var showKey = btn.getAttribute("data-i18n-show");
        var hideKey = btn.getAttribute("data-i18n-hide");
        if(window.PBI18n && showKey && hideKey){
          btn.textContent = window.PBI18n.t(open ? hideKey : showKey);
        }
        if(open){
          target.querySelectorAll(".step").forEach(function(s, i){ s.style.animationDelay = (i * 0.15) + "s"; });
        }
      });
    });
  }

  // ===== State capture / restore across a language switch ==================

  function captureState(){
    return {
      scrollY: window.scrollY,
      openSteps: Array.prototype.slice.call(document.querySelectorAll(".shown[id]")).map(function(el){ return el.id; }),
      quizSelections: Array.prototype.slice.call(document.querySelectorAll(".quiz-q")).map(function(q, qi){
        var checked = q.querySelector("input:checked");
        var opts = Array.prototype.slice.call(q.querySelectorAll("input"));
        return checked ? opts.indexOf(checked) : -1;
      }),
    };
  }

  function restoreState(state){
    state.openSteps.forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.classList.add("shown");
      var btn = document.querySelector('[data-reveal-steps="' + id + '"]');
      if(btn){ btn.setAttribute("aria-expanded", "true"); btn.textContent = (window.PBI18n && window.PBI18n.t(id.indexOf("mindmap") === 0 ? "common.hideMap" : "common.hideSteps")) || btn.textContent; }
    });
    var qs = document.querySelectorAll(".quiz-q");
    state.quizSelections.forEach(function(idx, qi){
      if(idx < 0 || !qs[qi]) return;
      var opts = qs[qi].querySelectorAll("input");
      if(opts[idx]) opts[idx].checked = true;
    });
    window.scrollTo(0, state.scrollY);
  }

  // ===== Simulation label lookup + relabel hook =============================

  function simText(key, fallback){
    for(var group in currentSimLabels){
      if(currentSimLabels[group] && Object.prototype.hasOwnProperty.call(currentSimLabels[group], key)){
        return currentSimLabels[group][key];
      }
    }
    return fallback;
  }
  // A widget registers here once, from its own inline <script>, to (re)bind
  // its DOM refs and redraw. This fires after EVERY render — the first one
  // included: a widget's <svg id="..."> mount and .io-panel controls don't
  // exist in the static HTML at all anymore (they're rendered from JSON by
  // doRender below), so a widget can no longer safely bootstrap itself on
  // DOMContentLoaded — that fires before the first fetch resolves. Waiting
  // for this callback instead covers both "first paint" and "language
  // switched, redraw with the new labels" with one hook.
  function onLanguageChanged(cb){ pendingRelabel.push(cb); }

  // ===== Orchestration =======================================================

  function doRender(lang){
    var ctx = getContext();
    if(!ctx.chapterNum) return Promise.resolve();
    var loader = ctx.isHub ? renderHub : function(data){ renderLesson(data, ctx); };
    return fetchContent(lang, ctx).then(function(data){
      loader(data);
      wireRevealSteps();
      if(window.PBQuiz) window.PBQuiz.init();
      pendingRelabel.forEach(function(cb){ try{ cb(); }catch(e){} });
      // Awaited (not fire-and-forget): callers restore scroll position after
      // this promise settles, and MathJax retypesetting can resize formula
      // blocks enough to shift the page — restoring scroll before it
      // finishes would just get undone by the layout jump.
      if(window.MathJax && window.MathJax.typesetPromise) return window.MathJax.typesetPromise();
      if(window.PBToolsShell) window.PBToolsShell.retypeset();
    }).catch(function(err){
      console.error("[lesson-engine] failed to render", lang, err);
    });
  }

  function init(){
    var ctx = getContext();
    if(!ctx.chapterNum) return;
    var start = function(){
      doRender(activeLang());
      if(window.PBI18n){
        window.PBI18n.onChange(function(lang){
          if(SUPPORTED_LANGS.indexOf(lang) === -1) return; // e.g. ku: chrome translates, content stays as last-rendered language
          var state = captureState();
          doRender(lang).then(function(){
            restoreState(state);
          });
        });
      }
    };
    if(window.PBI18n) window.PBI18n.ready(start); else start();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  window.PBLessonEngine = {
    simText: simText,
    onLanguageChanged: onLanguageChanged
  };
})();
