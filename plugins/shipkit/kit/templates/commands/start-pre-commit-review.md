---
description: 🔹 STAGED (pre-commit) — Full pre-commit pipeline: analyze → code review → tests → docs → migrations → changelog
argument-hint: none
---

## Task

Run the full pre-commit pipeline over the **git-staged** changes. Orchestrator only: it
invokes the STAGED commands in order, with gates on the two review stages. Run the stages
sequentially; stop only at the gates. BRANCH equivalent: `/{{prefix}}:start-pre-merge-review`.

## Pipeline

### Stage 0 — Analyze

1. Run `/{{prefix}}:analyze-changes`; confirm it wrote `{{tmp}}/change-analysis.md`.
2. Read `{{shared}}/routing-tables.md`, `{{shared}}/project.md` and the doc sections in the
   digest's "Docs to read" list, once, before Stage 1. Every later stage reuses them.

### Gate choices (Stages 1 and 2)

A gate that finds blocking problems asks with **AskUserQuestion** *"<Code review found N
critical issue(s) | Test review found N blocking gap(s)>. How do you want to proceed?"*:

- **Fix and halt** → fix the 🔴 findings only, run the checks the fix touches (lint the
  fixed files, the tests covering them: `{{shared}}/local-gate.md`), then **HALT the
  pipeline**:
  > Fixes applied. Re-stage (`git add <files>`) and re-run `/{{prefix}}:start-pre-commit-review`.
- **Fix and continue** → the same fix and checks, then stage the fixed and new files
  (explicit paths) so later stages see them; a fixed file that also holds unrelated
  unstaged changes → ask before staging it. Then refresh the digest: rewrite the fixed
  files' entries and its **Fingerprint** line (`git diff --cached --binary | git
  hash-object --stdin`), so later stages don't fall back to the full diff. Then the next
  stage. Checks still red after the fix → say what fails and ask (**Halt**, **Continue
  anyway**).
- **Skip** → the next stage, findings left as they are.

### Stage 1 — Code review (GATE)

Run `/{{prefix}}:code-review`. Read the 🔴 Critical count.
- **> 0:** gate choices; the fix covers the 🔴 findings. Continue/skip → Stage 2.
- **0:** Stage 2, no prompt.

### Stage 2 — Test review (GATE)

Run `/{{prefix}}:review-tests`. Read the verdict and 🔴 Missing tests count.
- **❌ Blocked or 🔴 > 0:** gate choices; the fix writes/adjusts tests for the 🔴 findings
  and runs them. Continue/skip → Stage 3.
- **Otherwise:** Stage 3.

### Stage 3 — Docs sync (no halt)

Run `/{{prefix}}:update-docs`. Let its own confirmation run; always continue to Stage 4.

### Stage 4 — Migrations / upgrade steps (no halt)

Run `/{{prefix}}:check-migrations`. Let its own prompts run; always continue to Stage 5.

### Stage 5 — Changelog + commit message

Run `/{{prefix}}:changelog` (writes `{{tmp}}/changelog.md` and `{{tmp}}/commit-message.md`).

### Stage 6 — Report

Write `PRE-COMMIT-REVIEW-REPORT.md` at the repo root (overwrite): per stage 0–5 whether it
ran, its verdict, what it found or produced (counts, docs changed, migration issues,
upgrade notes, changelog highlights), where and why a gate halted, which findings were
fixed (halted / continued) vs skipped, the files a fix staged, and the paths of every
artifact.

### Cleanup

```bash
rm -f {{tmp}}/change-analysis.md
```

Keep the changelog, commit message and upgrade notes; the user uses them.

## Final summary

```
## Pre-commit pipeline summary

| Stage | Outcome |
|-------|---------|
| 0. Analyze          | 📝 digest written / — not run |
| 1. Code review      | ✅ passed / 🛠 fixed (halted) / 🛠 fixed, continued / ⏭ skipped criticals |
| 2. Test review      | ✅ passed / 🛠 fixed (halted) / 🛠 fixed, continued / ⏭ skipped gaps / — not run |
| 3. Docs sync        | 📝 updated / ✅ in sync / — not run |
| 4. Migrations       | 📝 notes written / ⚠️ issues left / ✅ none needed / — not run |
| 5. Changelog        | 📄 written / — not run |
| 6. Report           | 📄 written |

**Changelog:** {{tmp}}/changelog.md
**Commit message:** {{tmp}}/commit-message.md
**Report:** PRE-COMMIT-REVIEW-REPORT.md
```

If a gate halted the pipeline, mark later stages "— not run", repeat the re-run note, and
still write the report.
