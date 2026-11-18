---
description: 📝 PRD — Plan a feature collaboratively, write a PRD .md at the repo root, optionally open an issue, leave a brief report in {{reports}}/
argument-hint: "[feature-description]"
---

## Task

Turn a raw idea into a PRD through real, round-by-round collaboration, write it to
`PRD-<slug>.md` at the repo root, then optionally open an issue from it. Feeds
`/{{prefix}}:start-working-on-issue`. Never draft the whole thing silently: propose each round and
let the user react before moving on.

## Stage 0 — Seed

`$ARGUMENTS` non-empty → reflect the idea back briefly to confirm. Empty → ask *"What
feature or change do you want to plan?"* and wait.

## Stage 1 — Rounds

1. **Context:** what's broken or missing, why it matters. Propose a paragraph; confirm.
2. **Goals / Non-goals:** propose goals; explicitly ask what's out of scope. Check the idea
   against the locked decisions (`{{shared}}/project.md` §Docs) and the hard rules
   (`project.md` §Hard rules, CLAUDE.md); raise any conflict now, not in the plan.
3. **Implementation plan:** read the relevant code and owning docs first
   (`{{shared}}/routing-tables.md` §Doc mapping; an `Explore` agent for broad searches, if the
   user's rules allow sub-agents). Propose phases with real file paths, including every sync
   pair the plan triggers (`routing-tables.md` §Sync pairs: settings ⇄ their example and docs,
   models ⇄ migrations, routes ⇄ permissions, …), the upgrade steps it will need
   (`{{shared}}/upgrade-steps.md`), and the default on/off state of anything that runs on its
   own, costs money or reaches real people. Add **"Docs to update"** listing the doc sections the
   plan changes. Get sign-off.
4. **Verification:** the exact commands (the way `project.md` §Run says) and manual checks per
   phase, matching `{{shared}}/local-gate.md` §Gate and §Verify.

## Stage 2 — Write

1. Slug = kebab-case title, ~50 chars. Tell the user the filename before writing.
2. Write `PRD-<slug>.md` with Context, Goals / Non-goals, Implementation plan, Verification,
   Docs to update.
3. Leave it untracked; don't `git add` it.

## Stage 3 — Optional issue

Never open one unprompted. Ask *"PRD written to `PRD-<slug>.md`. Create an issue from it?"*
(**Yes**, **Keep it local only**).

Yes:
1. Ask for the **title** (default: the PRD title).
2. Ask for **labels** from the host's label list (`{{shared}}/host.md` §Issues; multi-select);
   never invent labels.
3. Create it (`host.md` §Issues) with the PRD file as the body.
4. Show the issue number + URL. Suggest `/{{prefix}}:start-working-on-issue <num>` and a branch
   named `issue-<num>-<slug>`.

## Stage 4 — Summary

PRD path, issue URL (if created), suggested next command.

## Stage 5 — Brief report

Always last, also when the session stops before the PRD is written (then: what was agreed so
far and why it stopped). Write `{{reports}}/<YYYY-MM-DD>-prd-<slug>.md` following
`{{shared}}/brief-report.md`: the feature in one sentence, the key decisions, the open
questions, the next command. Then print `Report: {{reports}}/<file>`. Not written when this
command's rounds run inside `/{{prefix}}:start-working-on-issue` (its own report covers them).
