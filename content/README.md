# Lesson content architecture

This is the pilot rollout of full multilingual content — **Chapter 1 only**,
Arabic (source of truth) + English. The rest of the book (chapters 2-8) is
still static HTML, unaffected by this change, and continues to work exactly
as before. See the root `README.md`'s "Multilingual content" section for the
integration summary; this file documents the schema and extraction/
rendering pipeline in detail.

## Why content moved out of HTML

Every other feature in this project (Smart Search, the tool pages) works by
*reading* the lesson HTML. That's fine for a single, fixed-language book.
It breaks down for real multilingual content: you cannot store "the lesson"
as one HTML file once its prose, examples, quiz, and simulation labels each
need 2+ language variants that swap **instantly, without a page reload**,
while preserving scroll position, open reveal-steps, quiz answers, and
simulation state. That requires the content to be *data*, fetched and
rendered by a client-side engine — hence `content/<lang>/chapter-<N>/
lesson-<M>.json`.

## Directory layout

```
content/
  ar/chapter-1/
    index.json          Chapter hub (hero, objectives, lesson cards, mindmap)
    lesson-1.json … lesson-8.json
  en/chapter-1/
    (same file names, same schema, translated values)
```

**Adding a language requires zero source-code changes**: create
`content/<code>/chapter-1/*.json` with the same shape, add `<code>` to
`assets/js/i18n.js`'s `LANGS` array (and, if RTL, `RTL_LANGS` — this is the
*existing*, already-documented mechanism the root README describes for UI
chrome; content languages ride the same list) and to `assets/i18n/<code>.json`
for the chrome strings, and add the language to `assets/js/lesson-engine.js`'s
`SUPPORTED_LANGS` array. The renderer, extraction script, and search index
are all schema-driven — none of them hardcode "ar" or "en".

## Where the JSON comes from

`content/ar/chapter-1/*.json` is **extracted, not hand-written** — it's a
mechanical, byte-faithful restructuring of the (still-canonical) Arabic
lesson HTML, produced by `tools/build-lesson-content.py`
(BeautifulSoup-based, mirrors the extraction approach `tools/
build-search-index.py` already uses for the search index, but captures full
content instead of truncated previews). Re-run it after editing a chapter-1
lesson's Arabic HTML directly (not recommended once a lesson is fully
migrated — edit the JSON instead — but the script exists for exactly that
edge case, and as a reference for how to write an equivalent extractor for
another chapter later).

`content/en/chapter-1/*.json` is **hand-translated**, field-by-field, from
the extracted Arabic JSON — not machine-translated, and not produced by
re-reading the HTML. Formulas (`formula.html`, every `latex` field, `given`/
`calc` LaTeX in examples) are copied verbatim, unchanged — only the prose
around them is translated. See "Translation notes" below.

## The `content` block stream

Each lesson JSON has a `content` array — the lesson's body, in original
document order. Every block has a `type`:

| type | renders as | key fields |
|---|---|---|
| `explanation` | `.card.neu` with `<h2>` | `heading`, `html` |
| `definition` / `enumeration` | `.def-box` (تعريف / تعداد) | `label`, `html` |
| (def-box with a 🔍/`تعليل` label extracts as `explanation` too — see below) |
| `formula` | `.rule-box` | `html` (contains the raw `$$...$$`/`\(...\)` LaTeX — **never translated**), optional `id` |
| `callout` | `.callout.tip` | `icon`, `strong`, `html` |
| `table` | a `<table>` inside `.card` | `heading`, `headers[]`, `rows[][]` |
| `diagram` | `.diagram-card` | `heading`, `descHtml`, `svg` (raw markup, kept as one string — see "Diagrams" below), `caption` |
| `example` | a problem `.example` + solution `.example` pair | `number`, `problemHtml`, `diagramSvg`/`diagramCaption` (optional), `solution: {given[], required, steps[], note, final}` |
| `simulation` | the widget's HTML chrome (heading, description, control labels, `<select>` options, preset/toggle buttons, static rule-box) | see "Interactive simulations" below |
| `sectionIntro` | a bare `<h2>` (+ optional lead paragraph) introducing a group of examples | `heading`, `leadHtml` |
| `paragraph` | a standalone `<p>` not attached to any heading | `html` |

A `def-box`'s **type is inferred from its label**: a 🔍/`تعليل` (scientific
explanation) label extracts as `"explanation"`, a 🔢/`تعداد` (enumeration)
label as `"enumeration"`, anything else as `"definition"` — the exact same
classification rule `tools/build-search-index.py` already uses, so a term
that's a "definition" in the dictionary tool is a "definition" here too.

`quiz`, `summary`, and `mindmap` are separate top-level fields (not part of
`content`) since they always render into fixed regions at the end of the
lesson, exactly like the original static pages.

## Interactive simulations: what's data vs. what's code

A lesson's bespoke SVG widget (its physics/drawing logic — e.g. the
centripetal-acceleration animator in lesson 1) is **not** re-implemented in
JSON. Only its *chrome* is data:

- `sectionHeading`, `descriptionHtml`, `svgAriaLabel`
- `controls[]` — each `.io-row`'s `labelHtml` (e.g. `"الانطلاق v = <span
  id=\"cmSpeedVal\">4</span> m/s"`) and the id of the input/select it labels
- `buttons[]` — any standalone toggle button's own label (e.g. lesson 4's
  "↺ عكس اتجاه الدوران")
- `selectOptions[]` / `presets[]` — `<select><option>` and `[data-preset]`
  button text
- `ruleBoxHtml` / `ruleBoxId` — a static rule-box's initial text, OR (if it
  has an id) just its id, since the widget's own JS owns writing to it

The widget's `<svg id="...">` mount point and its accompanying `<script>`
(the actual drawing/physics code) **stay in the lesson HTML, untouched**.
`assets/js/lesson-engine.js` renders the chrome from JSON; the widget script
still runs exactly as it always did.

**In-canvas text** (the handful of strings a widget draws *inside* its own
SVG via `textContent =`, e.g. lesson 2's "⚠️ انزلاق!" / "✅ مسار آمن", or a
computed status sentence) is the one place code and content still meet:
each such widget calls `PBLessonEngine.simText("someKey", "fallback Arabic
string")` instead of hardcoding the literal, and re-runs its own existing
redraw function when the language changes (most already redraw continuously
via `requestAnimationFrame` or on the next slider `input` event, so this is
usually automatic — see `assets/js/lesson-engine.js`'s
`onLanguageChanged` list). The lookup keys and their per-language strings
live in that lesson's `content[].labels` field. This is intentionally the
*only* widget surgery required — geometry, physics, and animation logic are
never touched.

## Diagrams: figures vs. mindmaps

Two different strategies, deliberately:

- **Decorative figures** (e.g. lesson 2's car-on-a-curve illustration) keep
  their entire `<svg>...</svg>` markup as one string per language in
  `diagram.svg` / `example.diagramSvg` — geometry never changes between
  languages, only the handful of `<text>` labels inside it, so storing the
  whole (small) SVG is simpler and just as correct as a generic templating
  system would be, without building one.
- **Mind maps** (lesson mindmaps + the chapter hub's mindmap) use a fixed,
  reusable geometry the whole project already follows (one center node +
  3-4 satellite nodes at established coordinates/colors) — `mindmap.center`/
  `mindmap.satellites` store only `{cx, cy, r, color, lines[]}` per node, and
  `assets/js/lesson-engine.js` regenerates the exact same SVG markup from
  that data. This is the one diagram type worth genericizing, since its
  shape is identical across every lesson in the book.

## Translation notes (Arabic → English, chapter 1)

- **Formulas never change.** Every `latex`/`html` field containing
  `$$...$$` or `\(...\)` delimiters is copied byte-for-byte from the Arabic
  JSON. Only the Arabic *prose* around a formula (`note`, `intro`,
  `explanation`) is translated.
- **Terminology follows standard physics-education English**, not literal
  word-for-word translation — e.g. القوة المركزية → "centripetal force"
  (not "central force", a different concept), عزم القصور الذاتي → "moment
  of inertia", الزخم الزاوي → "angular momentum", التعجيل الزاوي → "angular
  acceleration". Where the Arabic uses a named law (قانون كبلر الثالث →
  "Kepler's third law"), the English keeps the same canonical name.
- **Symbols and unit abbreviations are untouched**: `v`, `r`, `ω`, `a_c`,
  `F_c`, `kg·m²`, `km/h`, etc. stay exactly as printed — only the
  surrounding Arabic words translate.

## Search

`tools/build-search-index.py` builds one index **per language**:
`assets/search/index.ar.json` (still built by scraping chapters 2-8's HTML,
since they're not migrated yet, plus chapter 1's HTML for full-book
continuity) and `assets/search/index.en.json` (chapter 1 only, built from
`content/en/chapter-1/*.json` — the only chapter with English content to
index). `assets/js/search.js` fetches whichever index matches the page's
current UI language (`PBI18n`'s active language) and re-fetches (cached per
language) on a language change, so "English search → English content"
holds without any change to the ranking/matching engine itself.
