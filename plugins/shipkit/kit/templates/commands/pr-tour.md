---
description: 🧭 TOUR — Guided tour of what {{a_PR}} (or the current branch) changed. Browser windows open already signed in on the dev stack, beside a control window of at most 8 one-line steps (a ring on the element each step names, ✓ Looks right / ✗ Problem buttons the agent reacts to live); fixes the problems you pick. Tours are committed ({{shared}}/tours/<ID>/) and also run without an agent (tour.mjs); this command writes a missing one, repairs a stale one or fixes what a teammate's run reported
argument-hint: "[pr-number | tour ID] [--from-report]"
---

## Task

Show the user, hands-on, what {{a_PR}} changed, on the dev stack. Single agent, sequential, no
sub-agents. Read-only on the code unless the user asks for a fix. Keep everything short: the tour
itself follows `{{shared}}/guided-tour.md`; the project's side of it is `{{shared}}/tour.md`. Git host
calls go through `{{shared}}/host.md`.

**A committed tour runs without you.** `node {{shared}}/tour/tour.mjs <ID | {{PR}} number>` checks the
stack, makes the data, opens the windows and writes a report, at no token cost (`guided-tour.md` §8).
This command is for what needs judgment: a change with no tour yet (write one), a tour whose steps went
stale (repair only those), a report with ✗ answers from a teammate's run (`--from-report`), and a live
run when the user wants problems fixed on the spot.

| Name | What |
|---|---|
| `$PR` | The {{PR}} number (none when touring a branch without {{a_PR}}) |
| `<n>` | The linked issue: `Closes #<n>` in the {{PR}} description, else the branch's `^issue-(\d+)-` |
| `<ID>` | The tour: the argument when it is not a number; else a tour the {{PR}} adds or changes (`{{shared}}/tours/<ID>/tour.json` among its files); else `issue-<n>` for a new one |

## 1. Find the {{PR}}

- **With a number:** view it (`host.md` §Find the PR), plus its changed files
  (`git diff --name-only origin/{{base}}...<head>` once its branch is fetched).
- **With a tour ID:** the tour's `pr`, else the current branch's {{PR}}.
- **Without:** the current branch's {{PR}} (same recipe).
- **No {{PR}} for the branch:** if `git log --oneline origin/{{base}}..HEAD` is not empty, tour the
  branch instead (its commits, `git diff --stat origin/{{base}}...HEAD` and the working tree) and say
  so in one line. On `{{base}}` with nothing ahead and no tour ID: say there is nothing to show and stop.
- **A closed or merged {{PR}}:** say so; tour it only if its branch, or `{{base}}` after the merge, is
  what is checked out (a merged tour runs on `{{base}}`).

## 2. Make sure its code is what runs

The tour must show the {{PR}}'s code, and the dev stack runs the checked-out tree.

- `git branch --show-current` is not the {{PR}}'s head branch → ask once (**AskUserQuestion**):
  **Check it out (Recommended)** / **Abort**. Only with a clean tree: when `git status --short` shows
  changes, stop and say so. Never stash, discard or commit the user's changes.
- Before a checkout that changes code a running background job depends on: wait for it or ask
  (`project.md` §Dev stack).
- After the checkout, the runner's preflight covers the stack (`tour/runner.json`). What it doesn't,
  from `git diff --name-only origin/{{base}}...HEAD`: a rebuild or a restart (`tour.md` §Build,
  `upgrade-steps.md` §Detect for the local equivalents). Ask before a migration of the local database
  or a rebuild of images.

## 3. A committed tour first

If `{{shared}}/tours/<ID>/tour.json` exists:

- **`--from-report`:** read `{{tmp}}/tour/<ID>-report.md`, or the newest tour report among the {{PR}}'s
  comments (`host.md` §PR comments: it starts `## Guided tour <ID>:`). Trace each ✗ read-only to
  `file:line`, report it in two lines, and ask **Fix it here** / **Fix the step** (the step's text was
  wrong, not the app) / **Just note it**. Then run it live (§5) to check the fixes.
- **Otherwise:** `node {{shared}}/tour/tour.mjs <ID> --check`.
  - **All fresh** (exit 0): say in one line that the tour still holds and that
    `node {{shared}}/tour/tour.mjs <ID>` runs it with no agent. Ask once: **Run it here, live
    (Recommended)** (you watch and can fix: §5) / **I'll run it myself**. On the second, stop.
  - **Some stale** (exit 2): read only the stale steps and the diffs of the files it lists
    (`git diff <verifiedOn> -- <file>`); fix a step that no longer matches, in the tour file; then
    run it live (§5). The status line says `Tour from <sha>, checked again where the code changed`.
- A fixture that fails (`tour.mjs <ID> --prepare` errors): fix it, with the project's fixture test
  (`guided-tour.md` §1, `tour.md` §Data).

No committed tour → §4.

## 4. Know what changed: reuse first, analyse last

Earlier sessions usually did the work already. Follow `guided-tour.md` §2 *Start from what earlier
sessions left*, in its order:

1. **The notes of issue `<n>`:** `ls ISSUE-<n>-*.md` at the repo root; missing → the {{PR}}'s note
   comments, saved to `{{tmp}}/tour/notes/`.
2. **The playbook's `## Tour` section** → that is the tour: translate it (`guided-tour.md` §2). Say in
   one line where it came from (*"Tour from the playbook: 6 steps, 2 windows"*). A `No tour: <why>`
   line → say it and stop.
3. **The QA results** → what the fixture must find or make, the recipes, the steps already checked
   (asked once: only what isn't checked yet, or everything), the open findings.
4. **The handoff** → the decisions and the verification still owed (a step for what is owed, when a
   browser shows it).

Only with no `## Tour` section, build the tour from:

- **The {{PR}} description:** its What and its scope or acceptance table (`{{shared}}/pr-body.md`).
  Thin description → the linked issue (`host.md` §Issues) and its PRD (`PRD-issue-<n>-*.md` at the
  repo root).
- **The playbook's 👤 steps** and their `→ Expect:` lines, when there is a playbook: ready-made steps.
- **Where to go,** from the changed files: `tour.md` §Surfaces maps source folders to the surface and
  page that shows them.
- **Nothing visible** (only tests, docs, CI, internals): say so in one line and offer what can be
  shown instead (a command's output, a mail in the mail catcher), or stop.

A tour built this way is offered once, after the tour, for the playbook: *"Add this tour to
`ISSUE-<n>-TEST-PLAYBOOK.md` as its `## Tour` section, so the next session reuses it?"* (**Yes**,
**No**). No playbook yet → the same question offers to write a minimal one holding only that section.

## 5. Tour

Follow `guided-tour.md`: write the fixture and `{{shared}}/tours/<ID>/tour.json` when they are missing
(§1–§2: check them with `--lint` and `--prepare` twice), run `node {{shared}}/tour/tour.mjs <ID> --agent`
in the background and watch the ✓ / ✗ answers with Monitor (§3), react to each event (§5), then offer
to commit the tour with the {{PR}} (§6).

A reported problem: trace it read-only, report it in two lines, then ask **Fix it here** / **Just
note it**.

- **Fix it here:** the rules of `guided-tour.md` §5. A commit is the user's call: ask first, naming
  the branch, the files and the message (`{{shared}}/commits.md`). Never push to the {{PR}} without
  being asked, and never to a branch that isn't the user's own (`host.md` §Identity) without saying so.
- **Just note it:** keep it for the summary, with the screenshot path.

## 6. Put back and summarize

1. **The tour:** a runner still open → TaskStop its background task (SIGTERM, never `-9`) and its
   Monitor; then `{{shared}}/tour/chrome.sh stop`.
2. **Data and accounts:** what the fixture made stays (the next run re-uses it, `tour.md` §Data).
   What you made by hand beyond it (a fix's test data): ask **Undo it (Recommended)** / **Keep it**.
3. **Files:** `guided-tour.md` §6 step 5 (also when the tour was not committed). Problem screenshots
   the user wants to keep are moved out first: ask.
4. **Summary** (at most six lines):

```
## {{PR}} tour — #<PR> · <title>
Tour: <ID> · <new | repaired: steps k, m | as committed> · <committed in <sha> | uncommitted | not offered: why>
Steps: <k> ✓ · <m> ✗ (<one line each: fixed in <sha | uncommitted> / noted>)
Run it again without an agent: node {{shared}}/tour/tour.mjs <ID>
Screenshots: <absolute paths, one per line, only when the user kept them>
```

When problems were only noted and the {{PR}} is open, offer once to post them as {{a_PR}} comment (it
publishes: check the text for secrets and personal data first, as `pr-notes.md` §2 does).
