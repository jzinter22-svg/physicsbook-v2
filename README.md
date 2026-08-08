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
  icons/
    sprite.svg                      Canonical source for every UI icon (35
                                     hand-drawn Feather/Lucide-style symbols,
                                     stroke="currentColor") — human-editable
                                     reference only; pages never load it
                                     directly (see assets/js/icons.js below)
  css/
    theme.css                       Design system: neumorphism, light/dark
                                     theme, layout primitives, all UI
                                     components (cards, examples, quiz,
                                     sidebar, breadcrumb, etc.), responsive
                                     + a11y rules, plus the `svg.icon`
                                     utility class (1em square, recolors via
                                     currentColor)
    tools.css                       Styles for the four tool pages
    search.css                      Smart Search overlay styles
    splash.css                      Home-page splash-screen styles
  js/
    icons.js                        Self-injects the icon sprite (mirrored
                                     from assets/icons/sprite.svg) as the
                                     first child of <html> on every page —
                                     external `<use href="sprite.svg#id">`
                                     is blocked by browsers under `file://`
                                     (treated as cross-origin), so this loads
                                     via a plain <script src> tag instead and
                                     every icon is then referenced same-
                                     document as `<svg class="icon"
                                     aria-hidden="true"><use href="#icon-
                                     name"></use></svg>`. Must be kept in
                                     sync by hand with sprite.svg.
    i18n.js                         Internationalization engine (PBI18n) —
                                     language switcher, translation lookup,
                                     lang/dir attribute management
    site-home.js                    Home page behavior (theme toggle, reveal)
    splash.js                       Home-page splash screen (4s intro, then
                                     fades into the hub content underneath).
                                     Shown once per browser — an inline
                                     script right after the splash markup in
                                     index.html checks localStorage
                                     (`pb_splash_seen`, set by splash.js once
                                     the intro has played through) and
                                     removes the overlay before it paints on
                                     every subsequent visit
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
- **Icons**: every UI icon is an inline `<svg class="icon"><use href="#icon-
  name">` reference into the sprite `assets/js/icons.js` injects (source of
  truth: `assets/icons/sprite.svg`) — no emoji-as-icon anywhere in UI chrome.
  Sidebar sub-nav landmarks (`<section id="..." data-navlabel="..."
  data-navicon="...">`) carry the icon key separately from the (now
  emoji-free) nav label text; `data-navicon` maps to the same
  `assets/icons/sprite.svg#icon-` symbol set. Quoted example/content text
  (e.g. world-map captions, laser-type labels) is left as-is — only
  decorative UI icons were converted.
- **Per-chapter color identity**: each of the 8 chapters has its own
  two-stop gradient, `--ch<N>-accent-1`/`--ch<N>-accent-2` in `theme.css`'s
  `:root`, chosen to evoke that chapter's actual subject (e.g. laser-red→
  violet for Ch.6 لليزر والبلازما, muted bronze→near-black for Ch.7 النفط
  الخام so it visibly reads as a different register than the brighter
  chapters) rather than drawn from the old shared 6-color cycle. The same
  pair is used **everywhere** that chapter's color appears — its home-page
  card, every `.lesson-idx` badge on its own hub page, and its header/
  sidebar `.brand-badge` (via `chapterAccentStyle()` in the chapter
  behavior template, derived from `CONFIG.chapterNumber` — no separate
  color field to keep in sync). Every stop is verified at ≥4.5:1 contrast
  against the white badge text/icon color that always sits on top of it;
  because that badge is fully opaque, this ratio doesn't change between
  light and dark mode (unlike `--bg`/`--surface`/`--text-*`), so — like the
  existing `--accent-purple`/`--accent-blue`/etc. above — there's a single
  definition, no `[data-theme="dark"]` override needed.

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
