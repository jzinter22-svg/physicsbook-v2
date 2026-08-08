Physics Book Project Instructions

Golden Reference

All eight chapters now have real lesson content (60 lessons total — see
the table in README.md). templates/ remains the structural baseline
(HTML/JS/CSS patterns) for any new chapter or lesson.


TODO: pick one existing chapter as the golden reference — the one
judged to have the best content quality, pacing, and interaction design —
and name it here, the same way this project's Math Book counterpart names
its own reference chapter. Every future chapter/lesson edit should be
checked against it for structure, interaction patterns, and code quality.
Until a chapter is named here, fall back to templates/ alone.



Teaching Style


Physics-first: state the principle, then derive, then apply.

Keep explanations concise.

Show complete step-by-step derivations.

Use arrow-connected equation chains (.calc-flow / .calc-arrow / .calc-box).

Box important intermediate and final results (.rule-box, .exercise-final).

Preserve physical correctness and correct units throughout.



Design Rules

Reuse existing components (theme.css, plot.js, quiz.js, the chapter
behavior template) whenever possible. Keep the same:



HTML structure

CSS classes

JavaScript patterns

SVG style

Interactive widgets

Typography

Layout

Responsive behavior


Never introduce a different visual style. If a new component is genuinely
needed, add it to theme.css as a new reusable primitive rather than
one-off inline styling, and document it in README.md.



Workflow

For a new chapter (rare now — all 8 curriculum chapters exist):



Copy templates/chapter-behavior-template.js, templates/chapter-template.html, and templates/lessons/lesson-template.html per the checklist in each file's header comment.

Write the chapter lesson-by-lesson.

Verify consistency against the golden reference.

Fix every issue.

Commit changes.

Continue to the next lesson.


For a new lesson in an existing chapter, or an edit to one:



Copy templates/lessons/lesson-template.html (new lesson) or open the existing lesson file directly (edit).

Write/revise the content.

Verify consistency against the golden reference and against this chapter's own other lessons.

Regenerate the search index (python3 tools/build-search-index.py).

Fix every issue, then commit.


Work lesson-by-lesson. Never build or edit multiple lessons simultaneously
unless requested.

