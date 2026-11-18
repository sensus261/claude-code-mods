---
description: 🚀 SHIP — Pre-merge review → open {{PR}} → {{CI}} (or the local gate) → offer to fix failures
argument-hint: none
---

## Task

Take the current branch from "done" to "green {{PR}}": pre-merge review, open the {{PR}}, run its
checks, fix failures. Orchestrator only: it chains existing commands and lets their own
confirmations drive. Run the stages sequentially; stop only at the gates.

For an already-open {{PR}} without re-reviewing, use `/{{prefix}}:pr-checks`.

## Stage 1 — Pre-merge review (GATE)

Run `/{{prefix}}:start-pre-merge-review`. Read its final 🔴 count and its overall verdict.
- Halted with unresolved 🔴 findings → ask (**AskUserQuestion**) *"Pre-merge review found
  unresolved critical issue(s). How do you want to proceed?"* (**Fix them first**,
  **Ship anyway**, **Abort**). Fix first / Abort → end with a one-line status.
- Verdict ❌ Not ready without a 🔴 (a PRD item that was not done and nothing records it:
  the report's *PRD vs implementation gaps*) → ask the same question, worded *"Pre-merge
  review says not ready: <the blocking PRD rows>. How do you want to proceed?"*.
- Fixed and continued → its fixes are uncommitted and the {{PR}} wouldn't contain them: ask
  *"The review left uncommitted fixes in N file(s). Commit them before opening the {{PR}}?"*
  (**Commit**, **Abort**). Commit → stage those files (explicit paths), `fix(<scope>):
  <summary>` per `{{shared}}/commits.md`, then Stage 2.
- Passed → Stage 2.

## Stage 2 — Open the {{PR}}

`{{shared}}/host.md` §Find the PR.
- Open {{PR}} exists → reuse it as `$PR`; when `ISSUE-<num>-*.md` files exist (num from the
  branch), follow `{{shared}}/pr-notes.md` to refresh their comments (it asks first).
- Else → run `/{{prefix}}:open-pr` (its Stage 5 does the same for the new {{PR}}); capture `$PR`.
  User aborts the push → end here.

## Stage 3 — Checks and fixes

Run `/{{prefix}}:pr-checks $PR`. It uses the CI results when they exist (waiting first if a run
is in progress), otherwise the local gate, and runs its own fix and commit & push gates.

## Stage 4 — Summary

```
## Ship summary — {{PR}} #<PR>

| Stage | Outcome |
|-------|---------|
| 1. Pre-merge review | ✅ passed / 🛠 fixed & committed / ⏭ shipped past criticals / 🛑 aborted |
| 2. Open {{PR}}          | 🔀 created / ♻️ reused / — not run |
| 2b. {{PR}} notes        | 📎 posted / ♻️ updated / ⏭ skipped / — no local `ISSUE-*.md` |
| 3. Checks           | ✅ green / 🛠 fixed & pushed / ⏭ skipped / ❌ red — source: CI / local gate |

**{{PR}}:** <url>
```

If Ship stopped early, still print where and why.
