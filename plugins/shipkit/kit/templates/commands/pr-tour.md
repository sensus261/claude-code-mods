---
description: 🧭 TOUR — Guided tour of what {{a_PR}} (or the current branch) changed. Browser windows open already signed in on the dev stack, with an in-page panel of at most 8 one-line steps and ✓ Looks right / ✗ Problem buttons the agent reacts to live; fixes the problems you pick
argument-hint: "[pr-number]"
---

## Task

Show the user, hands-on, what {{a_PR}} changed, on the dev stack. Single agent, sequential, no
sub-agents. Read-only on the code unless the user asks for a fix. Keep everything short: the tour
itself follows `{{shared}}/guided-tour.md`; the project's side of it is `{{shared}}/tour.md`. Git host
calls go through `{{shared}}/host.md`.

| Name | What |
|---|---|
| `$PR` | The {{PR}} number (none when touring a branch without {{a_PR}}) |
| `<n>` | The linked issue: `Closes #<n>` in the {{PR}} description, else the branch's `^issue-(\d+)-` |
| `$WS` | `{{tmp}}/tour-<PR, else the branch name with / as ->/`, ignored by git: `accounts.json`, `tour/` |

## 1. Find the {{PR}}

- **With a number:** view it (`host.md` §Find the PR), plus its changed files
  (`git diff --name-only origin/{{base}}...<head>` once its branch is fetched).
- **Without:** the current branch's {{PR}} (same recipe).
- **No {{PR}} for the branch:** if `git log --oneline origin/{{base}}..HEAD` is not empty, tour the
  branch instead (its commits, `git diff --stat origin/{{base}}...HEAD` and the working tree) and say
  so in one line. On `{{base}}` with nothing ahead: say there is nothing to show and stop.
- **A closed or merged {{PR}}:** say so; tour it only if its branch is what is checked out.

## 2. Make sure its code is what runs

The tour must show the {{PR}}'s code, and the dev stack runs the checked-out tree.

- `git branch --show-current` is not the {{PR}}'s head branch → ask once (**AskUserQuestion**):
  **Check it out (Recommended)** / **Abort**. Only with a clean tree: when `git status --short` shows
  changes, stop and say so. Never stash, discard or commit the user's changes.
- Before a checkout that changes code a running background job depends on: wait for it or ask
  (`project.md` §Dev stack).
- After the checkout, from `git diff --name-only origin/{{base}}...HEAD`: what needs a migration, a
  rebuild or a restart before the tour shows it (`tour.md` §Build, `upgrade-steps.md` §Detect for the
  local equivalents). Ask before a migration of the local database or a rebuild of images.

## 3. Know what changed: reuse first, analyse last

Earlier sessions usually did the work already. Follow `guided-tour.md` §2 *Start from what earlier
sessions left*, in its order:

1. **The notes of issue `<n>`:** `ls ISSUE-<n>-*.md` at the repo root; missing → the {{PR}}'s note
   comments, saved to `$WS/notes/`.
2. **The playbook's `## Tour` section** → that is the tour: go to §4 with its windows, steps and
   `Needs:`. Say in one line where it came from (*"Tour from the playbook: 6 steps, 2 windows"*).
   A `No tour: <why>` line → say it and stop.
3. **The QA results** → the Variables' values, the recipes, the steps already checked (asked once:
   only what isn't checked yet, or everything), the open findings.
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
`ISSUE-<n>-TEST-PLAYBOOK.md` as its `## Tour` section, so the next tour reuses it?"* (**Yes**,
**No**). No playbook yet → the same question offers to write a minimal one holding only that section.

## 4. Accounts and data

Follow `guided-tour.md` §1. Made only when a window needs it:

- A throwaway account per account kind the windows use (`tour.md` §Accounts), with the role the
  change is about. Its password goes to `$WS/accounts.json`. Already there from a past tour:
  re-enable it and reset its password.
- Data: the QA results' Variables first (each re-checked with its read-only lookup), then other dev
  data. The `## Tour` section's `Needs:` names the playbook parts whose local setup steps make what is
  missing. What you create is listed in `$WS/changes.md` (`- [ ] <change> · undo: <exact command or
  click>`) **before** you make it.

## 5. Tour

Follow `guided-tour.md` §2–§5: write `$WS/tour/pr-<PR>.json` (`"accounts": "$WS/accounts.json"`,
`"shots": "$WS/tour"`), open the windows signed in (`chrome.sh`, then the launcher in the
background), print the short copy, watch the ✓ / ✗ answers with Monitor and react to each event.

A reported problem: trace it read-only, report it in two lines, then ask **Fix it here** / **Just
note it**.

- **Fix it here:** the rules of `guided-tour.md` §5. A commit is the user's call: ask first, naming
  the branch, the files and the message (`{{shared}}/commits.md`). Never push to the {{PR}} without
  being asked.
- **Just note it:** keep it for the summary, with the screenshot path.

## 6. Put back and summarize

1. **The tour:** any still open → `tour.md` §Runner's stop command and TaskStop its Monitor; then
   `{{shared}}/tour/chrome.sh stop`.
2. **Accounts:** disable the throwaway accounts (`tour.md` §Accounts). Removing one is asked first.
3. **Data:** show `$WS/changes.md` and ask **Undo it (Recommended)** / **Keep it**. Undo → newest
   first, ticking each line.
4. **Files:** delete `$WS` (the accounts file holds passwords). Problem screenshots the user wants to
   keep are moved out first: ask.
5. **Summary** (at most six lines):

```
## {{PR}} tour — #<PR> · <title>
Steps: <k> ✓ · <m> ✗ (<one line each: fixed in <sha | uncommitted> / noted>)
Fixes: <files, uncommitted | committed> · Dev: restored / left: <what>
Screenshots: <absolute paths, one per line, only when the user kept them>
```

When problems were only noted and the {{PR}} is open, offer once to post them as {{a_PR}} comment (it
publishes: check the text for secrets and personal data first, as `pr-notes.md` §2 does).
