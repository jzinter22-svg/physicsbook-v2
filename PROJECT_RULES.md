
# Physics Book Project Instructions

## Golden Reference

Eight chapter hubs exist (`chapter-1/` … `chapter-8/`) but none has lesson
content yet. Until one does, `templates/` (the chapter, lesson, and
behavior-script templates) is the canonical baseline. Once the first real
chapter is built, promote it to golden reference here and require every
later chapter to match it in structure, interaction patterns, and code
quality — the same way this project's Math Book counterpart treats its own
reference chapter.

---

## Teaching Style

- Physics-first: state the principle, then derive, then apply.
- Keep explanations concise.
- Show complete step-by-step derivations.
- Use arrow-connected equation chains (`.calc-flow` / `.calc-arrow` /
  `.calc-box`).
- Box important intermediate and final results (`.rule-box`,
  `.exercise-final`).
- Preserve physical correctness and correct units throughout.

---

## Design Rules

Reuse existing components (`theme.css`, `plot.js`, `quiz.js`, the chapter
behavior template) whenever possible. Keep the same:

- HTML structure
- CSS classes
- JavaScript patterns
- SVG style
- Interactive widgets
- Typography
- Layout
- Responsive behavior

Never introduce a different visual style. If a new component is genuinely
needed, add it to `theme.css` as a new reusable primitive rather than
one-off inline styling, and document it in `README.md`.

---

## Workflow

For every chapter:

1. Copy `templates/chapter-behavior-template.js`,
   `templates/chapter-template.html`, and
   `templates/lessons/lesson-template.html` per the checklist in each
   file's header comment.
2. Write the chapter lesson-by-lesson.
3. Verify consistency against the golden reference (once one exists).
4. Fix every issue.
5. Commit changes.
6. Continue to the next lesson.

Work lesson-by-lesson. Never build multiple lessons simultaneously unless
requested.
