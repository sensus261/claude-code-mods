# {{PR}} description: the format

Used by `/{{prefix}}:open-pr` (Stage 2) for every {{PR}} it opens, so also by `/{{prefix}}:ship` and
by `/{{prefix}}:start-working-on-issue` (Stage 9), which hands it the session's context. A reviewer
gets the change from what shows by default in about 30 seconds, and finds the rest one click away in
collapsible sections.

## 1. Inputs (read them, don't re-derive them)

- `{{tmp}}/changelog-branch.md` (`/{{prefix}}:changelog-branch`): the title, the bullets by area,
  the `**Total: …**` line.
- `{{tmp}}/upgrade-notes.md`, else `/{{prefix}}:check-migrations-branch` when the branch touches
  anything `upgrade-steps.md` §Detect lists.
- The linked issue (`^issue-(\d+)-` in the branch, asked in open-pr Stage 2) and its PRD: the goals,
  the Verification / Acceptance criteria.
- From `/{{prefix}}:start-working-on-issue`, when it calls: its scope check (Stage 4, updated by
  Stage 6), the decisions taken with the user, the deviations from the PRD, the gate and verification
  results, what is still open. `ISSUE-<n>-HANDOFF.md` holds the same when the session kept one.
- Counts: `git diff --shortstat origin/{{base}}...HEAD`, the new test files from
  `git diff --name-status origin/{{base}}...HEAD` (the test locations of `review-rules.md` §Tests).

## 2. Shape

```markdown
## What

<Two or three plain sentences: what a user, an operator or the system now does differently. No file
names here.>

Closes #<n>

## Why

<One or two sentences: the problem, or the PRD goal it serves.>

## Highlights

- **<area>:** <the change that matters most, in one line>
- <three to six bullets in all; everything else is in *All changes*>

## Review guide

- Start at `<file>` (<why there>), then `<file>`.
- ⚠️ <what a reviewer must look at: a hard rule touched, a guard loosened, a migration, a billing path>

## How to verify

- [x] Gate: <each check of `local-gate.md` §Gate that ran, by name> ✅
- [ ] <the one command or click path that shows it working>
{{#if qa}}
- [ ] `/{{prefix}}:run-playbook <n>`{{#if tour}} or `/{{prefix}}:pr-tour`{{/if}} (when there is something to see)
{{/if}}
{{#if tour}}
- [ ] A committed tour, when the change has one: `node {{shared}}/tour/tour.mjs <ID>` (no agent needed; its steps are in the guided-tour block below)
{{/if}}

## Upgrade notes

1. <an ordered production step from `upgrade-steps.md`, with what it does>

<details><summary><b>Scope vs PRD</b> · 6 of 7 done</summary>

| # | Scope item | Status |
|---|---|---|
| 1 | <item> | ✅ |
| 7 | <item> | ⏳ follow-up: <where> |

</details>

<details><summary><b>All changes by area</b> · 24 files, +812 −140</summary>

**<area>**
- <changelog bullet>

**<area>**
- <changelog bullet>

</details>

<details><summary><b>Decisions and deviations</b> · 3</summary>

- <a decision taken with the user, in one line, and where the docs record it>

</details>

<details><summary><b>Tests</b> · 2 new files, 37 tests</summary>

- `<test file>` (new): <what it pins>

</details>

<details><summary><b>Out of scope and follow-ups</b> · 2</summary>

- <what was left out and why, or where it continues>

</details>

<the session's attribution line>
```

## 3. Rules

- **Above the fold fits one screen** (What down to Upgrade notes, about 30 lines). Anything longer
  goes in a `<details>` section.
- **A collapsible section** says in its summary what is inside and how much (a count), so a reader
  knows whether to open it. A blank line after the `<summary>…</summary>` line and before
  `</details>`, or the markdown inside does not render. Never nest them.
- **Never folded:** What, Upgrade notes and every ⚠️ line. A reviewer must not miss them.
- **Only sections with content.** An empty section is dropped, not written as "None". Drop the
  Review guide on a small {{PR}} (a handful of files), Scope vs PRD when there is no PRD, Decisions
  when none were taken, Upgrade notes when there are no steps.
- **Plain words and facts.** File paths, commands and settings in backticks. No marketing words
  ("robust", "seamless", "comprehensive"). Emoji only as status marks (✅ ⏳ ❌ ⚠️).
- **Title:** the changelog's `type(scope): summary`, under 80 characters.
- **Never in the body:** secrets, tokens, `.env` values, setup or invite links, an address with a
  token, personal data (a real person's name, an email not at `example.*` / `*.test` / `*.invalid`,
  a phone number), an absolute path (it carries the home directory). Run `pr-notes.md` §2's checks on
  the body file before creating the {{PR}}.
- **Size:** under 60,000 characters. A long changelog keeps the bullets that matter per area in *All
  changes*, plus "and <k> more in the commits".
- **The `<!-- {{prefix}}:pr-notes -->` block** (links to the handoff{{#if qa}}, playbook and QA results{{/if}} comments)
  belongs to `pr-notes.md`: it adds it before the attribution line. Never write it by hand.
- **Updating an existing {{PR}}'s description:** replace the sections in place and keep the pr-notes
  block untouched.
