# Interactive Physics Book
### كتاب الطبيعيات التفاعلي

An interactive physics textbook built on a neumorphic design system: worked
examples with step-by-step reveal, interactive widgets, self-check quizzes,
and mind maps — organized as a home hub → chapters → lessons. Fully
trilingual (Arabic default, Kurdish/Sorani, English) with live language
switching — see [Internationalization](#internationalization-i18n) below.

The book has **eight chapter hubs** (`chapter-1/` … `chapter-8/`), each
wired up with its own progress tracking, sidebar, and breadcrumb — but with
**no lessons yet**. No physics content has been written; every chapter is
an empty, ready-to-build shell. See `templates/` for the reusable
architecture (design system, shared components, navigation, utilities) used
to build them and to add lessons later.

## Project structure

```
index.html                          Home page: hero + 8 chapter cards
chapter-1/ … chapter-8/
  index.html                        Chapter hub: title, breadcrumb, empty
                                     progress bar, empty lesson grid — no
                                     lessons/ subfolder yet
assets/
  css/theme.css                     Design system: neumorphism, light/dark
                                     theme, layout primitives, all UI
                                     components (cards, examples, quiz,
                                     sidebar, breadcrumb, etc.), responsive
                                     + a11y rules
  js/
    i18n.js                         Internationalization engine (PBI18n) —
                                     language switcher, translation lookup,
                                     lang/dir attribute management
    site-home.js                    Home page behavior (theme toggle, reveal)
    site-ch1.js … site-ch8.js       Per-chapter behavior script, one per
                                     chapter (header/sidebar/progress),
                                     instantiated from the template below
                                     with an empty lesson list
    quiz.js                         Reusable self-check quiz engine (PBQuiz)
    plot.js                         Reusable SVG function-plotter (PBPlot)
  i18n/
    ar.json, ku.json, en.json       Translation resources — one JSON file
                                     per language; only the active one is
                                     ever fetched
  mathjax/                          Vendored MathJax (self-hosted, no CDN)
templates/
  chapter-template.html             Full chapter template (hero-visual,
                                     objectives, lesson grid, mind map) —
                                     copy from here when a chapter gets its
                                     first real lesson content
  chapter-behavior-template.js      Copy → assets/js/site-ch<N>.js
  lessons/lesson-template.html      Copy → chapter-<N>/lessons/lesson-<M>.html
PROJECT_RULES.md                    Consistency rules for future chapters
```

Once a chapter gets real lessons, it grows a `lessons/` subfolder:

```
chapter-<N>/
  index.html            Chapter hub: hero, objectives, lesson grid, mind map
  lessons/
    lesson-<M>.html      One page per lesson
```

## How to add lessons to a chapter

Read the header comment in `templates/chapter-template.html` — it's a
step-by-step checklist. In short:

1. Update that chapter's `assets/js/site-ch<N>.js` `CONFIG.lessons` array
   with one entry per lesson.
2. Expand `chapter-<N>/index.html` (start from `templates/chapter-
   template.html` for the fuller hero-visual/objectives/mind-map sections)
   and replace its empty lesson grid with real `.lesson-card` entries.
3. Copy `templates/lessons/lesson-template.html` to
   `chapter-<N>/lessons/lesson-<M>.html` for each lesson.
4. Update that chapter's card on the home page (`index.html`'s
   `#chapterGrid`) with the real lesson count and progress.

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
  no CSS changes. This is exercised live: Arabic and Kurdish run RTL,
  English runs LTR, switched instantly by the language selector.
- **Accessibility**: skip-link, visible focus rings, `aria-expanded`/
  `aria-current`/`aria-label` on interactive controls, `prefers-reduced-
  motion` opt-outs on every animation, keyboard (Escape) close on the
  sidebar drawer and the language menu. `<html lang>`/`<html dir>` are kept
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
- Every `<html>` tag carries a `data-assets` attribute (`""` at the repo
  root, `"../"` inside a chapter, `"../../"` inside a lesson folder) that
  tells `i18n.js` where `assets/i18n/` is relative to that page — the same
  convention `data-base` already uses for page-to-page links.
- On load, `i18n.js` reads the saved language from `localStorage`
  (`pb_lang`) or falls back to Arabic, fetches **only that one** JSON file,
  and sets `<html lang>` / `<html dir>` (`ar`/`ku` → `rtl`, `en` → `ltr`).
- Static markup opts in with `data-i18n="dotted.key"` (textContent),
  `data-i18n-aria-label` / `-title` / `-placeholder` / `-content` for
  attributes, and `data-i18n-title-tag` on `<title>` for the document
  title. Add `data-i18n-params='{"n":5}'` alongside any of those for
  `{n}`-style interpolation.
- Dynamically-built markup (the chapter header/sidebar/lesson-nav, built by
  `assets/js/site-ch<N>.js`) calls `PBI18n.t(key, params)` directly while
  constructing its HTML, and re-runs that construction inside
  `PBI18n.onChange(...)` so it rebuilds instantly when the language changes
  — no page reload.
- Every page's static HTML **already contains real Arabic text** as its
  fallback content (not English placeholders), so a first-time visitor
  sees correct Arabic immediately, even before `i18n.js`'s fetch resolves;
  the fetch only matters for switching away from the default or for
  translating JS-built content.

**The language switcher** (`PBI18n.mountSwitcher(container)`) is a single
reusable component mounted into the header's `.header-actions` on every
page (statically on the home page, dynamically by each chapter's
`buildHeader()`). It shows all three languages with flag + name, persists
the choice to `localStorage`, and is fully keyboard/ARIA accessible
(`aria-haspopup`, `aria-expanded`, `role="menu"`, Escape to close).

**Adding a fourth language**: add `assets/i18n/<code>.json` with the same
key shape as the other three, add `<code>` to the `LANGS` array and its
label to the `lang.*` keys in every translation file, and add an
`RTL_LANGS` entry in `i18n.js` if it's right-to-left. Nothing else changes
— every page picks it up automatically.

**Educational content**: lesson content is designed to follow the same
pattern once written — give each piece of real lesson content its own key
(e.g. `"lessons.ch1.lesson1.objective1"`) in each language file and
reference it via `data-i18n` in the HTML, rather than hardcoding text. See
the i18n note near the top of `templates/chapter-template.html`.

## Reusable UI components (see `theme.css`)

Header/sidebar/footer, breadcrumb navigation, off-canvas table-of-contents
with scrollspy, progress bar + per-chapter completion tracking
(`localStorage`), hero sections, objective lists, definition boxes,
rule/formula boxes, callouts (tip/warn), worked examples with step-by-step
reveal, chained-equation flows, diagram/figure containers, interactive
slider + live SVG plot widgets, self-check quizzes, summary lists, mind-map
SVG containers, and prev/next lesson navigation (auto-built from each
chapter's lesson list).

**`.lesson-card--review`**: a modifier on `.lesson-card` (same pattern as
`.example.exercise-card`) that flags a chapter's final, comprehensive
review lesson — orange accent border, and the `.lesson-idx` number badge
replaced by a 🏆 gradient badge. Applied identically on every chapter's
`index.html` to the last lesson card (the MCQ/تعليل/problems review with
its self-check quiz), plus the matching `assets/i18n/{ar,ku,en}.json`
`ch<N>.lesson<M>NavTitle` sidebar-nav key and the `content/{ar,en}/chapter-
<N>/index.json` last-lesson `title`/`description` — so the sidebar, the
hub card, and its page-nav label all read as one consistent feature
instead of 8 one-off tweaks.

## Smart Search

A fullscreen search overlay (`assets/js/search.js` + `assets/css/search.css`)
indexes every chapter, lesson, definition, تعليل/تعداد box, worked example
and its solution, formula, figure, table, interactive-simulation title, quiz
question, and a curated physical-quantity dictionary — searchable across the
whole book, not just the current page.

**Index**: `assets/search/index.json` is a static, prebuilt file — nothing is
scanned or parsed at search time. Regenerate it after editing lesson content:

```
python3 tools/build-search-index.py
```

(requires `beautifulsoup4` + `lxml`: `pip3 install beautifulsoup4 lxml`).
Commit the regenerated `index.json` alongside your content change.

**Client**: `search.js` fetches that JSON once (prefetched idly after page
load, awaited on first open — never re-fetched, never re-parsed from HTML)
and keeps it in memory. Every keystroke (150ms-debounced) re-ranks that
in-memory array with plain substring/word matching against a precomputed,
Arabic-normalized `norm` field per item — no regex, no DOM queries, so a
full search stays well under the ~1,200-item index's linear-scan cost.

**Arabic matching**: `normalizeArabic()` folds hamza carriers (أ إ آ ٱ ء),
ي/ى/ئ, و/ؤ, and ة/ه to one canonical form and strips diacritics/tatweel, so
`سرعة` matches `السرعة` and `الطاقه` matches `الطاقة`. This function is
duplicated nowhere else — `tools/build-search-index.py` intentionally ships
raw title/text only and lets the client normalize once, so there is exactly
one place that owns these rules.

**Integration**: every page loads `search.css`/`search.js` (see any
`<head>`) and each chapter's `buildHeader()` (and `site-home.js`) calls
`window.PBSearch.mountButton(actions)` right next to the existing language
switcher — the same `header-actions` container `PBI18n.mountSwitcher` already
uses. Open it from that button, `Ctrl+K`, or `/` (both registered globally,
not just while the button is visible). Opening a result navigates to
`<lesson>.html#pbsearch:<snippet>`; every page checks that hash on load,
scrolls the matching content into view, and flashes it — no per-item IDs had
to be added to the existing 60 lesson pages for this to work.

## Book-wide tool pages

Five standalone pages sit alongside the chapter hubs — `formulas/`,
`dictionary/`, `units/`, `calculator/`, `exam-bank/` — linked from a new
"🧰 أدوات الكتاب" section on the home page and cross-linked to each other via
a small `.tools-subnav` bar. They share one header pattern
(`assets/js/page-shell.js`'s `PBToolsShell.init(activeId, onReady)`, which
builds the same brand/theme/language/search header every chapter page uses)
and one stylesheet (`assets/css/tools.css`), and are indexed in Smart Search
itself (`type: "tool"`) so `Ctrl+K` finds them too.

- **القوانين الفيزيائية** (`formulas/`, `assets/js/page-formulas.js`) —
  every `.rule-box` from all 8 chapters as its own card (name, MathJax-
  rendered equation, matched physical quantities/symbols/units, a nearby-
  paragraph explanation, and an "افتح الدرس" link), with instant search and
  chapter filter chips. Sourced from the *same* `assets/search/index.json`
  Smart Search already loads (via `window.PBSearch.fetchIndex()`) — no
  second fetch, no separate index. The quantity-matching and the raw-LaTeX
  capture (`formula`/`raw`/`explanation`/`quantities` fields) live in
  `tools/build-search-index.py`'s formula extraction.
- **قاموس المصطلحات** (`dictionary/`, `page-dictionary.js`) — every
  `definition`-type index item as a Term/Definition card, alphabetized by
  the *normalized* term (so hamza/alef-maqsura variants group under one
  letter instead of interleaving) via `Intl.Collator("ar")`, with instant
  search and highlight reusing `window.PBSearch.highlight()`.
- **الوحدات والتحويلات** (`units/`, `page-units.js` + `assets/data/units.json`)
  — 21 categories, each unit stored as `{a, b}` so `valueInSI = value*a + b`
  (linear for everything, affine only for temperature) — one converter
  formula handles every category, no special-casing. Fully client-side,
  updates live on input with no submit button.
- **الآلة الحاسبة العلمية** (`calculator/`, `assets/js/calc-engine.js` +
  `page-calculator.js`) — the parser/evaluator (`calc-engine.js`) is a
  hand-written recursive-descent tokenizer/evaluator with **no `eval()` or
  `new Function()`** — typed text is only ever walked as data, never
  executed as code. `page-calculator.js` is UI wiring only. Keyboard
  shortcuts are attached to the calculator's own display element (not
  `document`) so they can't collide with Smart Search's global `Ctrl+K`/`/`
  shortcuts.
- **بنك الأسئلة الوزارية** (`exam-bank/`, `page-exam-bank.js` +
  `assets/data/exam-bank.ar.json`) — extended/written-response questions
  (`علل`/`عرّف`/`احسب`/`قارن`/`اذكر`) in the style of official Iraqi
  Ministry of Education physics exams, 8-10 per chapter, each with a
  complete model answer — deliberately distinct in format from the MCQ
  self-check quizzes already at the end of every chapter. Content is
  Arabic-only (matching the register of real Ministry exams); the page
  chrome itself stays trilingual like every other page. Its dataset is
  fetched directly (`fetch()`, same pattern as `units/`'s
  `assets/data/units.json`) rather than sourced from Smart Search's shared
  index — full model answers for ~70 questions would needlessly bloat that
  index for every other page that loads it. Search still reuses
  `window.PBSearch.normalizeArabic()` / `buildFuzzyRegex()` / `highlight()`
  — no second Arabic-normalization function — applied to a plain-text
  snippet built from each question, since `highlight()` escapes its input
  and would otherwise corrupt the question's trusted HTML/MathJax markup.
  Each question reuses the book's own `.example` worked-solution styling
  (model answer behind a show/hide toggle, mirroring the chapter review
  lessons' step-by-step reveal) instead of a new component. Indexed in
  Smart Search as `type: "examQuestion"` so `Ctrl+K` finds individual
  questions too.

**A note on RTL for these pages**: short mixed Latin/symbol strings (button
labels like `n!`, `1/x`, `×10ˣ`; the calculator's expression/history) need
an explicit `direction:ltr` in `tools.css` — without it, the bidi algorithm
reorders these short runs inside the page's `dir="rtl"` context (the same
class of issue `theme.css` already documents for SVG `<text>`). Dark-mode
overrides in this file also need *both* the explicit `[data-theme="dark"]`
selector *and* the matching `@media (prefers-color-scheme: dark)` block —
omitting the second leaves a visible bug for anyone whose OS is in dark mode
but who hasn't touched the in-page theme toggle yet.
