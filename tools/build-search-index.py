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
AR_OUT_PATH = ROOT / "assets" / "search" / "index.ar.json"
EN_OUT_PATH = ROOT / "assets" / "search" / "index.en.json"
CONTENT_EN_DIR = ROOT / "content" / "en"

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


def find_quantities_in(formula_text, names=None):
    """Which QUANTITIES symbols appear in a cleaned formula string. Matches
    the symbol literally (works for both plain letters like "F" and
    underscore-subscript forms like "a_c", since clean_text() never strips
    underscores) guarded by non-alphanumeric boundaries so "T" doesn't
    match inside "text" or "R" inside a longer token. `names`, when given,
    overrides q["name"] per symbol (e.g. QUANTITY_NAMES_EN for the English
    index) so an embedded quantity's name is in the same language as the
    surrounding formula item, not always Arabic."""
    found = []
    for q in QUANTITIES:
        pattern = r"(?<![A-Za-z0-9_])" + re.escape(q["symbol"]) + r"(?![A-Za-z0-9_])"
        if re.search(pattern, formula_text):
            name = (names or {}).get(q["symbol"], q["name"])
            found.append({"symbol": q["symbol"], "name": name, "unit": q["unit"]})
    return found


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
    "tool": "أداة",
    "examQuestion": "سؤال وزاري",
}

TYPE_LABELS_EN = {
    "definition": "Definition",
    "explanation": "Explanation",
    "enumeration": "List",
    "example": "Example",
    "exercise": "Question",
    "solution": "Solution",
    "simulation": "Interactive simulation",
    "figure": "Figure",
    "formula": "Formula",
    "table": "Table",
    "lesson": "Lesson",
    "chapter": "Chapter",
    "quantity": "Physical quantity",
    "tool": "Tool",
    "examQuestion": "Exam Question",
}

# English chapter titles — one per chapter, matching each chapter's hero
# title in content/en/chapter-N/index.json (stripped of the "Chapter N:"
# prefix and any embedded markup).
CHAPTER_TITLES_EN = {
    1: "Circular and Rotational Motion",
    2: "Interference, Polarization, Diffraction, and Scattering",
    3: "Electromagnetic Induction",
    4: "Alternating Current Circuits",
    5: "Semiconductor Materials and Electronic Devices",
    6: "Laser and Plasma",
    7: "Crude Oil",
    8: "Metals and Alloys",
}

# English names for every QUANTITIES entry above — everything else about
# each entry (unit, aliases, which chapters/formulas it relates to) is
# reused as-is, since aliases are already mostly English and units are
# locale-independent.
QUANTITY_NAMES_EN = {
    "v": "Linear speed", "r": "Radius", "ω": "Angular velocity",
    "a_c": "Centripetal acceleration", "F_c": "Centripetal force",
    "T": "Period", "α": "Angular acceleration", "θ": "Angular displacement",
    "I": "Moment of inertia", "τ": "Torque", "L": "Angular momentum",
    "G": "Gravitational constant",
    "λ": "Wavelength", "f": "Frequency", "n": "Refractive index",
    "c": "Speed of light",
    "Φ": "Magnetic flux", "B": "Magnetic flux density", "N": "Number of turns",
    "emf": "Induced electromotive force", "L_ind": "Self inductance",
    "V": "Voltage (electric potential difference)", "I_ac": "Electric current",
    "R": "Ohmic resistance", "X_L": "Inductive reactance",
    "X_C": "Capacitive reactance", "Z": "Impedance", "C": "Capacitance",
    "P": "Electric power", "cosφ": "Power factor",
    "E_g": "Energy gap", "h": "Planck's constant",
    "ρ": "Density",
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


# ---------------------------------------------------------------------------
# Per-language wording used by extract_lesson_from_content() below, so a
# single extraction pass produces both indexes without duplicating logic.
# ---------------------------------------------------------------------------
WORDS_AR = {
    "question": "سؤال", "example": "مثال",
    "table_prefix": lambda title: f"جدول — {title}",
    "sim_prefix": lambda title: f"محاكاة تفاعلية — {title}",
    "quiz_prefix": lambda i: f"سؤال اختبار ذاتي {i}",
    "solution_title": lambda ex_type, badge: f"حل {'السؤال' if ex_type == 'exercise' else 'المثال'} {badge}",
    "quantity_names": None,  # QUANTITIES entries already carry their Arabic name
    "unit_label": lambda unit: f"الوحدة: {unit}",
}

WORDS_EN = {
    "question": "Question", "example": "Example",
    "table_prefix": lambda title: f"Table — {title}",
    "sim_prefix": lambda title: f"Interactive simulation — {title}",
    "quiz_prefix": lambda i: f"Self-check question {i}",
    "solution_title": lambda ex_type, badge: (
        f"{'Solution' if ex_type == 'example' else 'Answer'} to "
        f"{'question' if ex_type == 'exercise' else 'example'} {badge}"
    ),
    "quantity_names": QUANTITY_NAMES_EN,
    "unit_label": lambda unit: f"Unit: {unit}",
}


# ---------------------------------------------------------------------------
# Shared extraction: reads a lesson's content-JSON block list (the single
# source of truth for both languages, now that every chapter's HTML is a
# JS-rendered mount point rather than static markup) and emits one search
# item per definition, explanation, enumeration, callout, formula, figure,
# table, simulation, worked example/exercise + its solution, and self-check
# quiz question. `words` supplies the per-language labels/prefixes.
# ---------------------------------------------------------------------------
def extract_lesson_from_content(items, lesson, chapter_num, lesson_num, href, lesson_title, is_questions_lesson, words):
    ex_type = "exercise" if is_questions_lesson else "example"
    ex_num = 0
    for i, block in enumerate(lesson.get("content", [])):
        t = block.get("type")

        if t in ("definition", "enumeration") or (t == "explanation" and block.get("label") is not None):
            item_type = "definition" if t == "definition" else ("enumeration" if t == "enumeration" else "explanation")
            label = label_text(BeautifulSoup(block.get("label") or "", "lxml"))
            body = clean_text(BeautifulSoup(block.get("html") or "", "lxml").get_text(" "), limit=220)
            title = clean_text(label, 110) or lesson_title
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-{item_type}-{i}", type=item_type,
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=body, jump=clean_text(label, 60) or title)

        elif t == "callout":
            body = clean_text(BeautifulSoup(block.get("html") or "", "lxml").get_text(" "), limit=220)
            title = clean_text(body, 60)
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-callout-{i}", type="explanation",
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=body, jump=title)

        elif t == "formula":
            raw = BeautifulSoup(block.get("html") or "", "lxml").get_text(" ").strip()
            formula = clean_text(raw, limit=160)
            title = lesson_title
            quantities = find_quantities_in(formula, names=words["quantity_names"])
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-formula-{i}", type="formula",
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, formula=formula, raw=raw, explanation=None,
                      quantities=(quantities or None), jump=None)

        elif t == "diagram":
            body = clean_text(block.get("caption") or "", limit=180)
            if body:
                make_item(items, id=f"c{chapter_num}-l{lesson_num}-figure-{i}", type="figure",
                          chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                          title=body, text=body, jump=clean_text(body, 50))

        elif t == "table":
            rows_text = " ".join(" ".join(row) for row in block.get("rows", []))
            body = clean_text((block.get("heading") or "") + " " + rows_text, limit=240)
            title = clean_text(block.get("heading") or "", 90) or words["table_prefix"](lesson_title)
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-table-{i}", type="table",
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=body, jump=None)

        elif t == "simulation":
            title = clean_text(block.get("sectionHeading") or "", 90) or words["sim_prefix"](lesson_title)
            desc = clean_text(BeautifulSoup(block.get("descriptionHtml") or "", "lxml").get_text(" "), 200)
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-sim-{i}", type="simulation",
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=desc or title, jump=clean_text(title, 50))

        elif t == "example":
            ex_num += 1
            problem_text = BeautifulSoup(block.get("problemHtml") or "", "lxml").get_text(" ")
            body = clean_text(problem_text, limit=220)
            label = block.get("label")
            badge = label if label is not None else str(block.get("number") or ex_num)
            title_word = words["question"] if ex_type == "exercise" else words["example"]
            title = clean_text(f"{title_word} {badge}", 60)
            make_item(items, id=f"c{chapter_num}-l{lesson_num}-{ex_type}-{ex_num}", type=ex_type,
                      chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                      title=title, text=body, jump=clean_text(body, 50))
            sol = block.get("solution")
            if sol:
                sol_text = " ".join(
                    [s.get("note") or "" for s in sol.get("steps", [])] + [sol.get("final") or ""]
                )
                sol_body = clean_text(sol_text, limit=260)
                make_item(items, id=f"c{chapter_num}-l{lesson_num}-solution-{ex_num}", type="solution",
                          chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                          title=words["solution_title"](ex_type, badge),
                          text=sol_body, jump=clean_text(sol.get("label") or "", 40))

    for i, q in enumerate((lesson.get("quiz") or {}).get("questions", [])):
        body = clean_text(q.get("question") or "", limit=200)
        title = clean_text(q.get("question") or "", 90) or words["quiz_prefix"](i + 1)
        make_item(items, id=f"c{chapter_num}-l{lesson_num}-quiz-{i}", type="exercise",
                  chapterNum=chapter_num, lessonNum=lesson_num, href=href,
                  title=title, text=body, jump=clean_text(title, 50))


def extract_exam_bank_items(items):
    """assets/data/exam-bank.ar.json (Arabic-only content, see exam-bank/
    README note in the project README) — one search item per ministry-style
    question, so Ctrl+K finds it and jumps to exam-bank/index.html with the
    matching question scrolled into view via search.js's existing
    "#pbsearch:<snippet>" convention. `jump` deliberately uses the RAW
    tag-stripped prompt text (not clean_text()'s LaTeX-unwrapped form): the
    live page renders the prompt's original LaTeX source into a .example
    div (matched by search.js's JUMP_CANDIDATES) before MathJax ever
    touches it, so the snippet must match that raw text verbatim, not a
    human-friendlier rewritten version of it."""
    path = ROOT / "assets" / "data" / "exam-bank.ar.json"
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    for chapter in data.get("chapters", []):
        cn = chapter["num"]
        for q in chapter.get("questions", []):
            prompt_raw = BeautifulSoup(q.get("prompt") or "", "lxml").get_text(" ").strip()
            answer_raw = BeautifulSoup(q.get("answer") or "", "lxml").get_text(" ")
            title = clean_text(f"{q['kind']} — {prompt_raw}", 90)
            preview = clean_text(answer_raw, limit=220)
            jump = _WS_RE.sub(" ", prompt_raw)[:50].strip()
            make_item(items, id=f"examq-{q['id']}", type="examQuestion",
                      chapterNum=cn, lessonNum=None, href="exam-bank/index.html",
                      title=title, text=preview, jump=jump)


def build_ar_index():
    items = []
    chapters = []
    lessons = []

    for cn in range(1, 9):
        chapter_dir = ROOT / "content" / "ar" / f"chapter-{cn}"
        if not chapter_dir.exists():
            continue
        chapters.append({"num": cn, "title": CHAPTER_TITLES[cn], "href": f"chapter-{cn}/index.html"})
        make_item(items, id=f"c{cn}-chapter", type="chapter", chapterNum=cn, lessonNum=None,
                  href=f"chapter-{cn}/index.html", title=f"الفصل {cn}: {CHAPTER_TITLES[cn]}",
                  text=CHAPTER_TITLES[cn], jump=None)

        lesson_paths = sorted(chapter_dir.glob("lesson-*.json"),
                               key=lambda p: int(re.search(r"\d+", p.stem).group()))
        lesson_nums = [int(re.search(r"\d+", p.stem).group()) for p in lesson_paths]
        last_num = max(lesson_nums) if lesson_nums else None

        for ln, path in zip(lesson_nums, lesson_paths):
            lesson = json.loads(path.read_text(encoding="utf-8"))
            title = lesson["hero"]["title"]
            href = f"chapter-{cn}/lessons/lesson-{ln}.html"
            lessons.append({"chapterNum": cn, "num": ln, "title": title, "href": href})
            make_item(items, id=f"c{cn}-l{ln}-lesson", type="lesson", chapterNum=cn, lessonNum=ln,
                      href=href, title=title, text=f"{CHAPTER_TITLES[cn]} — {title}", jump=None)
            extract_lesson_from_content(items, lesson, cn, ln, href, title,
                                         is_questions_lesson=(ln == last_num), words=WORDS_AR)

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
                  title=f"{q['name']} ({q['symbol']})", text=WORDS_AR["unit_label"](q["unit"]), jump=None)

    # ---- The 5 book-wide tool pages (formulas/dictionary/units/calculator/
    # exam-bank) — static entries so Ctrl+K can jump straight to them too. --
    TOOL_PAGES = [
        {"id": "formulas", "title": "القوانين الفيزيائية", "href": "formulas/index.html",
         "text": "مرجع شامل لكل القوانين والمعادلات الفيزيائية في الكتاب مصنّفة حسب الفصل والدرس"},
        {"id": "dictionary", "title": "قاموس المصطلحات", "href": "dictionary/index.html",
         "text": "قاموس أبجدي لكل التعريفات والمصطلحات الفيزيائية الواردة في الكتاب"},
        {"id": "units", "title": "الوحدات والتحويلات", "href": "units/index.html",
         "text": "محول وحدات تفاعلي فوري للطول والكتلة والزمن والقوة والضغط والطاقة والكهرباء وغيرها"},
        {"id": "calculator", "title": "الآلة الحاسبة العلمية", "href": "calculator/index.html",
         "text": "آلة حاسبة علمية كاملة بدوال مثلثية ولوغاريتمية وذاكرة وسجل عمليات"},
        {"id": "exam-bank", "title": "بنك الأسئلة الوزارية", "href": "exam-bank/index.html",
         "text": "أسئلة علّل وعرّف واحسب وقارن على طراز أسئلة وزارة التربية للفصول الثمانية، مع إجابات نموذجية كاملة"},
    ]
    for tp in TOOL_PAGES:
        make_item(items, id=f"tool-{tp['id']}", type="tool", chapterNum=None, lessonNum=None,
                  href=tp["href"], title=tp["title"], text=tp["text"], jump=None)

    extract_exam_bank_items(items)

    return {
        "version": 1,
        "typeLabels": TYPE_LABELS_AR,
        "chapters": chapters,
        "lessons": lessons,
        "items": items,
        "quantities": quantities,
    }


def build_en_index():
    if not CONTENT_EN_DIR.exists():
        return None
    items = []
    chapters = []
    lessons = []

    for cn in range(1, 9):
        chapter_dir = CONTENT_EN_DIR / f"chapter-{cn}"
        if not chapter_dir.exists():
            continue
        chapters.append({"num": cn, "title": CHAPTER_TITLES_EN[cn], "href": f"chapter-{cn}/index.html"})
        make_item(items, id=f"c{cn}-chapter", type="chapter", chapterNum=cn, lessonNum=None,
                  href=f"chapter-{cn}/index.html", title=f"Chapter {cn}: {CHAPTER_TITLES_EN[cn]}",
                  text=CHAPTER_TITLES_EN[cn], jump=None)

        lesson_paths = sorted(chapter_dir.glob("lesson-*.json"),
                               key=lambda p: int(re.search(r"\d+", p.stem).group()))
        lesson_nums = [int(re.search(r"\d+", p.stem).group()) for p in lesson_paths]
        last_num = max(lesson_nums) if lesson_nums else None

        for ln, path in zip(lesson_nums, lesson_paths):
            lesson = json.loads(path.read_text(encoding="utf-8"))
            title = lesson["hero"]["title"]
            href = f"chapter-{cn}/lessons/lesson-{ln}.html"
            lessons.append({"chapterNum": cn, "num": ln, "title": title, "href": href})
            make_item(items, id=f"c{cn}-l{ln}-lesson", type="lesson", chapterNum=cn, lessonNum=ln,
                      href=href, title=title, text=f"{CHAPTER_TITLES_EN[cn]} — {title}", jump=None)
            extract_lesson_from_content(items, lesson, cn, ln, href, title,
                                         is_questions_lesson=(ln == last_num), words=WORDS_EN)

    formula_items = [it for it in items if it["type"] == "formula"]
    quantities = []
    for q in QUANTITIES:
        if q["symbol"] not in QUANTITY_NAMES_EN:
            continue
        chapter_nums_present = {c["num"] for c in chapters}
        q_chapters = [c for c in q["chapters"] if c in chapter_nums_present]
        if not q_chapters:
            continue
        related_lessons = [l["href"] for l in lessons if l["chapterNum"] in q_chapters]
        sym_plain = re.sub(r"[^A-Za-z]", "", q["symbol"]) or q["symbol"]
        related_formulas = []
        for fi in formula_items:
            hay = fi.get("formula") or ""
            if re.search(r"(?<![A-Za-z])" + re.escape(sym_plain) + r"(?![A-Za-z])", hay):
                related_formulas.append(hay)
            if len(related_formulas) >= 5:
                break
        name_en = QUANTITY_NAMES_EN[q["symbol"]]
        entry = {
            "symbol": q["symbol"], "name": name_en, "unit": q["unit"],
            "aliases": q["aliases"], "relatedLessons": related_lessons[:8],
            "relatedFormulas": related_formulas,
        }
        quantities.append(entry)
        make_item(items, id=f"quantity-{q['symbol']}", type="quantity", chapterNum=q_chapters[0],
                  lessonNum=None, href=(related_lessons[0] if related_lessons else "index.html"),
                  title=f"{name_en} ({q['symbol']})", text=WORDS_EN["unit_label"](q["unit"]), jump=None)

    return {
        "version": 1,
        "typeLabels": TYPE_LABELS_EN,
        "chapters": chapters,
        "lessons": lessons,
        "items": items,
        "quantities": quantities,
    }


def write_index(path, out):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path} — {len(out['items'])} items, {len(out['quantities'])} quantities, "
          f"{len(out['lessons'])} lessons, {len(out['chapters'])} chapters "
          f"({path.stat().st_size/1024:.1f} KB)")


def main():
    write_index(AR_OUT_PATH, build_ar_index())
    en_out = build_en_index()
    if en_out is not None:
        write_index(EN_OUT_PATH, en_out)
    else:
        print(f"Skipped {EN_OUT_PATH}: {CONTENT_EN_DIR} not found")


if __name__ == "__main__":
    main()
