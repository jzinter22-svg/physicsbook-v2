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
CH1 = ROOT / "chapter-1"
OUT = ROOT / "content" / "ar" / "chapter-1"


def inner_html(el):
    """Serialize an element's children (not the wrapper tag itself),
    preserving inline formatting (<b>, <sub>) and raw MathJax delimiters —
    both must survive verbatim for the renderer/MathJax to work."""
    if el is None:
        return ""
    return el.decode_contents().strip()


def text(el):
    return el.get_text(" ", strip=True) if el else ""


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
    return {
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
            "html": inner_html(note_callout.select_one("span:nth-of-type(2)") or note_callout),
        }
    final = solution_div.select_one(".exercise-final")
    sol["final"] = inner_html(final) if final else None
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
    panel = section.select_one(".io-panel")
    has_control = section.select_one(".io-row input, .io-row select, .io-panel button[id]")
    # law2-widget (lesson 3) has neither: it's a purely passive, continuously
    # animated SVG + a live-updating rule-box readout, no user control at
    # all — still needs to be a simulation block (not fall through to being
    # misread as a bare "formula" block, which would silently drop its
    # heading, description, and the SVG mount itself).
    has_live_svg = panel and panel.select_one("svg[id]")
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
    buttons = [{"id": b.get("id"), "html": inner_html(b)} for b in panel.find_all("button", id=True, recursive=True)]
    select = panel.select_one("select")
    select_id = select.get("id") if select else None
    select_options = None
    if select:
        select_options = [{"value": o.get("value"), "text": text(o)} for o in select.select("option")]
    presets = section.select("[data-preset]")
    preset_list = [{"value": p.get("data-preset"), "label": text(p)} for p in presets] if presets else None
    rule_box = panel.select_one(".rule-box")
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
        "ruleBoxHtml": inner_html(rule_box) if rule_box and not rule_box.get("id") else None,
        "ruleBoxId": rule_box.get("id") if rule_box else None,
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
                data["content"].append({
                    "type": classify_defbox(defbox),
                    # inner_html (not text()) to preserve inline tags like <sub>c</sub>
                    # in labels such as "التعجيل المركزي (a<sub>c</sub>)" — text()
                    # would insert a stray space between "a" and its subscript.
                    "label": inner_html(defbox.select_one(".def-label")),
                    "html": inner_html(defbox.select_one("p") or defbox),
                })
                continue

            callout = sec.select_one(".callout")
            if callout:
                strong = callout.find("b")
                span2 = callout.select_one("span:nth-of-type(2)")
                data["content"].append({
                    "type": "callout",
                    "icon": text(callout.select_one(".icon")),
                    "strong": text(strong) if strong else "",
                    "html": inner_html(span2) if span2 else inner_html(callout),
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

            card = sec.select_one(".card")
            if card:
                h2c = card.find("h2")
                paras = card.find_all("p", recursive=False)
                if h2c:
                    data["content"].append({"type": "explanation", "heading": text(h2c), "html": "".join(inner_html(p) for p in paras)})
                else:
                    for p in paras:
                        data["content"].append({"type": "paragraph", "html": inner_html(p)})
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


def main():
    ar_json = json.loads((ROOT / "assets/i18n/ar.json").read_text(encoding="utf-8"))
    lesson_titles = ar_json["ch1"]
    n = sum(1 for k in lesson_titles if re.match(r"lesson\d+NavTitle", k))

    OUT.mkdir(parents=True, exist_ok=True)
    for m in range(1, n + 1):
        path = CH1 / "lessons" / f"lesson-{m}.html"
        # Once a lesson's HTML has been refactored to the mount-point pattern
        # (its content sections replaced by <div id="lessonContentBlocks">),
        # this script has nothing left to extract — running it anyway would
        # silently overwrite the already-migrated JSON with an empty stub.
        # Edit the JSON directly for a migrated lesson instead (see
        # content/README.md); skip it here rather than destroy real content.
        if "lessonContentBlocks" in path.read_text(encoding="utf-8"):
            print(f"Skipping lesson-{m}: already migrated to the mount-point pattern (content/ar/chapter-1/lesson-{m}.json is now hand-maintained).")
            continue
        data = extract_lesson(path, m, 1, n)
        out_path = OUT / f"lesson-{m}.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out_path} ({len(data['content'])} content blocks)")


if __name__ == "__main__":
    main()
