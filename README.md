# Interactive Physics Book

An interactive physics textbook built on a neumorphic design system: worked
examples with step-by-step reveal, interactive widgets, self-check quizzes,
and mind maps — organized as a home hub → chapters → lessons.

This repository currently contains only the **reusable architecture** (design
system, shared components, navigation, utilities) and **templates** for
adding chapters and lessons. No physics content has been written yet.

## Project structure

```
index.html                          Home page (chapter hub)
assets/
  css/theme.css                     Design system: neumorphism, light/dark
                                     theme, layout primitives, all UI
                                     components (cards, examples, quiz,
                                     sidebar, etc.), responsive + a11y rules
  js/
    site-home.js                    Home page behavior (theme toggle, reveal)
    quiz.js                         Reusable self-check quiz engine (PBQuiz)
    plot.js                         Reusable SVG function-plotter (PBPlot)
  mathjax/                          Vendored MathJax (self-hosted, no CDN)
templates/
  chapter-template.html             Copy → chapter-<N>/index.html
  chapter-behavior-template.js      Copy → assets/js/site-ch<N>.js
  lessons/lesson-template.html      Copy → chapter-<N>/lessons/lesson-<M>.html
PROJECT_RULES.md                    Consistency rules for future chapters
```

Each chapter, once added, follows this layout:

```
chapter-<N>/
  index.html            Chapter hub: hero, objectives, lesson grid, mind map
  lessons/
    lesson-<M>.html      One page per lesson
```

## How to add a chapter

Read the header comment in `templates/chapter-template.html` — it's a
step-by-step checklist. In short:

1. Copy `templates/chapter-behavior-template.js` to `assets/js/site-ch<N>.js`
   and fill in its `CONFIG` block (storage key, title, lesson list).
2. Copy `templates/chapter-template.html` to `chapter-<N>/index.html` and
   fill in the placeholders.
3. Copy `templates/lessons/lesson-template.html` to
   `chapter-<N>/lessons/lesson-<M>.html` for each lesson.
4. Add a chapter card to `index.html`'s `#chapterGrid` (the exact markup
   pattern is left as a comment in that file).

Every chapter gets its **own** copy of the behavior script — never a shared,
mutated file — so one chapter's lesson list/branding can never break
another's. All chapter scripts publish to the same `window.PBChapter`
namespace; that's safe because only one chapter's script is ever loaded on
a given page.

## Design system highlights

- **Neumorphism**: soft-UI surfaces via `--shadow-light` / `--shadow-dark`
  pairs on `.neu`, `.neu-sm`, `.neu-inset`, `.neu-btn`, `.neu-icon-btn`.
- **Theming**: `data-theme="dark"` on `<html>`, or system preference via
  `prefers-color-scheme`; toggled and persisted (`localStorage`) by every
  page's behavior script.
- **RTL-ready**: layout is written entirely with CSS logical properties
  (`inset-inline-*`, `margin-inline-*`, `border-inline-*`, `text-align:
  start`/`end`) — flipping `<html dir="rtl">` re-flows the whole system with
  no CSS changes.
- **Accessibility**: skip-link, visible focus rings, `aria-expanded`/
  `aria-current`/`aria-label` on interactive controls, `prefers-reduced-
  motion` opt-outs on every animation, keyboard (Escape) close on the
  sidebar drawer.
- **Responsive**: fluid `clamp()` type scale, `.grid-2`/`.grid-3` collapse
  to one column under 820px, off-canvas sidebar below 1180px becomes a
  persistent rail above it.
- **Math rendering**: MathJax is vendored locally (`assets/mathjax/`) and
  configured for exactly one typeset pass per page (see
  `typesetOnceReady()` in the chapter behavior template) to avoid double-
  render/race conditions.

## Reusable UI components (see `theme.css`)

Header/sidebar/footer, off-canvas table-of-contents with scrollspy,
progress bar + per-chapter completion tracking (`localStorage`), hero
sections, objective lists, definition boxes, rule/formula boxes, callouts
(tip/warn), worked examples with step-by-step reveal, chained-equation
flows, diagram/figure containers, interactive slider + live SVG plot
widgets, self-check quizzes, summary lists, mind-map SVG containers, and
prev/next lesson navigation (auto-built from each chapter's lesson list).
