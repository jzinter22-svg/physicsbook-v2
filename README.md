# Interactive Physics Book
### كتاب الطبيعيات التفاعلي

An interactive physics textbook built on a neumorphic design system: worked
examples with step-by-step reveal, interactive widgets, self-check quizzes,
and mind maps — organized as a home hub → chapters → lessons. Fully
trilingual (Arabic default, Kurdish/Sorani, English) with live language
switching — see [Internationalization](#internationalization-i18n) below.

The book has **eight chapter hubs** (`chapter-1/` … `chapter-8/`), each with
real lesson content, its own progress tracking, sidebar, and breadcrumb —
**60 lessons in total**. See `templates/` for the reusable architecture
(design system, shared components, navigation, utilities) the chapters were
built from; it stays the baseline for any future chapter or lesson added to
the book.

| # | Chapter | Lessons |
|---|---------|---------|
| 1 | الحركة الدائرية والدورانية (Circular & Rotational Motion) | 8 |
| 2 | التداخل والاستقطاب والحيود والاستطارة (Wave Phenomena of Light) | 7 |
| 3 | الحث الكهرومغناطيسي (Electromagnetic Induction) | 6 |
| 4 | دوائر التيار المتناوب (AC Circuits) | 8 |
| 5 | المواد شبه الموصلة والأجهزة الإلكترونية | 7 |
| 6 | الليزر والبلازما | 10 |
| 7 | النفط الخام | 5 |
| 8 | الفلزات والسبائك | 9 |

**Reference source**: `pdf/` holds the original Ministry-of-Education
physics textbook this content is built from — use it to check curriculum
coverage when writing or reviewing a lesson, not as something the site
serves to students.

## Project structure

```
index.html                          Home page: hero + 8 chapter cards +
                                     splash intro + tools section
chapter-1/ … chapter-8/
  index.html                        Chapter hub: hero, breadcrumb, progress
                                     bar, lesson grid, mind map
  lessons/
    lesson-1.html … lesson-.html One page per lesson (see table above
                                     for each chapter's lesson count)
formulas/, dictionary/, units/,
calculator/                         Book-wide tool pages — see "Book-wide
                                     tool pages" below
assets/
  css/
    theme.css                       Design system: neumorphism, light/dark
                                     theme, layout primitives, all UI
                                     components (cards, examples, quiz,
                                     sidebar, breadcrumb, etc.), responsive
                                     + a11y rules
    tools.css                       Styles for the four tool pages
    search.css                      Smart Search overlay styles
    splash.css                      Home-page splash-screen styles
  js/
    i18n.js                         Internationalization engine (PBI18n) —
                                     language switcher, translation lookup,
                                     lang/dir attribute management
    site-home.js                    Home page behavior (theme toggle, reveal)
    splash.js                       Home-page splash screen (4s intro, then
                                     fades into the hub content underneath)
    site-ch1.js … site-ch8.js       Per-chapter behavior script, one per
                                     chapter (header/sidebar/progress/lesson
                                     list), each with its own CONFIG
    quiz.js                         Reusable self-check quiz engine (PBQuiz)
    plot.js                         Reusable SVG function-plotter (PBPlot)
    search.js                       Smart Search engine (PBSearch)
    page-shell.js                   Shared header/theme/language/search
                                     shell for the four tool pages
                                     (PBToolsShell)
    page-formulas.js, page-
    dictionary.js, page-units.js    Per-tool-page logic
    calc-engine.js                  Calculator parser/evaluator (no eval)
    page-calculator.js              Calculator UI wiring
  i18n/
    ar.json, ku.json, en.json       Translation resources for shared UI
                                     chrome — one JSON file per language;
                                     only the active one is ever fetched.
                                     Lesson content itself is Arabic-only
                                     text in the HTML (see i18n note below)
  data/units.json                  Unit-conversion tables for units/
  search/index.json                Prebuilt Smart Search index (regenerate
                                     with tools/build-search-index.py)
  mathjax/                          Vendored MathJax (self-hosted, no CDN)
pdf/                                 Original Ministry physics textbook —
                                     reference source, not served to
                                     students
templates/
  chapter-template.html             Full chapter template (hero-visual,
                                     objectives, lesson grid, mind map) —
                                     starting point for any additional
                                     chapter
  chapter-behavior-template.js      Copy → assets/js/site-ch.js
  lessons/lesson-template.html      Copy → chapter-/lessons/lesson-.html
tools/build-search-index.py         Regenerates assets/search/index.json
PROJECT_RULES.md                    Consistency rules for chapter/lesson work
.github/workflows/pages.yml         Deploys the site to GitHub Pages on
                                     push to main
```

**Local preview note**: the deployed site (GitHub Pages) works out of the
box. If previewing locally by double-clicking `index.html`, `i18n.js` and
`search.js` fetch JSON over `file://`, which most browsers block — run a
local static server instead (e.g. `python3 -m http.server`) and open
`http://localhost:8000/`.

## How to add a lesson to an existing chapter

1. Copy `templates/lessons/lesson-template.html` to
   `chapter-/lessons/lesson-.html` and write the content, following
   `PROJECT_RULES.md`'s teaching style and the chapter's own existing
   lessons for structure/tone consistency.
2. Add the lesson to that chapter's `assets/js/site-ch.js`
   `CONFIG.lessons` array (drives the sidebar, prev/next nav, and progress
   bar).
3. Add a `.lesson-card` entry for it in `chapter-/index.html`'s lesson
   grid.
4. Update that chapter's lesson count on its home-page card
   (`index.html`'s `#chapterGrid`) and in the table above.
5. Regenerate the search index: `python3 tools/build-search-index.py`, and
   commit the updated `assets/search/index.json`.

## How to build an entirely new chapter

Read the header comment in `templates/chapter-template.html` — it's a
step-by-step checklist. In short: create `chapter-/`, copy
`templates/chapter-template.html` → `chapter-/index.html`, copy
`templates/chapter-behavior-template.js` → `assets/js/site-ch.js` and
fill in its `CONFIG`, then add lessons per the section above, and finally
add the new chapter's card to the home page's `#chapterGrid`.

Every chapter gets its **own** copy of the behavior script — never a shared,
mutated file — so one chapter's lesson list/branding can never break
another's. All chapter scripts publish to the same `window.PBChapter`
namespace; that's safe because only one chapter's script is ever loaded on
a given page.

## Design system highlights

- **Neumorphism**: soft-UI surfaces via `--shadow-light` / `--shadow-dark`
  pairs on `.neu`, `.neu-sm`, `.neu-inset`, `.neu-btn`, `.neu-icon-btn`.
- **Theming**: `data-theme="dark"` on ``, or system preference via
  `prefers-color-scheme`; toggled and persisted (`localStorage`) by every
  page's behavior script.
- **RTL-ready**: layout is written entirely with CSS logical properties
  (`inset-inline-*`, `margin-inline-*`, `border-inline-*`, `text-align:
  start`/`end`) — flipping `` re-flows the whole system with
  no CSS changes. This is exercised live: Arabic and Kurdish run RTL,
  English runs LTR, switched instantly by the language selector.
- **Accessibility**: skip-link, visible focus rings, `aria-expanded`/
  `aria-current`/`aria-label` on interactive controls, `prefers-reduced-
  motion` opt-outs on every animation, keyboard (Escape) close on the
  sidebar drawer and the language menu. ``/`` are kept
  in sync with the active language so screen readers announce content in
  the right language automatically.
- **Responsive**: fluid `clamp()` type scale, `.grid-2`/`.grid-3` collapse
  to one column under 820px, off-canvas sidebar below 1180px becomes a
  persistent rail above it.
- **Math rendering**: MathJax is vendored locally (`assets/mathjax/`) and
  configured for exactly one typeset pass per page (see
  `typesetOnceReady()` in the chapter behavior template) to avoid double-
  render/race conditions.

## Internationalization (i18n)

The entire interface is trilingual — **Arabic (default), Kurdish/Sorani,
English** — driven by one reusable engine (`assets/js/i18n.js`, exposed as
`window.PBI18n`) and three translation files (`assets/i18n/{ar,ku,en}.json`).
No page is duplicated per language and the URL never changes when the
language changes.

**How it works**
- Every `` tag carries a `data-assets` attribute (`""` at the repo
  root, `"../"` inside a chapter, `"../../"` inside a lesson folder) that
  tells `i18n.js` where `assets/i18n/` is relative to that page — the same
  convention `data-base` already uses for page-to-page links.
- On load, `i18n.js` reads the saved language from `localStorage`
  (`pb_lang`) or falls back to Arabic, fetches **only that one** JSON file,
  and sets `` / `` (`ar`/`ku` → `rtl`, `en` → `ltr`).
- Static markup opts in with `data-i18n="dotted.key"` (textContent),
  `data-i18n-aria-label` / `-title` / `-placeholder` / `-content` for
  attributes, and `data-i18n-title-tag` on `
