/* Reusable quiz component.
   Markup:
   <div class="neu quiz" data-quiz>
     <div class="quiz-q" data-correct="1">
       <div class="quiz-q-title"><span>1.</span><span>Question text, with math \(...\) if needed</span></div>
       <div class="quiz-options">
         <label class="quiz-opt"><input type="radio" name="qX"><span>Option</span></label>
         ...
       </div>
       <div class="quiz-explain">Explanation</div>
     </div>
     ...
     <button class="neu-btn primary" data-quiz-check>Check answers</button>
     <div class="quiz-score"></div>
   </div>

   Hooks into window.PBChapter.markComplete(pageId) (see
   templates/chapter-behavior-template.js) when every question is answered
   correctly, so a chapter's sidebar/progress bar can reflect it. Safe to
   include on pages that don't define window.PBChapter. */
(function(){
  "use strict";
  function initQuiz(quiz, idx){
    var questions = quiz.querySelectorAll(".quiz-q");
    questions.forEach(function(q, qi){
      var opts = q.querySelectorAll('input[type=radio]');
      opts.forEach(function(o){ o.name = "quiz"+idx+"_q"+qi; });
    });
    var checkBtn = quiz.querySelector("[data-quiz-check]");
    var scoreEl = quiz.querySelector(".quiz-score");
    if(!checkBtn) return;
    checkBtn.addEventListener("click", function(){
      var correct = 0;
      questions.forEach(function(q){
        var correctIdx = parseInt(q.getAttribute("data-correct"), 10);
        var optLabels = q.querySelectorAll(".quiz-opt");
        var chosen = -1;
        optLabels.forEach(function(lbl, i){
          lbl.classList.remove("correct","wrong");
          var input = lbl.querySelector("input");
          if(input.checked) chosen = i;
        });
        var explain = q.querySelector(".quiz-explain");
        optLabels.forEach(function(lbl,i){
          if(i === correctIdx) lbl.classList.add("correct");
          else if(i === chosen && chosen !== correctIdx) lbl.classList.add("wrong");
        });
        if(chosen === correctIdx){ correct++; }
        if(explain) explain.classList.add("show");
      });
      var total = questions.length;
      if(scoreEl){
        var t = window.PBI18n ? window.PBI18n.t : function(k){ return k; };
        var verdict = correct === total ? t("common.scorePerfect")
          : correct >= total*0.6 ? t("common.scoreGood")
          : t("common.scoreRetry");
        scoreEl.textContent = t("common.scoreLabel", {correct: correct, total: total}) + "  " + verdict;
      }
      if(correct === total && window.PBChapter && window.PBChapter.markComplete){
        window.PBChapter.markComplete(document.body.getAttribute("data-page"));
      }
      if(window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([quiz]);
    });
  }

  window.PBQuiz = {
    init: function(){
      document.querySelectorAll("[data-quiz]").forEach(function(q, i){ initQuiz(q, i); });
    }
  };
})();
