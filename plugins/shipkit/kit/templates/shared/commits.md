# Commits and {{PR}}s

- `type(scope): summary`; type ∈ feat, fix, refactor, perf, test, docs, chore, ci; scope = the
  lowercase area tag from `routing-tables.md` §Area tags (or the project's own convention in
  `project.md` §Commits, which wins). Multi-area: the dominant scope, or join summaries with `&&`.
- **Ask before every commit** unless the user's own instructions say otherwise (a CLAUDE.md rule
  wins over anything here): name the branch, the files and the message.
- Stage explicit paths; never `git add .` / `-A`. Never `--force`, never rewrite pushed history,
  never push without the user's explicit yes.
- End messages and {{PR}} descriptions with whatever attribution lines the session requires.
- {{PR}} description: `pr-body.md`. A short top that fits one screen (What, Why, Highlights, Review
  guide, How to verify, Upgrade notes), the detail in collapsible `<details>` sections (Scope vs PRD,
  All changes by area, Decisions and deviations, Tests, Out of scope and follow-ups), then the
  session-notes links, which `pr-notes.md` adds, never by hand.
- An issue's local `ISSUE-<num>-*.md` files (handoff{{#if qa}}, test playbook, QA results{{/if}}) are never
  committed: they go on the {{PR}} as comments (`pr-notes.md`).
- Scratch output (`{{tmp}}/`, `{{reports}}/`, `PRE-*-REVIEW-REPORT.md`) is never committed either.
