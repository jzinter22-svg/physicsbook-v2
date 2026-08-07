#!/usr/bin/env python3
# ===========================================================================
# Lesson content extractor — pilot: Chapter 1, Arabic source of truth.
# ---------------------------------------------------------------------------
# Walks chapter-1's existing (still-authoritative) lesson HTML and mechanically
# extracts its content into content/ar/chapter-1/lesson-<N>.json, following
# the schema documented in content/README.md. This is pure extraction (byte-
# identical text, just restructured) — no translation happens here. See
# tools/translate-lesson-content.py-equivalent hand-authored files under
# content/en/ for the English versions, produced by translating THESE JSON
# files field-by-field (not by re-reading the HTML).
#
# Usage: python3 tools/build-lesson-content.py
# ===========================================================================
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent


def chapter_dir(cn):
    return ROOT / f"chapter-{cn}"


def out_dir(cn):
    return ROOT / "content" / "ar" / f"chapter-{cn}"


def inner_html(el):
    """Serialize an element's children (not the wrapper tag itself),
    preserving inline formatting (<b>, <sub>) and raw MathJax delimiters —
    both must survive verbatim for the renderer/MathJax to work."""
    if el is None:
        return ""
    return el.decode_contents().strip()


def text(el):
    return el.get_text(" ", strip=True) if el else ""


def html_after_lead_b(el):
    """inner_html(el) with its first <b> child removed — for callout bodies
    like <span><b>ملاحظة:</b> رest of the sentence</span>, where the <b>'s
    text is already captured separately as the block's `strong` field.
    Keeping it in `html` too would make the renderer show it twice."""
    if el is None:
        return ""
    b = el.find("b")
    if b:
        b.extract()
    return inner_html(el)


def classify_defbox(box):
    label = text(box.select_one(".def-label"))
    if "🔍" in label or "تعليل" in label:
        return "explanation"
    if "🔢" in label or "تعداد" in label:
        return "enumeration"
    return "definition"


def extract_hero(soup):
    hero = soup.select_one(".hero")
    return {
        "eyebrow": text(hero.select_one(".eyebrow")),
        "title": inner_html(hero.select_one("h1")),
        "lead": inner_html(hero.select_one("p.lead")),
    }


def extract_objectives(soup):
    obj_section = soup.select_one("#objectives")
    if not obj_section:
        return []
    return [inner_html(li.select_one("span:nth-of-type(2)") or li) for li in obj_section.select(".obj-list li")]


def extract_objectives_heading(soup):
    obj_section = soup.select_one("#objectives")
    h2 = obj_section.select_one("h2") if obj_section else None
    return text(h2) if h2 else None


def extract_mindmap(soup):
    wrap = soup.select_one("#mindmap .mindmap-wrap svg")
    if not wrap:
        return None
    groups = wrap.find_all("g", recursive=False)
    nodes = []
    for g in groups:
        circle = g.find("circle")
        texts = [t.get_text(strip=True) for t in g.find_all("text")]
        if not circle or not texts:
            continue
        nodes.append({
            "cx": float(circle.get("cx")), "cy": float(circle.get("cy")), "r": float(circle.get("r")),
            "color": circle.get("fill"), "lines": texts,
        })
    # first node (largest r, usually first in doc order) is the center; rest are satellites
    center = nodes[0] if nodes else None
    satellites = nodes[1:] if nodes else []
    # lxml's HTML parser lowercases SVG's camelCase attributes (viewBox -> viewbox)
    viewBox = wrap.get("viewBox") or wrap.get("viewbox")
    mm_h2 = soup.select_one("#mindmap h2")
    return {
        "heading": text(mm_h2) if mm_h2 else None,
        "ariaLabel": wrap.get("aria-label", ""),
        "viewBox": viewBox,
        "center": center,
        "satellites": satellites,
    }


def extract_quiz(soup):
    quiz = soup.select_one("[data-quiz]")
    if not quiz:
        return None
    questions = []
    for q in quiz.select(".quiz-q"):
        opts = [inner_html(span) for label in q.select(".quiz-opt") for span in [label.select_one("span")]]
        questions.append({
            "correct": int(q.get("data-correct")),
            "question": inner_html(q.select_one(".quiz-q-title span:nth-of-type(2)")),
            "options": opts,
            "explain": inner_html(q.select_one(".quiz-explain")),
        })
    return {"heading": text(quiz.select_one("h2")), "questions": questions}


def extract_summary(soup):
    s = soup.select_one("#summary")
    if not s:
        return None
    return {
        "heading": text(s.select_one("h2")),
        "items": [inner_html(li.select_one("span") or li) for li in s.select(".summary-list li")],
    }


def extract_example(problem_div, solution_div, number):
    # .example-problem only exists in the worked-example lessons (1-7); the
    # end-of-chapter questions lesson (8) has no such wrapper — its problem
    # is just whatever direct-child elements sit in .example besides the
    # .example-head badge (a bare <p>, sometimes plus a <ul> of MCQ options).
    problem_el = problem_div.select_one(".example-problem")
    if problem_el:
        problem_html = inner_html(problem_el)
    else:
        # str(c), not inner_html(c): a <ul> of MCQ options needs its own
        # wrapping tag preserved, not just its <li> children.
        parts = [str(c) for c in problem_div.find_all(recursive=False)
                 if not (c.get("class") and "example-head" in c.get("class"))
                 and not (c.get("class") and "diagram-wrap" in c.get("class"))]
        problem_html = "".join(parts)
    ex = {"number": number, "problemHtml": problem_html}
    # Lessons 1-7's problem head always wraps its number in a
    # .example-badge span (rendered as "N  مثال (N)"); lesson 8's
    # mcq/illal/theory/problems heads have no badge at all — just a bare
    # h2 ("1", "مسألة 1", "السؤال"). That structural difference is the
    # reliable signal for whether the default "مثال (N)" title applies or
    # the source's own literal label must be preserved instead.
    problem_head = problem_div.select_one(".example-head")
    if problem_head and not problem_head.select_one(".example-badge"):
        h2 = problem_head.select_one("h2")
        if h2:
            ex["label"] = text(h2).strip()
    diagram = problem_div.select_one(".diagram-wrap")
    if diagram:
        ex["diagramSvg"] = str(diagram.find("svg"))
        ex["diagramCaption"] = text(diagram.select_one(".diagram-caption"))
    if solution_div is None:
        return ex
    sol = {}
    given_ul = solution_div.select_one(".summary-list")
    if given_ul:
        sol["given"] = [inner_html(li.select_one("span") or li) for li in given_ul.select("li")]
    # "required" paragraph: the <p> right after the 🎯 label paragraph
    ps = solution_div.find_all("p", recursive=False)
    required = None
    for i, p in enumerate(ps):
        if "🎯" in p.get_text():
            if i + 1 < len(ps):
                required = inner_html(ps[i + 1])
            break
    sol["required"] = required
    steps = []
    for li in solution_div.select("ol.steps > li.step"):
        note = text(li.select_one(".calc-note"))
        calc_items = []
        flow = li.select_one(".calc-flow")
        if flow:
            for child in flow.find_all(recursive=False):
                cls = child.get("class", [])
                kind = "arrow" if "calc-arrow" in cls else ("box" if "calc-box" in cls else "line")
                calc_items.append({"kind": kind, "latex": inner_html(child)})
        steps.append({"note": note, "calc": calc_items})
    sol["steps"] = steps
    note_callout = solution_div.select_one(".callout")
    if note_callout:
        strong = note_callout.find("b")
        sol["note"] = {
            "icon": text(note_callout.select_one(".icon")),
            "strong": text(strong) if strong else "",
            "html": html_after_lead_b(note_callout.select_one("span:nth-of-type(2)") or note_callout),
        }
    # A static illustration svg (no live controls) sometimes sits directly
    # inside a solution, after the steps and before .exercise-final (e.g.
    # ch3 lesson-6's short-answer section: a generator-parts diagram, a
    # four-cases diagram) — captured verbatim like problem_div's
    # .diagram-wrap svg above, or it would be silently dropped entirely
    # once the surrounding HTML is replaced by the JSON-driven mount point.
    sol_diagram_wrap = solution_div.select_one(".mindmap-wrap")
    if sol_diagram_wrap:
        sol_diagram_svg = sol_diagram_wrap.find("svg")
        if sol_diagram_svg:
            sol["diagramSvg"] = str(sol_diagram_svg)
    final = solution_div.select_one(".exercise-final")
    sol["final"] = inner_html(final) if final else None
    # Same badge-vs-bare-h2 signal as the problem head, but the bare h2
    # here also carries a literal leading "✓" baked into its text (lesson
    # 8: "✓ الحل" / "✓ التعليل" / "✓ الإجابة") since it has no separate
    # checkmark badge span to supply that glyph — strip it so the renderer
    # can prepend its own "✓" badge consistently either way.
    sol_head = solution_div.select_one(".example-head")
    if sol_head and not sol_head.select_one(".example-badge"):
        h2 = sol_head.select_one("h2")
        if h2:
            label = text(h2).strip()
            if label.startswith("✓"):
                label = label[1:].strip()
            sol["label"] = label
    ex["solution"] = sol
    return ex


def extract_simulation(section):
    """A section is a 'simulation' block if it has a live control anywhere
    in it — a slider/select inside .io-row (the common case), OR a bare
    toggle button inside .io-panel (e.g. lesson 4's right-hand-rule widget,
    which has no slider at all, just one "reverse direction" button). An
    SVG mount and an .io-panel wrapper are both common but NOT required
    (lesson 7's sphere-widget is one slider driving a computed rule-box
    value, no canvas). The widget's own JS keeps driving whatever it draws/
    writes — that JS stays untouched; only the surrounding chrome (heading,
    description, control/button labels, aria-labels) becomes data."""
    def is_sim_button(b):
        # data-reveal-steps is the universal "show solution steps" toggle
        # used inside every worked example/exercise's .example div, site-
        # wide — never a simulation control. Excluding it (and anything
        # nested inside .example, which only ever holds that same toggle or
        # a plain step-reveal button, never a widget picker) keeps this
        # broadened check from swallowing whole examples into a bogus
        # "simulation" block.
        if b.get("data-reveal-steps") is not None:
            return False
        if b.find_parent(class_="example") is not None:
            return False
        return bool(b.get("id")) or any(k.startswith("data-") for k in b.attrs)

    panel = section.select_one(".io-panel")
    has_control = section.select_one(".io-row input, .io-row select, .io-panel button[id]")
    # Button-driven "info card" widgets (e.g. an 8-way laser-type picker, or
    # a use-case picker for alloys) have neither an .io-panel wrapper nor
    # ids on their buttons — just a bare .io-row of buttons carrying
    # data-* attributes the widget's own JS reads via querySelectorAll, and
    # a live-updating .def-box (not .rule-box) as the output area. Any
    # button with an id OR a data- attribute counts as a live control too,
    # not just ones already inside a recognized .io-panel — checked across
    # the whole section, since a picker row (e.g. Young's-experiment
    # wavelength buttons) can sit as a sibling *before* .io-panel rather
    # than inside it.
    if not has_control:
        has_control = next((b for b in section.select("button") if is_sim_button(b)), None)
    # law2-widget (lesson 3) has neither: it's a purely passive, continuously
    # animated SVG + a live-updating rule-box readout, no user control at
    # all — still needs to be a simulation block (not fall through to being
    # misread as a bare "formula" block, which would silently drop its
    # heading, description, and the SVG mount itself). Checked across the
    # whole section (not just panel): several such passive-animation
    # widgets (e.g. ch2 l5's EM-wave illustration) have no .io-panel
    # wrapper at all — just a bare .mindmap-wrap svg inside a plain .card —
    # so scoping to panel alone would miss them and silently lose the SVG
    # mount to the generic "explanation" fallback. Excludes svgs nested
    # inside .example (e.g. ch3 l6's short-answer section, which mixes a
    # handful of Q&A .example pairs with small id'd illustration svgs
    # embedded *inside* individual answers) — those aren't a section-level
    # widget at all, and matching them here would make the whole mixed
    # section get swallowed into one bogus simulation block, dropping
    # every sibling .example in it.
    has_live_svg = next((svg for svg in section.select(".mindmap-wrap svg[id]")
                          if svg.find_parent(class_="example") is None), None)
    if not has_control and not has_live_svg:
        return None
    panel = panel or section
    svg = panel.select_one("svg[id]")
    heading = section.select_one("h2, h3")
    desc_p = heading.find_next_sibling("p") if heading else None
    controls = []
    for row in panel.select(".io-row"):
        label = row.select_one("label")
        inp = row.select_one("input")
        select = row.select_one("select")
        controls.append({
            "labelHtml": inner_html(label) if label else None,
            "inputId": inp.get("id") if inp else (select.get("id") if select else None),
            "rowId": row.get("id"),
            "rowStyle": row.get("style"),
            # The <input> itself (every control observed across chapter 1 is
            # a <input type="range" class="neu-range" min max step value> —
            # its id alone isn't enough to reconstruct it, the renderer needs
            # these to actually build a working slider).
            "inputType": inp.get("type") if inp else None,
            "inputClass": " ".join(inp.get("class", [])) if inp else None,
            "inputMin": inp.get("min") if inp else None,
            "inputMax": inp.get("max") if inp else None,
            "inputStep": inp.get("step") if inp else None,
            "inputValue": inp.get("value") if inp else None,
        })
    # Searches the whole section (not just panel): a picker row can sit as a
    # sibling *before* .io-panel rather than inside it (e.g. Young's-
    # experiment wavelength buttons). is_sim_button's id-or-data-attribute
    # test also naturally dedupes — each button is visited once.
    buttons = []
    for b in section.find_all("button", recursive=True):
        if not is_sim_button(b):
            continue
        data_attrs = {k: v for k, v in b.attrs.items() if k.startswith("data-")}
        buttons.append({
            "id": b.get("id"), "html": inner_html(b),
            "class": " ".join(b.get("class", [])) or None,
            "data": data_attrs or None,
            # A multi-way picker often color-codes each button (e.g. Young's-
            # experiment wavelength buttons: a colored inline left-border
            # matching that wavelength's visible color) — preserve it
            # verbatim rather than dropping the accent.
            "style": b.get("style"),
        })
    select = panel.select_one("select")
    select_id = select.get("id") if select else None
    select_options = None
    if select:
        select_options = [{"value": o.get("value"), "text": text(o)} for o in select.select("option")]
    presets = section.select("[data-preset]")
    preset_list = [{"value": p.get("data-preset"), "label": text(p)} for p in presets] if presets else None
    # Almost every widget has at most one .rule-box, but lesson 3's Kepler-
    # verification widget has two side by side (period AND r³/t² ratio) —
    # select_one() would silently keep only the first and drop the second
    # live-computed readout entirely, so collect all of them as a list.
    # Also covers a live-updating .def-box output area (e.g. an id'd info
    # card a button-picker widget fills in) — wrapperClass records which of
    # the two component styles to reproduce. html is always captured (not
    # nulled when id is present): most such boxes are empty shells the
    # widget's JS immediately overwrites via textContent, but the info-card
    # shape has its OWN nested id'd <span>/<p> children (e.g.
    # #laserInfoTitle/#laserInfoBody) that the renderer must reproduce
    # verbatim for the widget's getElementById calls to find anything.
    rule_boxes = [
        {"html": inner_html(rb), "id": rb.get("id"), "wrapperClass": "def-box" if "def-box" in (rb.get("class") or []) else "rule-box"}
        for rb in panel.select(".rule-box, .def-box[id]")
    ]
    # A <p> living directly inside .io-panel itself, after the rule-box
    # (e.g. lesson 2's banked-curve widget: "...the ideal speed at this
    # angle equals <b id="bankSpeedVal">8.1</b> m/s.") often holds a live-
    # computed value the widget's own JS writes into — capture it as markup
    # (not text()) so the <b id="..."> the widget targets survives.
    trailing_ps = panel.find_all("p", recursive=False)
    trailing_html = "".join(inner_html(p) for p in trailing_ps) if trailing_ps else None
    # When there's exactly one trailing <p> and it carries an id, the
    # widget's own JS almost certainly targets that id directly (a status/
    # caption line it writes into after the user interacts, e.g.
    # #bandCaption, #towerCaption) — capture the id so the renderer can
    # reproduce the element even when it starts out empty (trailing_html
    # would otherwise be "", and the old (falsy-html-only) render condition
    # would drop the element entirely, leaving the widget's
    # getElementById() call to return null and throw at runtime).
    trailing_id = trailing_ps[0].get("id") if len(trailing_ps) == 1 else None
    return {
        "svgId": svg.get("id") if svg else None,
        "svgAriaLabel": svg.get("aria-label", "") if svg else "",
        # lxml lowercases SVG's camelCase attributes (viewBox -> viewbox).
        "svgViewBox": (svg.get("viewBox") or svg.get("viewbox")) if svg else None,
        "svgWidth": svg.get("width") if svg else None,
        "svgHeight": svg.get("height") if svg else None,
        "sectionHeading": text(heading),
        "descriptionHtml": inner_html(desc_p) if desc_p else None,
        "controls": controls,
        "buttons": buttons or None,
        "selectId": select_id,
        "selectOptions": select_options,
        "presets": preset_list,
        "ruleBoxes": rule_boxes,
        "trailingHtml": trailing_html,
        "trailingId": trailing_id,
    }


def extract_lesson(path, lesson_num, chapter_num, total_lessons):
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
    main = soup.select_one("main")
    title_tag = soup.select_one("title")
    desc_tag = soup.select_one('meta[name="description"]')
    footer = soup.select_one(".site-footer")
    breadcrumb_lis = main.select(".breadcrumb li")

    data = {
        "lessonNumber": lesson_num,
        "chapterNumber": chapter_num,
        "meta": {
            "pageTitle": text(title_tag),
            "description": desc_tag.get("content", "") if desc_tag else "",
            "breadcrumbChapter": text(breadcrumb_lis[1]) if len(breadcrumb_lis) > 1 else "",
            "breadcrumbLesson": text(breadcrumb_lis[2]) if len(breadcrumb_lis) > 2 else "",
            "footer": text(footer),
        },
        "hero": extract_hero(soup),
        "objectivesHeading": extract_objectives_heading(soup),
        "objectives": extract_objectives(soup),
        "content": [],
        "quiz": extract_quiz(soup),
        "summary": extract_summary(soup),
        "mindmap": extract_mindmap(soup),
    }

    body_wrap = main.select_one('div[dir="rtl"]')
    sections = body_wrap.find_all("section", recursive=False)
    example_num = 0
    skip_ids = {"objectives", "quiz", "summary", "mindmap"}

    # A source lesson page groups its cards into <section id="..."
    # data-navlabel="...">...</section> landmarks (only some sections carry
    # an id/navlabel — most are anonymous single-card wrappers). The
    # renderer needs to reconstruct those same section boundaries (for the
    # sidebar's in-page sub-nav, scrollspy, and per-card fade-in) purely
    # from the flat `content` array, so every block emitted for a given
    # source <section> is tagged with the same `sectionGroup` index plus
    # that section's id/navlabel (null when the source section was
    # anonymous) — see content/README.md.
    section_group = 0
    for sec in sections:
        sec_id = sec.get("id", "")
        if sec_id in skip_ids or "hero" in (sec.get("class") or []):
            continue
        start_len = len(data["content"])
        try:
            # A section can mix an unrelated .callout with a simulation card
            # as direct-child siblings (e.g. lesson 2's "banked-curve"
            # section: a "did you know?" callout followed by the banked-
            # curve widget's own .card) — extract_simulation only looks
            # inside the widget's own card, so that sibling callout would
            # otherwise be silently dropped. Emit it as its own block first.
            # Scoped to sections that actually contain a simulation panel,
            # so a section that's *only* a callout still falls through to
            # the single-callout branch below instead of double-emitting.
            if sec.select_one(".io-panel"):
                for callout in sec.find_all("div", class_="callout", recursive=False):
                    strong = callout.find("b")
                    span2 = callout.select_one("span:nth-of-type(2)")
                    data["content"].append({
                        "type": "callout",
                        "icon": text(callout.select_one(".icon")),
                        "strong": text(strong) if strong else "",
                        "html": html_after_lead_b(span2) if span2 else html_after_lead_b(callout),
                    })

            sim = extract_simulation(sec)
            if sim:
                data["content"].append({"type": "simulation", **sim})
                continue

            # A section can hold an intro (h2, optionally + a lead paragraph)
            # AND/OR one or more .example pairs — e.g. lesson 8's "mcqs"/"illal"/
            # "theory"/"problems" sections each open with a bare <h2> (no lead)
            # and NEED that heading kept: it's the only thing distinguishing
            # "🧩 س2: علّل ما يأتي" from "📖 س3: سؤال نظري" once flattened. The
            # intro h2 can be nested a level deep (inside a .card), so search
            # recursively — but every .example ALSO carries its own nested h2
            # (a problem number or "✓ الحل"), so explicitly skip those.
            h2 = next((h for h in sec.select("h2") if h.find_parent(class_="example") is None), None)
            lead_p = next((p for p in sec.select("p.lead") if p.find_parent(class_="example") is None), None)
            # Only a *standalone* intro (h2 + an actual .lead paragraph, nothing
            # else) short-circuits here. A bare h2 with no lead and no other
            # recognized block (lesson 8's per-question-set headings) is handled
            # below instead, alongside whatever .example pairs follow it in the
            # same section — requiring lead_p here specifically avoids
            # mis-classifying a genuine explanation card (h2 + a *plain*, non-
            # "lead" paragraph, e.g. lesson 1's "💡 1-1 تمهيد") as an empty intro.
            if h2 and lead_p and not sec.select_one(".def-box, .rule-box, .example, table, .callout, .diagram-card"):
                data["content"].append({"type": "sectionIntro", "heading": text(h2), "leadHtml": inner_html(lead_p)})
                continue

            examples_here = sec.select(".example")
            if examples_here:
                if h2:
                    data["content"].append({"type": "sectionIntro", "heading": text(h2), "leadHtml": inner_html(lead_p) if lead_p else None})
                i = 0
                while i < len(examples_here):
                    box = examples_here[i]
                    head_text = text(box.select_one(".example-head")).strip()
                    # Every solution/answer head observed across chapter 1 starts
                    # with a checkmark — "✓ الحل", "✓ الحل التفصيلي", "✓ التعليل"
                    # (illal), "✓ الإجابة" (theory question) — while every problem
                    # head is a bare number/label ("1", "مسألة 1", "السؤال").
                    # Matching "الحل" specifically (as search-index extraction
                    # does, where it's a secondary check, not the only one) would
                    # miss the illal/theory variants and silently break pairing.
                    is_solution = head_text.startswith("✓")
                    if not is_solution:
                        example_num += 1
                        sol_div = None
                        if i + 1 < len(examples_here):
                            nxt = examples_here[i + 1]
                            if text(nxt.select_one(".example-head")).strip().startswith("✓"):
                                sol_div = nxt
                                i += 1
                        data["content"].append({"type": "example", **extract_example(box, sol_div, example_num)})
                    i += 1
                continue

            defbox = sec.select_one(".def-box")
            if defbox:
                # A def-box can hold several direct-child <p> tags (e.g. a
                # multi-paragraph explanation before a figure reference) —
                # select_one("p") only ever grabbed the first, silently
                # dropping every paragraph after it. Capture them all; the
                # first becomes "html" (rendered exactly as before) and any
                # remaining ones become "extraHtml" (rendered as additional
                # paragraphs by renderDefBox).
                intro_ps = defbox.find_all("p", recursive=False)
                intro_p = intro_ps[0] if intro_ps else None
                block = {
                    "type": classify_defbox(defbox),
                    # inner_html (not text()) to preserve inline tags like <sub>c</sub>
                    # in labels such as "التعجيل المركزي (a<sub>c</sub>)" — text()
                    # would insert a stray space between "a" and its subscript.
                    "label": inner_html(defbox.select_one(".def-label")),
                    # Falling back to the whole def-box only makes sense when
                    # there's no intro <p> AND no list either (a genuinely
                    # bare def-box) — with a list present but no <p> (an
                    # enumeration whose items sit directly under the label,
                    # e.g. "🔢 تعداد — نوعا عملية التكسير"), that fallback would
                    # re-embed the label span and the whole list a second
                    # time inside b.html, duplicating them alongside the
                    # separately-captured listItems below.
                    "html": inner_html(intro_p) if intro_p else (
                        "" if defbox.select_one("ol, ul") else inner_html(defbox)
                    ),
                }
                if len(intro_ps) > 1:
                    block["extraHtml"] = [inner_html(p) for p in intro_ps[1:]]
                # An enumeration def-box's intro <p> is sometimes followed by
                # its own <ol>/<ul> of items (e.g. "🔢 تعداد — منتجات مصنّعة من
                # النفط الخام" listing 10 products) — select_one("p") above
                # only ever grabbed that intro sentence, silently dropping the
                # whole list. style is captured verbatim (not just gap/margin)
                # since at least one of these lists uses a 2-column layout.
                defbox_list = defbox.select_one("ol, ul")
                if defbox_list:
                    block["listItems"] = [inner_html(li) for li in defbox_list.select(":scope > li")]
                    block["listOrdered"] = defbox_list.name == "ol"
                    block["listStyle"] = defbox_list.get("style")
                data["content"].append(block)
                continue

            callout = sec.select_one(".callout")
            if callout:
                strong = callout.find("b")
                span2 = callout.select_one("span:nth-of-type(2)")
                data["content"].append({
                    "type": "callout",
                    "icon": text(callout.select_one(".icon")),
                    "strong": text(strong) if strong else "",
                    "html": html_after_lead_b(span2) if span2 else html_after_lead_b(callout),
                })
                continue

            rulebox = sec.select_one(".rule-box")
            if rulebox:
                data["content"].append({
                    "type": "formula",
                    "id": rulebox.get("id"),
                    "html": inner_html(rulebox),
                })
                continue

            table = sec.select_one("table")
            if table:
                heading = sec.find("h2")
                headers = [text(th) for th in table.select("thead th")]
                rows = [[inner_html(td) for td in tr.select("td")] for tr in table.select("tbody tr")]
                data["content"].append({"type": "table", "heading": text(heading), "headers": headers, "rows": rows})
                continue

            diagram = sec.select_one(".diagram-card")
            if diagram:
                h3 = diagram.find(["h2", "h3"])
                svg = diagram.select_one("svg")
                data["content"].append({
                    "type": "diagram",
                    "heading": text(h3) if h3 else None,
                    "descHtml": inner_html(diagram.select_one("p")) if diagram.select_one("p") else None,
                    "svg": str(svg) if svg else None,
                    "caption": text(diagram.select_one(".diagram-caption")),
                })
                continue

            # A one-off shape seen in ch2 l2: a plain .card (not .diagram-card)
            # wrapping a static, pre-drawn .mindmap-wrap svg with no id of its
            # own and no live control anywhere in the section — a labeled
            # apparatus schematic, not a JS-driven widget canvas (that's
            # extract_simulation's job, tried earlier and correctly skipped
            # this section since it has no input/select/button-with-id/data-*
            # and no id'd svg to recognize as "live"). Reuse the "diagram"
            # shape rather than inventing a new one — its svg field already
            # carries the full markup (including any nested id'd child, e.g.
            # a placeholder <g> a *different* widget's JS fills in) verbatim,
            # translated the same way as any other embedded-HTML field: by
            # editing the <text> nodes inside the captured svg string.
            plain_svg_card = sec.select_one(".card")
            svg_no_id = plain_svg_card.select_one(".mindmap-wrap svg") if plain_svg_card else None
            if svg_no_id and not svg_no_id.get("id"):
                h3 = plain_svg_card.find(["h2", "h3"])
                p = plain_svg_card.find("p")
                data["content"].append({
                    "type": "diagram",
                    "heading": text(h3) if h3 else None,
                    "descHtml": inner_html(p) if p else None,
                    "svg": str(svg_no_id),
                    "caption": None,
                })
                continue

            card = sec.select_one(".card")
            list_el = card.select_one(".obj-list, .summary-list") if card else None
            if card and list_el:
                # A plain content card whose body is a list (e.g. "sources of
                # coherence: 1) laser, 2) wave-splitting..." as .obj-list, or
                # a "symbol glossary" as .summary-list) rather than
                # paragraphs — same components the objectives/summary
                # sections use, just embedded mid-lesson. Must be checked
                # before the generic .card branch below: that branch only
                # looks for <p> children, so a heading+list card with no <p>
                # at all would fall through with joined="" and silently lose
                # the entire list. `ordered` tells the renderer which of the
                # two (numbered-circle vs plain-bullet) to reproduce.
                hc = card.find(["h2", "h3"])
                items = [inner_html(li.select_one("span:nth-of-type(2)") or li) for li in list_el.select(":scope > li")]
                data["content"].append({
                    "type": "list", "heading": text(hc) if hc else None, "items": items,
                    "ordered": "obj-list" in (list_el.get("class") or []),
                })
                continue

            card = sec.select_one(".card")
            if card:
                h2c = card.find("h2")
                h3c = card.find("h3")
                paras = card.find_all("p", recursive=False)
                if not paras and not h2c and not h3c:
                    print(f"  !! EMPTY CARD in {path.name} section {sec_id!r}: no <p>, no heading")
                elif not paras:
                    # A bare sub-section title with no body of its own — the
                    # actual content continues in sibling sections (def-box
                    # entries, another card, etc.). Reusing sectionIntro's
                    # shape (leadHtml=None already renders heading-only)
                    # instead of losing the heading to an empty paragraph.
                    data["content"].append({"type": "sectionIntro", "heading": text(h2c or h3c), "leadHtml": None})
                    continue
                else:
                    # The renderer wraps this html in one outer <p>...</p>
                    # (see renderBlock's "explanation"/"paragraph" cases) —
                    # joining multiple sibling <p>s with plain "" ran them
                    # together with no space, and previously each got its
                    # own content-array entry (and its own separate .card
                    # wrapper once rendered) even though they're one card in
                    # the source. Joining with "</p><p>" closes/reopens
                    # correctly inside that outer <p>, preserving both the
                    # paragraph break and the single card.
                    joined = "</p><p>".join(inner_html(p) for p in paras)
                    if h2c:
                        data["content"].append({"type": "explanation", "heading": text(h2c), "html": joined})
                    else:
                        data["content"].append({"type": "paragraph", "html": joined})
                continue

            # Every recognized shape has been tried and none matched — this
            # section's content would otherwise be silently dropped. Surface it
            # loudly instead of guessing, so a real gap gets a new branch above
            # rather than quietly missing text.
            preview = text(sec)[:80]
            print(f"  !! UNRECOGNIZED SECTION in {path.name} id={sec_id!r}: {preview!r}")
        finally:
            if len(data["content"]) > start_len:
                navlabel = sec.get("data-navlabel")
                for b in data["content"][start_len:]:
                    b["sectionGroup"] = section_group
                    b["sectionId"] = sec_id or None
                    b["sectionNavLabel"] = navlabel
                section_group += 1

    return data


def process_chapter(cn, ar_json):
    lesson_titles = ar_json.get(f"ch{cn}", {})
    n = sum(1 for k in lesson_titles if re.match(r"lesson\d+NavTitle", k))
    if not n:
        print(f"Skipping chapter {cn}: no lessonNNavTitle keys found in ar.json's ch{cn}.")
        return

    out = out_dir(cn)
    out.mkdir(parents=True, exist_ok=True)
    for m in range(1, n + 1):
        path = chapter_dir(cn) / "lessons" / f"lesson-{m}.html"
        if not path.exists():
            print(f"  !! MISSING {path}")
            continue
        # Once a lesson's HTML has been refactored to the mount-point pattern
        # (its content sections replaced by <div id="lessonContentBlocks">),
        # this script has nothing left to extract — running it anyway would
        # silently overwrite the already-migrated JSON with an empty stub.
        # Edit the JSON directly for a migrated lesson instead (see
        # content/README.md); skip it here rather than destroy real content.
        if "lessonContentBlocks" in path.read_text(encoding="utf-8"):
            print(f"Skipping ch{cn} lesson-{m}: already migrated to the mount-point pattern (content/ar/chapter-{cn}/lesson-{m}.json is now hand-maintained).")
            continue
        data = extract_lesson(path, m, cn, n)
        out_path = out / f"lesson-{m}.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out_path} ({len(data['content'])} content blocks)")


def main():
    import sys
    ar_json = json.loads((ROOT / "assets/i18n/ar.json").read_text(encoding="utf-8"))
    if len(sys.argv) > 1:
        chapters = [int(a) for a in sys.argv[1:]]
    else:
        chapters = range(1, 9)
    for cn in chapters:
        process_chapter(cn, ar_json)


if __name__ == "__main__":
    main()
