---
description: 🔹 BRANCH (pre-merge) — Detect branch changes vs origin that need a migration or a production upgrade step and check they're complete
argument-hint: "[base-branch]"
---

## Task

Same as `/{{prefix}}:check-migrations`, over the full branch diff vs `origin/{base-branch}`
(default `origin/{{base}}`) instead of the staged set.

## Steps

1. **Discover changes:** `{{shared}}/digest-discovery.md` (BRANCH).
2. **Detect, verify, report and offer fixes** exactly as in
   `.claude/commands/{{prefix}}:check-migrations.md` §2–§4, with these branch specifics:
   - "Modified existing migration" means a migration file that exists on `origin/$BASE` and
     shows as `M` in `git diff --name-status "origin/$BASE"...HEAD`. Migrations both added and
     edited on this branch are fine.
   - The branch's first new migration follows the latest one on `origin/$BASE` (its parent
     revision, or the next number, per `{{shared}}/upgrade-steps.md` §Branch checks), so
     merging doesn't create two heads or a numbering clash.
   - Fixes are working-tree changes only. Don't commit or push.

## Output

- `📝 Upgrade notes written to {{tmp}}/upgrade-notes.md — <steps>`
- `⚠️ N migration issue(s) left unfixed — <list>`
- `✅ No migration or upgrade steps needed.`
