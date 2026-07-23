# Interactive Physics Book
### كتاب الطبيعيات التفاعلي

An interactive physics textbook built on a neumorphic design system: worked
examples with step-by-step reveal, interactive widgets, self-check quizzes,
and mind maps — organized as a home hub → chapters → lessons. Fully
trilingual (Arabic default, Kurdish/Sorani, English) with live language
switching — see [Internationalization](#internationalization-i18n) below.

The book has **nine chapter hubs** (`chapter-1/` … `chapter-9/`), each
wired up with its own progress tracking, sidebar, and breadcrumb — but with
**no lessons yet**. No physics content has been written; every chapter is
an empty, ready-to-build shell. See `templates/` for the reusable
architecture (design system, shared components, navigation, utilities) used
to build them and to add lessons later.

## Project structure

```
index.html                          Home page: hero + 9 chapter cards
chapter-1/ … chapter-9/
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
    site-ch1.js … site-ch9.js       Per-chapter behavior script, one per
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
