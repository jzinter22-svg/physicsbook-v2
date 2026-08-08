/* Scientific Calculator page (calculator/index.html) — UI wiring only; all
   math lives in assets/js/calc-engine.js (window.PBCalc), kept separate so
   the parser/evaluator has no DOM dependency and can be reasoned about (or
   unit-tested) on its own. */
(function(){
  "use strict";

  var LS_HISTORY = "pb_calc_history_v1";
  var MAX_HISTORY = 30;

  var state = {expr: "", angleMode: "deg", memory: 0, ans: null};
  var exprEl, previewEl;

  function esc(s){ return window.PBSearch ? window.PBSearch.escapeHtml(s) : String(s); }

  // Function buttons append "name(" to the end of the expression (the
  // natural "type the call, then its argument" flow). x²/n!/% are postfix
  // and are meant to be pressed right after a number. 1/x is the one
  // exception that wraps the *whole* current expression, since "1/" can't
  // be expressed as a suffix.
  var SCI_BUTTONS = [
    {label: "(", insert: "("}, {label: ")", insert: ")"}, {label: "π", insert: "π"},
    {label: "e", insert: "e"}, {label: "n!", insert: "!"}, {label: "%", insert: "%"},
    {label: "x²", insert: "^2"}, {label: "xʸ", insert: "^"}, {label: "ˣ√y", insert: "root(", title: "الجذر النوني: root(القيمة, الفهرس)"},
    {label: "√", insert: "sqrt("}, {label: "log", insert: "log("}, {label: "ln", insert: "ln("},
    {label: "sin", insert: "sin("}, {label: "cos", insert: "cos("}, {label: "tan", insert: "tan("},
    {label: "asin", insert: "asin("}, {label: "acos", insert: "acos("}, {label: "atan", insert: "atan("},
    {label: "sinh", insert: "sinh("}, {label: "cosh", insert: "cosh("}, {label: "tanh", insert: "tanh("},
    {label: "asinh", insert: "asinh("}, {label: "acosh", insert: "acosh("}, {label: "atanh", insert: "atanh("},
    {label: "×10ˣ", insert: "e", title: "علامة الأس العلمي، مثال: 1.5×10ˣ3"},
    {label: "abs", insert: "abs("}, {label: "1/x", action: "reciprocal"}, {label: "Ans", insert: "ans"}
  ];
  var BASIC_BUTTONS = [
    {label: "C", action: "clear", cls: "calc-btn clear"}, {label: "⌫", action: "backspace", cls: "calc-btn clear"},
    {label: "%", insert: "%", cls: "calc-btn op"}, {label: "÷", insert: "/", cls: "calc-btn op"},
    {label: "7", insert: "7", cls: "calc-btn"}, {label: "8", insert: "8", cls: "calc-btn"}, {label: "9", insert: "9", cls: "calc-btn"}, {label: "×", insert: "*", cls: "calc-btn op"},
    {label: "4", insert: "4", cls: "calc-btn"}, {label: "5", insert: "5", cls: "calc-btn"}, {label: "6", insert: "6", cls: "calc-btn"}, {label: "−", insert: "-", cls: "calc-btn op"},
    {label: "1", insert: "1", cls: "calc-btn"}, {label: "2", insert: "2", cls: "calc-btn"}, {label: "3", insert: "3", cls: "calc-btn"}, {label: "+", insert: "+", cls: "calc-btn op"},
    {label: "0", insert: "0", cls: "calc-btn wide"}, {label: ".", insert: ".", cls: "calc-btn"}, {label: "=", action: "equals", cls: "calc-btn equals"}
  ];

  function balanceParens(s){
    var open = (s.match(/\(/g) || []).length;
    var close = (s.match(/\)/g) || []).length;
    return open > close ? s + ")".repeat(open - close) : s;
  }

  function formatResult(n){
    if(n === Infinity) return "∞";
    if(n === -Infinity) return "-∞";
    if(Object.is(n, -0)) n = 0;
    var abs = Math.abs(n);
    if(abs !== 0 && (abs < 1e-9 || abs >= 1e15)){
      return n.toExponential(9).replace(/\.?0+e/, "e");
    }
    var s = n.toPrecision(12);
    if(s.indexOf(".") !== -1) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  function renderExpr(){
    exprEl.textContent = state.expr || "0";
    if(!state.expr){ previewEl.textContent = " "; previewEl.classList.remove("calc-error"); return; }
    var r = window.PBCalc.evaluate(balanceParens(state.expr), state.angleMode, state.ans);
    previewEl.classList.remove("calc-error");
    previewEl.textContent = r.error ? " " : ("= " + formatResult(r.value));
  }

  function commit(){
    if(!state.expr) return;
    var balanced = balanceParens(state.expr);
    var r = window.PBCalc.evaluate(balanced, state.angleMode, state.ans);
    if(r.error){
      previewEl.textContent = r.error;
      previewEl.classList.add("calc-error");
      return;
    }
    addHistory(state.expr, r.value);
    state.ans = r.value;
    state.expr = formatResult(r.value);
    renderExpr();
  }

  function handleButton(def){
    if(def.action === "clear"){ state.expr = ""; state.ans = null; renderExpr(); return; }
    if(def.action === "backspace"){ state.expr = state.expr.slice(0, -1); renderExpr(); return; }
    if(def.action === "equals"){ commit(); return; }
    if(def.action === "reciprocal"){ state.expr = "1/(" + (state.expr || "0") + ")"; renderExpr(); return; }
    state.expr += def.insert;
    renderExpr();
  }

  function buildGrid(containerId, defs, defaultCls){
    var wrap = document.getElementById(containerId);
    wrap.innerHTML = defs.map(function(b, i){
      var cls = b.cls || defaultCls;
      return '<button type="button" class="' + cls + '" data-idx="' + i + '"' +
        (b.title ? ' title="' + esc(b.title) + '"' : "") + ">" + esc(b.label) + "</button>";
    }).join("");
    Array.prototype.forEach.call(wrap.querySelectorAll("button"), function(btn, i){
      btn.addEventListener("click", function(){ handleButton(defs[i]); exprEl.focus(); });
    });
  }

  function updateMemButtons(){
    var hasValue = state.memory !== 0;
    document.querySelectorAll('[data-mem="mr"],[data-mem="mc"]').forEach(function(b){
      b.classList.toggle("has-value", hasValue);
    });
  }

  function wireMemory(){
    document.querySelectorAll("[data-mem]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var action = btn.getAttribute("data-mem");
        if(action === "mc"){ state.memory = 0; updateMemButtons(); return; }
        if(action === "mr"){ state.expr += formatResult(state.memory); renderExpr(); exprEl.focus(); return; }
        var current = window.PBCalc.evaluate(balanceParens(state.expr || "0"), state.angleMode, state.ans);
        if(current.error) return;
        state.memory += action === "mplus" ? current.value : -current.value;
        updateMemButtons();
      });
    });
  }

  function wireAngleMode(){
    document.querySelectorAll(".calc-mode-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        state.angleMode = btn.getAttribute("data-angle");
        document.querySelectorAll(".calc-mode-btn").forEach(function(b){
          b.classList.toggle("is-active", b === btn);
        });
        renderExpr();
      });
    });
  }

  function loadHistory(){
    try{ var v = JSON.parse(localStorage.getItem(LS_HISTORY)); return Array.isArray(v) ? v : []; }catch(e){ return []; }
  }
  function saveHistory(list){
    try{ localStorage.setItem(LS_HISTORY, JSON.stringify(list)); }catch(e){}
  }
  function addHistory(expr, value){
    var list = loadHistory();
    list.unshift({expr: expr, result: formatResult(value)});
    saveHistory(list.slice(0, MAX_HISTORY));
    renderHistory();
  }
  function renderHistory(){
    var list = loadHistory();
    var ul = document.getElementById("calcHistoryList");
    if(!list.length){
      ul.innerHTML = '<li class="tools-emptystate" style="padding:1rem 0"><svg class="icon" aria-hidden="true"><use href="#icon-clock"></use></svg>لا توجد عمليات بعد.</li>';
      return;
    }
    ul.innerHTML = list.map(function(h, i){
      return '<li class="calc-history-item" data-idx="' + i + '" tabindex="0" role="button" aria-label="إعادة استخدام النتيجة">' +
        '<span class="calc-history-expr">' + esc(h.expr) + " =</span>" +
        '<span class="calc-history-result">' + esc(h.result) + "</span>" +
        "</li>";
    }).join("");
    Array.prototype.forEach.call(ul.querySelectorAll(".calc-history-item"), function(li, i){
      var reuse = function(){
        state.expr = list[i].result;
        state.ans = parseFloat(list[i].result);
        renderExpr();
        exprEl.focus();
      };
      li.addEventListener("click", reuse);
      li.addEventListener("keydown", function(e){ if(e.key === "Enter") reuse(); });
    });
  }

  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(function(){ fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text){
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); }catch(e){}
    document.body.removeChild(ta);
  }

  function wireHistoryActions(){
    document.getElementById("calcCopyLast").addEventListener("click", function(){
      var list = loadHistory();
      var text = list.length ? list[0].result : (state.expr ? formatResult(window.PBCalc.evaluate(balanceParens(state.expr), state.angleMode, state.ans).value || 0) : "");
      if(text) copyText(String(text));
    });
    document.getElementById("calcClearHistory").addEventListener("click", function(){
      saveHistory([]);
      renderHistory();
    });
  }

  // Keyboard shortcuts. Attached to the focusable expression display (not
  // a real <input>), so every key this calculator handles stops
  // propagation before it reaches document — otherwise "/" would also
  // trigger the site-wide Smart Search overlay's global "/" shortcut
  // (see assets/js/search.js), since that check only recognizes real
  // <input>/<textarea>/contenteditable elements as "already typing".
  var KEY_INSERT = {
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    ".": ".", "+": "+", "-": "-", "*": "*", "/": "/", "^": "^", "(": "(", ")": ")", "%": "%", "!": "!", ",": ","
  };
  function wireKeyboard(){
    exprEl.addEventListener("keydown", function(e){
      if(KEY_INSERT.hasOwnProperty(e.key)){
        e.preventDefault(); e.stopPropagation();
        state.expr += KEY_INSERT[e.key];
        renderExpr();
        return;
      }
      if(e.key === "Enter" || e.key === "="){ e.preventDefault(); e.stopPropagation(); commit(); return; }
      if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); state.expr = ""; state.ans = null; renderExpr(); return; }
      if(e.key === "Backspace"){ e.preventDefault(); e.stopPropagation(); state.expr = state.expr.slice(0, -1); renderExpr(); return; }
    });
  }

  function init(){
    window.PBToolsShell.init("calculator", function(){
      exprEl = document.getElementById("calcExpr");
      previewEl = document.getElementById("calcPreview");
      buildGrid("calcSciGrid", SCI_BUTTONS, "calc-btn");
      buildGrid("calcBasicGrid", BASIC_BUTTONS, "calc-btn");
      wireMemory();
      wireAngleMode();
      wireHistoryActions();
      wireKeyboard();
      renderExpr();
      renderHistory();
      exprEl.focus();
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
