#!/usr/bin/env python3
# ===========================================================================
# Smart Search — offline index builder
# ---------------------------------------------------------------------------
# Walks every chapter hub and lesson page, extracts every indexable piece of
# educational content (definitions, تعليل/تعداد boxes, worked examples and
# their solutions, end-of-chapter exercises, formulas, figures, interactive
# simulation titles, tables, quiz questions) and writes ONE static JSON file:
#   assets/search/index.json
#
# This is a dev-time tool, not part of the served site: assets/js/search.js
# only ever fetches the JSON it produces, so re-run this script after adding
# or editing lesson content and commit the regenerated index.json alongside
# it. Nothing about the served pages requires Node/Python at runtime — the
# site stays 100% static, GitHub Pages-compatible.
#
# Usage:  python3 tools/build-search-index.py
# ===========================================================================
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
AR_JSON = ROOT / "assets" / "i18n" / "ar.json"
OUT_PATH = ROOT / "assets" / "search" / "index.json"

CHAPTER_TITLES = {
    1: "الحركة الدائرية والدورانية",
    2: "التداخل والاستقطاب والحيود والاستطارة",
    3: "الحث الكهرومغناطيسي",
    4: "دوائر التيار المتناوب",
    5: "المواد شبه الموصلة والأجهزة الإلكترونية",
    6: "الليزر والبلازما",
    7: "النفط الخام",
    8: "الفلزات والسبائك",
}

# Arabic normalization (hamza/alef folding, ta-marbuta/ha, diacritics) is
# intentionally NOT duplicated here -- this index ships raw title/text only;
# assets/js/search.js's normalizeArabic() is the single source of truth,
# applied once client-side right after the index loads.
_WS_RE = re.compile(r"\s+")


_LATEX_TEXT_RE = re.compile(r"\\text\{([^{}]*)\}")
_LATEX_FRAC_RE = re.compile(r"\\d?frac\{([^{}]*)\}\{([^{}]*)\}")
_LATEX_SQRT_RE = re.compile(r"\\sqrt\{([^{}]*)\}")
_LATEX_GREEK = {
    "omega": "ω", "alpha": "α", "beta": "β", "tau": "τ", "lambda": "λ",
    "rho": "ρ", "theta": "θ", "phi": "φ", "varphi": "φ", "mu": "μ",
    "Delta": "Δ", "delta": "δ", "nu": "ν", "epsilon": "ε",
}
# Function names that must survive the generic "\command -> stripped" pass
# below (otherwise "\tan\theta" loses the word "tan" and keeps only "θ").
_LATEX_FUNCS = ("sin", "cos", "tan", "log", "ln")


def clean_text(s, limit=None):
    """Plain-text cleanup for previews: collapse whitespace, unwrap the
    handful of LaTeX constructs common in this book's worked-solution steps
    (\\text{}, \\dfrac{}{}, \\times, greek commands) into plain readable
    text. The raw LaTeX itself stays intact wherever MathJax renders it on
    the page — this only affects the search index's plain-text preview."""
    if not s:
        return ""
    s = s.replace("\\(", "").replace("\\)", "").replace("\\[", "").replace("\\]", "")
    s = s.replace("$$", "").replace("$", "")
    s = _LATEX_TEXT_RE.sub(r"\1", s)
    for _ in range(2):  # one pass handles non-nested fractions; two covers a nested pair
        s = _LATEX_FRAC_RE.sub(r"(\1)/(\2)", s)
    s = _LATEX_SQRT_RE.sub(r"√(\1)", s)
    s = s.replace("\\times", "×").replace("\\cdot", "·").replace("\\pm", "±")
    s = re.sub(r"\\[,;:!]", " ", s)  # LaTeX spacing commands
    for cmd, ch in _LATEX_GREEK.items():
        s = s.replace("\\" + cmd, ch)
    for fn in _LATEX_FUNCS:
        s = s.replace("\\" + fn, fn + " ")  # keep the function name itself
    s = re.sub(r"\\[A-Za-z]+", "", s)  # drop any remaining LaTeX commands
    s = s.replace("{", "").replace("}", "").replace("\\", "")
    s = _WS_RE.sub(" ", s).strip()
    if limit and len(s) > limit:
        s = s[:limit].rstrip() + "…"
    return s


def label_text(el):
    """Single-line label (def-label, badge, caption): no inline separators,
    so an adjacent <sub>/<sup> like a_c doesn't get split into 'a c'."""
    return el.get_text(strip=True) if el else ""


# ---------------------------------------------------------------------------
# Curated physical-quantity dictionary. Manually tagged with the chapter(s)
# each quantity is central to (this book's own scope — deliberately not
# auto-inferred, since a bare Latin/Greek letter alone is too ambiguous to
# reliably map back to a single meaning, e.g. "T" is both period and time
# constant, "I" is both current and moment of inertia across chapters).
# `relatedLessons` resolves at build time to every lesson in those chapters;
# `relatedFormulas` is filled in automatically below by scanning extracted
# formula entries for the symbol.
# ---------------------------------------------------------------------------
QUANTITIES = [
    {"symbol": "v", "name": "السرعة الخطية", "unit": "m/s", "aliases": ["velocity", "speed", "linear speed"], "chapters": [1]},
    {"symbol": "r", "name": "نصف القطر", "unit": "m", "aliases": ["radius"], "chapters": [1]},
    {"symbol": "ω", "name": "السرعة الزاوية", "unit": "rad/s", "aliases": ["omega", "angular velocity", "angular speed"], "chapters": [1]},
    {"symbol": "a_c", "name": "التعجيل المركزي", "unit": "m/s²", "aliases": ["centripetal acceleration"], "chapters": [1]},
    {"symbol": "F_c", "name": "القوة المركزية", "unit": "N", "aliases": ["centripetal force", "القوة"], "chapters": [1]},
    {"symbol": "T", "name": "الزمن الدوري", "unit": "s", "aliases": ["period", "periodic time"], "chapters": [1]},
    {"symbol": "α", "name": "التعجيل الزاوي", "unit": "rad/s²", "aliases": ["alpha", "angular acceleration"], "chapters": [1]},
    {"symbol": "θ", "name": "الازاحة الزاوية", "unit": "rad", "aliases": ["theta", "angular displacement"], "chapters": [1]},
    {"symbol": "I", "name": "عزم القصور الذاتي", "unit": "kg·m²", "aliases": ["moment of inertia"], "chapters": [1]},
    {"symbol": "τ", "name": "عزم الدوران", "unit": "N·m", "aliases": ["tau", "torque"], "chapters": [1]},
    {"symbol": "L", "name": "الزخم الزاوي", "unit": "kg·m²/s", "aliases": ["angular momentum"], "chapters": [1]},
    {"symbol": "G", "name": "ثابت الجذب العام", "unit": "N·m²/kg²", "aliases": ["gravitational constant"], "chapters": [1]},
    {"symbol": "λ", "name": "الطول الموجي", "unit": "m", "aliases": ["lambda", "wavelength"], "chapters": [2, 6]},
    {"symbol": "f", "name": "التردد", "unit": "Hz", "aliases": ["frequency"], "chapters": [2, 4, 6]},
    {"symbol": "n", "name": "معامل الانكسار", "unit": "—", "aliases": ["refractive index"], "chapters": [2]},
    {"symbol": "c", "name": "سرعة الضوء", "unit": "m/s", "aliases": ["speed of light"], "chapters": [2, 6]},
    {"symbol": "Φ", "name": "الفيض المغناطيسي", "unit": "Wb", "aliases": ["phi", "magnetic flux"], "chapters": [3]},
    {"symbol": "B", "name": "الكثافة الفيضية المغناطيسية", "unit": "T", "aliases": ["magnetic flux density"], "chapters": [3]},
    {"symbol": "N", "name": "عدد اللفات", "unit": "—", "aliases": ["number of turns"], "chapters": [3, 4]},
    {"symbol": "emf", "name": "القوة الدافعة الكهربائية المحتثة", "unit": "V", "aliases": ["induced emf", "faraday"], "chapters": [3]},
    {"symbol": "L_ind", "name": "الحث الذاتي", "unit": "H", "aliases": ["self inductance", "inductance"], "chapters": [3, 4]},
    {"symbol": "V", "name": "الفولتية (الجهد الكهربائي)", "unit": "V", "aliases": ["voltage", "potential difference", "فولتية", "فولت"], "chapters": [4, 5]},
    {"symbol": "I_ac", "name": "التيار الكهربائي", "unit": "A", "aliases": ["current", "أمبير"], "chapters": [3, 4, 5]},
    {"symbol": "R", "name": "المقاومة الأومية", "unit": "Ω", "aliases": ["resistance", "أوم"], "chapters": [4]},
    {"symbol": "X_L", "name": "المفاعلة الحثية", "unit": "Ω", "aliases": ["inductive reactance"], "chapters": [4]},
    {"symbol": "X_C", "name": "المفاعلة السعوية", "unit": "Ω", "aliases": ["capacitive reactance"], "chapters": [4]},
    {"symbol": "Z", "name": "الممانعة", "unit": "Ω", "aliases": ["impedance"], "chapters": [4]},
    {"symbol": "C", "name": "السعة المتسعية", "unit": "F", "aliases": ["capacitance"], "chapters": [4]},
    {"symbol": "P", "name": "القدرة الكهربائية", "unit": "W", "aliases": ["power", "واط"], "chapters": [4]},
    {"symbol": "cosφ", "name": "عامل القدرة", "unit": "—", "aliases": ["power factor"], "chapters": [4]},
    {"symbol": "E_g", "name": "فجوة الطاقة", "unit": "eV", "aliases": ["energy gap", "band gap"], "chapters": [5]},
    {"symbol": "h", "name": "ثابت بلانك", "unit": "J·s", "aliases": ["planck constant"], "chapters": [5, 6]},
    {"symbol": "ρ", "name": "الكثافة", "unit": "kg/m³", "aliases": ["rho", "density", "كثافة"], "chapters": [7, 8]},
]

TYPE_LABELS_AR = {
    "definition": "تعريف",
    "explanation": "تعليل",
    "enumeration": "تعداد",
    "example": "مثال",
    "exercise": "سؤال",
    "solution": "حل",
    "simulation": "محاكاة تفاعلية",
    "figure": "شكل توضيحي",
    "formula": "قانون",
    "table": "جدول",
    "lesson": "درس",
    "chapter": "فصل",
    "quantity": "كمية فيزيائية",
}


def text_of(el, sep=" "):
    return el.get_text(sep, strip=True) if el else ""


def make_item(items, **kw):
    # norm is intentionally NOT shipped in the JSON (it would roughly double
    # the file size, since it duplicates title+text). search.js computes it
    # once, in memory, right after the index loads — never per keystroke —
    # which is the "build the index at startup" behavior the spec asks for
    # without paying the download-size cost of a precomputed copy.
    items.append({k: v for k, v in kw.items() if v is not None})


def extract_lesson(items, soup, chapter_num, lesson_num, href, lesson_title, is_questions_lesson):
    main = soup.find("main") or soup

    # ---- Definitions / تعليل / تعداد (all share .def-box, disambiguated by
    # the def-label's leading emoji/keyword) --------------------------------
    for i, box in enumerate(main.select(".def-box")):
        label_el = box.select_one(".def-label")
        label = label_text(label_el)
        body = clean_text(text_of(box), limit=220)
        title = clean_text(re.sub(r"^[^\wأ-ي]+", "", label), limit=110) or lesson_title
        if "🔍" in label or "تعليل" in label:
            t = "explanation"
        elif "🔢" in label or "تعداد" in label:
            t = "enumeration"
        else:
            t = "definition"
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-{t}-{i}", type=t,
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=clean_text(label, 60) or title)

    # ---- Callouts (هل تعلم / تذكر) — folded into "explanation" ------------
    for i, box in enumerate(main.select(".callout")):
        body = clean_text(text_of(box), limit=220)
        title = clean_text(body, 60)
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-callout-{i}", type="explanation",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=title)

    # ---- Formulas (.rule-box) — kept in its own `formula` field (raw-ish,
    # cleaned) rather than duplicated into `text`, so search.js's generic
    # preview renderer just reads `item.formula || item.text`. ------------
    for i, box in enumerate(main.select(".rule-box")):
        formula = clean_text(text_of(box), limit=160)
        heading = box.find_previous(["h2", "h3"])
        title = clean_text(text_of(heading), 90) if heading else lesson_title
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-formula-{i}", type="formula",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, formula=formula, jump=None)

    # ---- Worked examples / end-of-chapter exercises + their solutions -----
    ex_type = "exercise" if is_questions_lesson else "example"
    examples = main.select(".example")
    i = 0
    ex_num = 0
    while i < len(examples):
        box = examples[i]
        is_solution = "الحل" in text_of(box.select_one(".example-head")) or "solution" in (box.get("class") or [])
        if not is_solution:
            ex_num += 1
            badge = label_text(box.select_one(".example-badge"))
            body = clean_text(text_of(box), limit=220)
            title = clean_text(f"{'سؤال' if ex_type == 'exercise' else 'مثال'} {badge or ex_num}", 60)
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-{ex_type}-{ex_num}", type=ex_type,
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=body, jump=clean_text(body, 50))
            # the very next .example, if present, is conventionally its solution
            if i + 1 < len(examples):
                sol = examples[i + 1]
                sol_head = text_of(sol.select_one(".example-head"))
                if "الحل" in sol_head or "حل" in sol_head:
                    sol_body = clean_text(text_of(sol), limit=260)
                    make_item(items, id=f"c{chapter_num}-l{lesson_num}-solution-{ex_num}", type="solution",
                              chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                              title=clean_text(f"حل {'السؤال' if ex_type == 'exercise' else 'المثال'} {badge or ex_num}", 60),
                              text=sol_body, jump=clean_text(sol_head, 40))
                    i += 1
        i += 1

    # ---- Figures (.diagram-caption) ----------------------------------------
    for i, cap in enumerate(main.select(".diagram-caption")):
        body = clean_text(label_text(cap), limit=180)
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-figure-{i}", type="figure",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=body, text=body, jump=clean_text(body, 50))

    # ---- Interactive simulations (.mindmap-wrap, titled by its section h2) -
    seen_sim_sections = set()
    for wrap in main.select(".mindmap-wrap"):
        section = wrap.find_parent("section")
        key = id(section) if section else id(wrap)
        if key in seen_sim_sections:
            continue
        seen_sim_sections.add(key)
        heading = section.find("h2") if section else None
        title = clean_text(text_of(heading), 90) if heading else f"محاكاة تفاعلية — {lesson_title}"
        desc_p = heading.find_next_sibling("p") if heading else None
        body = clean_text(text_of(desc_p), 200) if desc_p else title
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-sim-{len(seen_sim_sections)}", type="simulation",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=clean_text(title, 50))

    # ---- Tables (searchable, no dedicated filter chip — see README) --------
    for i, tbl in enumerate(main.select("table")):
        body = clean_text(text_of(tbl), limit=240)
        heading = tbl.find_previous(["h2", "h3"])
        title = clean_text(text_of(heading), 90) if heading else f"جدول — {lesson_title}"
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-table-{i}", type="table",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=None)

    # ---- Self-check quiz questions (folded into "exercise") ---------------
    for i, q in enumerate(main.select(".quiz-q")):
        qt = label_text(q.select_one(".quiz-q-title"))
        body = clean_text(text_of(q), limit=200)
        title = clean_text(qt, 90) or f"سؤال اختبار ذاتي {i+1}"
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-quiz-{i}", type="exercise",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=clean_text(qt, 50))


def main():
    ar = json.loads(AR_JSON.read_text(encoding="utf-8"))
    items = []
    chapters = []
    lessons = []

    for cn in range(1, 9):
        chapters.append({"num": cn, "title": CHAPTER_TITLES[cn], "href": f"chapter-{cn}/index.html"})
        make_item(items, id=f"c{cn}-chapter", type="chapter", chapterNum=cn, lessonNum=None,
                  href=f"chapter-{cn}/index.html", title=f"الفصل {cn}: {CHAPTER_TITLES[cn]}",
                  text=CHAPTER_TITLES[cn], jump=None)

        ch_keys = ar.get(f"ch{cn}", {})
        lesson_nums = sorted(int(m.group(1)) for k in ch_keys for m in [re.match(r"lesson(\d+)NavTitle", k)] if m)
        last_num = max(lesson_nums) if lesson_nums else None

        for ln in lesson_nums:
            raw_title = ch_keys[f"lesson{ln}NavTitle"]
            title = re.sub(r"^\d+\)\s*", "", raw_title).strip()
            href = f"chapter-{cn}/lessons/lesson-{ln}.html"
            lessons.append({"chapterNum": cn, "num": ln, "title": title, "href": href})
            make_item(items, id=f"c{cn}-l{ln}-lesson", type="lesson", chapterNum=cn, lessonNum=ln,
                      href=href, title=title, text=f"{CHAPTER_TITLES[cn]} — {title}", jump=None)

            path = ROOT / "chapter-{}".format(cn) / "lessons" / "lesson-{}.html".format(ln)
            if not path.exists():
                continue
            soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
            extract_lesson(items, soup, cn, ln, href, title, is_questions_lesson=(ln == last_num))

    # ---- Quantities: resolve relatedLessons from tagged chapters, and
    # relatedFormulas by scanning already-extracted formula entries. --------
    formula_items = [it for it in items if it["type"] == "formula"]
    quantities = []
    for q in QUANTITIES:
        related_lessons = [l["href"] for l in lessons if l["chapterNum"] in q["chapters"]]
        sym_plain = re.sub(r"[^A-Za-z]", "", q["symbol"]) or q["symbol"]
        related_formulas = []
        for fi in formula_items:
            hay = fi.get("formula") or ""
            if re.search(r"(?<![A-Za-z])" + re.escape(sym_plain) + r"(?![A-Za-z])", hay):
                related_formulas.append(hay)
            if len(related_formulas) >= 5:
                break
        entry = {
            "symbol": q["symbol"], "name": q["name"], "unit": q["unit"],
            "aliases": q["aliases"], "relatedLessons": related_lessons[:8],
            "relatedFormulas": related_formulas,
        }
        quantities.append(entry)
        make_item(items, id=f"quantity-{q['symbol']}", type="quantity", chapterNum=(q["chapters"][0] if q["chapters"] else None),
                  lessonNum=None, href=(related_lessons[0] if related_lessons else "index.html"),
                  title=f"{q['name']} ({q['symbol']})", text=f"الوحدة: {q['unit']}", jump=None)

    out = {
        "version": 1,
        "typeLabels": TYPE_LABELS_AR,
        "chapters": chapters,
        "lessons": lessons,
        "items": items,
        "quantities": quantities,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — {len(items)} items, {len(quantities)} quantities, "
          f"{len(lessons)} lessons, {len(chapters)} chapters "
          f"({OUT_PATH.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
