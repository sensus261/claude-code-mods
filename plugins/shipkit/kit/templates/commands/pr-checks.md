---
description: 🚦 CHECKS — Check {{a_PR}}'s CI {{CI}} (or run the local gate when there are none), offer to fix lint/type/test failures, then optionally commit & push
argument-hint: "[pr-number-or-url]"
---

## Task

Find out whether {{a_PR}} is green and, with the user's confirmation at each gate, fix what's
red and optionally commit & push. The project's CI (where it lives, its jobs and steps) is
described in `{{shared}}/local-gate.md` §CI, and its results are used first. When {{a_PR}} has no
CI results, the **local gate** (`local-gate.md` §Gate) is the pipeline.

Git host calls go through `{{shared}}/host.md`, by recipe name. Run the stages sequentially.
Stop only at the GATEs. Never push without Stage 4's yes.

## Stage 0 — Resolve the {{PR}}

1. `$ARGUMENTS` non-empty → `$PR` (number or URL).
2. Else `host.md` §Find the PR. One {{PR}} → use it and say which. None → ask for a number or
   URL; never guess.
3. Merged / closed → say so, ask **Continue** / **Abort**.
4. The local gate needs the {{PR}}'s head checked out: if the current branch isn't its head
   branch, ask before checking it out (refuse if the working tree is dirty).

## Stage 1 — Status

1. `host.md` §Checks.
   - Results exist → a run still in progress: wait for it (same recipe). For failures, read the
     failing logs. Classify each failure by step or job, using `local-gate.md` §CI's map:
     lint/format → **lint**; type checks → **types**; tests → **tests**; else **other**
     (report, don't auto-fix).
   - No results → run the local gate, each check separately so one failure doesn't hide the
     rest: every line of `local-gate.md` §Gate that applies to the {{PR}}'s diff, with the
     tests relevant to it (`local-gate.md` §Relevant tests: not the whole suite).
2. Print:
   ```
   ## Checks — {{PR}} #<PR> (`<branch>`) — source: CI / local gate

   | Check | Result | Category |
   |-------|--------|----------|
   | <name> | ✅ / ❌ (N failed) | lint / types / tests / other |
   ```
   All green → Stage 5.

## Stage 2 — Tests (GATE)

Only if tests failed. Ask *"`<check>` failed (N tests). Fix them?"* (**Fix**, **Skip**).
**Fix**: reproduce with the narrowest command (one test file, one test), read the owning doc
(`{{shared}}/routing-tables.md` §Doc mapping) before changing behavior, fix the test or the code
(whichever is wrong per the docs), re-run until green, then the tests relevant to the change
(`local-gate.md` §Relevant tests; the CI runs the rest). Record what changed.

## Stage 3 — Lint and types (GATE)

Only if lint or types failed. Ask *"Lint/type checks failed. Fix them?"* (**Fix**, **Skip**).
**Fix**: `local-gate.md` §Fix on the {{PR}}'s changed files only; type errors by hand. Re-run the
failing check. Record the files.

## Stage 4 — Commit and push (GATE)

Only if Stage 2 or 3 changed files. Show `git diff --stat`. Ask *"Fixes applied. Commit and
push them to the {{PR}} branch?"* (**Commit & push**, **Leave for me to review**).
- Leave → stop; changes stay in the working tree.
- Commit & push → stage only the touched files, commit per `{{shared}}/commits.md` (e.g.
  `fix(api): repair the scoring test after the weights bump`, `chore(web): format`),
  `git push` (no `--force`). If CI exists, `host.md` §Checks to confirm a new run started.

## Stage 5 — Summary

```
## {{PR}} #<PR> checks summary — source: CI / local gate

| Check | Outcome |
|-------|---------|
| lint | ✅ passed / 🛠 fixed / ⏭ skipped |
| types | ✅ passed / 🛠 fixed / ⏭ skipped |
| tests | ✅ passed / 🛠 fixed / ⏭ skipped |
| other | ❌ <name> (not auto-fixed) / — |

**Fixes pushed:** yes (`<sha>`) / no — held for review / none needed
**{{PR}}:** <url>
```
