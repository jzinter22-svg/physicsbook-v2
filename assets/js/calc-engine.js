/* ===========================================================================
   Scientific calculator expression engine — window.PBCalc.
   ---------------------------------------------------------------------------
   Pure math, no DOM: tokenizes and evaluates an expression string with a
   hand-written recursive-descent parser. Deliberately NOT using eval()/
   new Function() — arbitrary text never reaches the JS engine as code, only
   as data walked by this parser, so a typed expression can't execute
   anything beyond the fixed operator/function set below.

   Grammar (highest to lowest precedence): postfix (! %) > pow (^, right-
   assoc) > unary (-, +) > mul/div > add/sub. pow's exponent recurses through
   parseUnary (not parsePow) so "2^-2" and "-2^2" both parse the way
   standard math notation expects.
   =========================================================================== */
(function(){
  "use strict";

  var FUNCS = ["asinh", "acosh", "atanh", "asin", "acos", "atan",
    "sinh", "cosh", "tanh", "sin", "cos", "tan", "log", "ln", "sqrt", "root", "abs"];

  function tokenize(input){
    var tokens = [];
    var i = 0, n = input.length;
    while(i < n){
      var ch = input[i];
      if(/\s/.test(ch)){ i++; continue; }
      if(ch === "π"){ tokens.push({type: "const", value: "pi"}); i++; continue; }
      if(/[0-9.]/.test(ch)){
        var m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(input.slice(i));
        if(!m || !m[0]) throw new Error("رقم غير صالح");
        tokens.push({type: "num", value: parseFloat(m[0])});
        i += m[0].length;
        continue;
      }
      if(/[A-Za-z]/.test(ch)){
        var word = /^[A-Za-z]+/.exec(input.slice(i))[0];
        i += word.length;
        var lower = word.toLowerCase();
        if(lower === "pi"){ tokens.push({type: "const", value: "pi"}); continue; }
        if(lower === "e"){ tokens.push({type: "const", value: "e"}); continue; }
        if(lower === "ans"){ tokens.push({type: "ans"}); continue; }
        if(FUNCS.indexOf(lower) !== -1){ tokens.push({type: "func", value: lower}); continue; }
        throw new Error("رمز غير معروف: " + word);
      }
      if("+-*/^(),!%".indexOf(ch) !== -1){ tokens.push({type: "op", value: ch}); i++; continue; }
      throw new Error("رمز غير صالح: " + ch);
    }
    return tokens;
  }

  function factorial(x){
    if(x < 0 || Math.floor(x) !== x) throw new Error("! يتطلب عددًا صحيحًا غير سالب");
    if(x > 170) return Infinity;
    var r = 1;
    for(var i = 2; i <= x; i++) r *= i;
    return r;
  }

  function evaluate(input, angleMode, ansValue){
    var tokens = tokenize(input);
    var pos = 0;
    function peek(){ return tokens[pos]; }
    function isOp(v){ var t = peek(); return t && t.type === "op" && t.value === v; }
    function expectOp(v){ if(!isOp(v)) throw new Error("متوقّع '" + v + "'"); pos++; }
    function toRad(x){ return angleMode === "deg" ? x * Math.PI / 180 : x; }
    function fromRad(x){ return angleMode === "deg" ? x * 180 / Math.PI : x; }

    function applyFunc(name, args){
      var x = args[0];
      switch(name){
        case "sin": return Math.sin(toRad(x));
        case "cos": return Math.cos(toRad(x));
        case "tan": return Math.tan(toRad(x));
        case "asin": if(x < -1 || x > 1) throw new Error("خارج مجال asin"); return fromRad(Math.asin(x));
        case "acos": if(x < -1 || x > 1) throw new Error("خارج مجال acos"); return fromRad(Math.acos(x));
        case "atan": return fromRad(Math.atan(x));
        case "sinh": return Math.sinh(x);
        case "cosh": return Math.cosh(x);
        case "tanh": return Math.tanh(x);
        case "asinh": return Math.asinh(x);
        case "acosh": if(x < 1) throw new Error("خارج مجال acosh"); return Math.acosh(x);
        case "atanh": if(x <= -1 || x >= 1) throw new Error("خارج مجال atanh"); return Math.atanh(x);
        case "log": if(x <= 0) throw new Error("log يتطلب عددًا موجبًا"); return Math.log10(x);
        case "ln": if(x <= 0) throw new Error("ln يتطلب عددًا موجبًا"); return Math.log(x);
        case "sqrt": if(x < 0) throw new Error("جذر عدد سالب"); return Math.sqrt(x);
        case "abs": return Math.abs(x);
        case "root":
          if(args.length < 2) throw new Error("root يتطلب: root(القيمة, الفهرس)");
          if(args[1] === 0) throw new Error("فهرس الجذر لا يساوي صفرًا");
          return Math.pow(args[0], 1 / args[1]);
        default: throw new Error("دالة غير معروفة: " + name);
      }
    }

    function parsePrimary(){
      var t = peek();
      if(!t) throw new Error("تعبير غير مكتمل");
      if(t.type === "num"){ pos++; return t.value; }
      if(t.type === "const"){ pos++; return t.value === "pi" ? Math.PI : Math.E; }
      if(t.type === "ans"){
        pos++;
        if(ansValue === null || ansValue === undefined) throw new Error("لا توجد نتيجة سابقة");
        return ansValue;
      }
      if(isOp("(")){
        pos++;
        var v = parseExpression();
        expectOp(")");
        return v;
      }
      if(t.type === "func"){
        pos++;
        expectOp("(");
        var args = [parseExpression()];
        while(isOp(",")){ pos++; args.push(parseExpression()); }
        expectOp(")");
        return applyFunc(t.value, args);
      }
      throw new Error("تعبير غير متوقع");
    }

    function parsePostfix(){
      var v = parsePrimary();
      while(isOp("!") || isOp("%")){
        var op = peek().value; pos++;
        v = op === "!" ? factorial(v) : v / 100;
      }
      return v;
    }

    function parsePow(){
      var base = parsePostfix();
      if(isOp("^")){ pos++; return Math.pow(base, parseUnary()); }
      return base;
    }

    function parseUnary(){
      if(isOp("-")){ pos++; return -parseUnary(); }
      if(isOp("+")){ pos++; return parseUnary(); }
      return parsePow();
    }

    function parseMulDiv(){
      var v = parseUnary();
      while(isOp("*") || isOp("/")){
        var op = peek().value; pos++;
        var rhs = parseUnary();
        if(op === "/"){
          if(rhs === 0) throw new Error("القسمة على صفر");
          v = v / rhs;
        } else { v = v * rhs; }
      }
      return v;
    }

    function parseAddSub(){
      var v = parseMulDiv();
      while(isOp("+") || isOp("-")){
        var op = peek().value; pos++;
        var rhs = parseMulDiv();
        v = op === "+" ? v + rhs : v - rhs;
      }
      return v;
    }

    function parseExpression(){ return parseAddSub(); }

    if(!tokens.length) throw new Error("لا يوجد تعبير");
    var result = parseExpression();
    if(pos < tokens.length) throw new Error("تعبير غير صالح");
    if(typeof result !== "number" || !isFinite(result)){
      if(typeof result === "number" && isNaN(result)) throw new Error("نتيجة غير معرّفة");
      return result; // Infinity/-Infinity are valid, displayable results
    }
    return result;
  }

  window.PBCalc = {
    evaluate: function(input, angleMode, ansValue){
      try{
        return {value: evaluate(input, angleMode || "deg", ansValue)};
      }catch(e){
        return {error: (e && e.message) || "تعبير غير صالح"};
      }
    }
  };
})();
