---
description: 🎯 ISSUE — Fetch an issue, ensure it has a PRD (co-write if missing), diff PRD scope vs branch progress, and implement until the issue is done (optionally keeping a handoff file), then offer a changelog{{#if qa}} and a test playbook{{/if}}, offer to open the {{PR}} (a short, readable description with the detail in collapsible sections), publish the session notes on it, and leave a brief report in {{reports}}/
argument-hint: "[issue-number-or-url]"
---

## Task

Given an issue, make sure its scope is backed by a PRD, work out how much the current branch
already delivers, then **keep implementing** until the scope is done. Stage 5 implements; it
doesn't just list. Run the stages sequentially; stop only at the gates. Every run ends with the
brief report (Stage 10), an early stop too. Git host calls go through `{{shared}}/host.md`, by
recipe name.

## Stage 0 — Resolve the issue

1. `$ARGUMENTS` non-empty → use it (number or URL).
2. Else, if the branch matches `^issue-(\d+)-`, ask *"This branch looks linked to issue
   #<num>. Use it?"* (**Yes**, **No, let me specify**). Otherwise ask for the number or URL.

## Stage 1 — Fetch

View the issue with its comments (`host.md` §Issues).

Error → tell the user, back to Stage 0; never guess another number. Closed → ask
**Continue anyway** / **Abort**.

## Stage 2 — Detect the PRD

In order, stop at the first hit:
1. Local `PRD-issue-$N-*.md`, or a `PRD-*.md` mentioning `issue #N`.
2. The issue body.
3. The comments, newest first (a comment starting with "PRD" or linking a `PRD-*.md` counts).

PRD-shaped = at least two headings among Context, Goals, Non-goals / Out of scope, Scope,
Implementation plan / Plan, Verification, Acceptance criteria, Test plan, or "PRD" near the
top. Always confirm: *"Found what looks like a PRD in <where>. Use it as the scope?"*
(**Yes**, **No — treat as no PRD**).

## Stage 3 — No PRD (GATE)

> ⚠️ Issue #<num> — "<title>" has no PRD in its body, comments or a local `PRD-issue-<num>-*.md`.

Ask (**Abort**, **Write a PRD together**). Write one → the four rounds of
`/{{prefix}}:plan-to-prd` Stage 1 (Context, Goals / Non-goals, Implementation plan with real
paths + Docs to update, Verification), then write `PRD-issue-<num>-<slug>.md` (announce the name
first). Ask whether to post it on the issue (`host.md` §Issues, comment) or keep it local and
untracked.

## Stage 4 — Scope vs branch

```bash
git fetch origin {{base}} -q
git branch --show-current
git log --oneline origin/{{base}}...HEAD
git diff --stat origin/{{base}}...HEAD
```

Small diff (< ~15 files): read `git diff origin/{{base}}...HEAD`. Larger: run
`/{{prefix}}:analyze-changes-branch` and use its digest.

If `ISSUE-<num>-HANDOFF.md` exists at the repo root, read it first: an earlier session left
it. Its decisions and deviations stand unless the user changes them; its uncommitted work,
verification still owed and pending items (dev data to revert, …) become rows of the scope
check.

Split the PRD's goals / plan into scope items; classify each from commits and actual diff
content: ✅ Done · ⏳ Partial (what's missing) · ❌ Not started.

```
## Scope check — PRD `<source>` vs `<branch>`

| # | Scope item | Status | Evidence |
|---|---|---|---|
```

All ✅ → skip Stage 5; suggest verifying per the PRD and `/{{prefix}}:ship` (with
`Closes #<num>` in the {{PR}} description), mark an existing handoff file done, then go to Stage 7.

## Stage 5 — Implement the rest

1. Ask once, both in one **AskUserQuestion**:
   - *"How should I handle commits?"* (**Commit after each item**, **Don't commit — I'll
     review**). The user's own commit rule (CLAUDE.md) still applies on top: when it says to ask
     before each commit, *Commit after each item* means asking at each item.
   - *"Keep a handoff file `ISSUE-<num>-HANDOFF.md` up to date while I work, so a later
     session can pick up where this one stops?"* (**Yes**, **No**). When the file already
     exists, ask *"Keep updating `ISSUE-<num>-HANDOFF.md`?"* instead.
2. Todo list, one entry per ⏳/❌ item, PRD order. Handoff chosen → write or update the file
   now (§Handoff file).
3. Per item:
   a. Mark in progress.
   b. Read the owning doc sections first (`{{shared}}/routing-tables.md` §Doc mapping) and
      follow the hard rules (`{{shared}}/project.md` §Hard rules, CLAUDE.md).
   c. Implement. Keep the sync pairs moving together (`routing-tables.md` §Sync pairs). New
      things that run on their own, cost money or reach real people ship off unless the PRD
      says otherwise.
   d. Lint the changed files, run and extend the tests (`{{shared}}/local-gate.md`).
   e. Verify it works (`local-gate.md` §Verify), not only that tests pass. Nothing that costs
      money, sends to real people or touches production without asking.
   f. Update the docs the item changes (docs win; ask if the item contradicts a locked
      decision).
   g. Commit-per-item chosen → stage only this item's files, per `{{shared}}/commits.md`. Never
      push.
   h. Mark done. Handoff chosen → update the file.
4. Ambiguous item or an undecided question → stop and ask; don't guess. Handoff chosen →
   record the answer in the file.
5. Never push, open {{a_PR}}, comment on or close the issue without being asked (Stage 9 asks
   about the {{PR}}).

### Handoff file

`ISSUE-<num>-HANDOFF.md` at the repo root. Local and untracked: never stage or commit it. It
reaches the {{PR}} as a collapsible comment, not as a file in the repo (Stage 9,
`{{shared}}/pr-notes.md`), so write it for a reviewer too. Keep it current after each item, each
decision the user takes and before any stop, so a fresh session can continue from it alone if
this one is cut off. Write facts with paths, not narrative:

- `# Issue #<num> — handoff (session of <date>)`, then one line on the scope, the PRD
  location, the branch and the commit mode (what is committed, what is only in the tree).
- **Decisions taken with the user:** each answer that changed or narrowed the work.
- **Deviations from the PRD** (renumbered decisions or milestones, changed designs): what
  and why; the docs must say the same.
- **Progress:** one block per scope item or phase: status (CODE DONE / partial / not
  started), files, tests (file + count), how it was verified.
- **Verification still owed:** the exact commands and the end-to-end steps.
- **Gotchas found:** anything that cost time and isn't yet in the project's docs.
- **Pending / next:** the next item, open questions, dev data or `.env` changes to revert.

A later session updates the sections in place and appends `## Session N (<date>) — what
changed`. No secrets, tokens or personal contact data.

## Stage 6 — Summary

```
## Issue #<num> — "<title>" — session summary

**PRD:** <path or issue location> (<existing / co-written>)
**Branch:** `<branch>` vs `origin/{{base}}`

| Scope item | Status |
|---|---|
| <item> | ✅ Done (prior) / ✅ Done (this session) / ⏳ Partial — <why> |

**Commits this session:** N (or "none — held for review")
**Gate:** ✅ green / ⚠️ <what fails>
**Verified:** ✅ per PRD Verification / ⚠️ not fully — <why>
**Handoff:** `ISSUE-<num>-HANDOFF.md` updated / — not kept
**{{PR}} notes:** published on {{PR}} #<PR> / offered by `/{{prefix}}:open-pr` once the {{PR}} exists / — no local files

**Next:** {{#if qa}}`/{{prefix}}:run-playbook <num>` (when a playbook exists), {{/if}}`/{{prefix}}:start-pre-merge-review`;
the {{PR}} is offered at the end of this run (Stage 9), else `/{{prefix}}:open-pr` later (with
`Closes #<num>`; it also offers to publish the local session files on the {{PR}}).
```

If it stopped early, still summarize where and why (and write it in the handoff file, if
kept), then go to Stage 10.

## Stage 7 — Changelog (ask)

Ask: *"Want me to write a changelog of the changes?"* Recommend the option that
matches where the work sits (Stage 5 commit choice, or `git status --short`):

- **Branch changelog** (work is committed) → run `/{{prefix}}:changelog-branch`; writes
  `{{tmp}}/changelog-branch.md`. Committed work only, all of the branch vs `origin/{{base}}`.
- **Staged changelog + commit message** (held for review) → run `/{{prefix}}:changelog`; writes
  `{{tmp}}/changelog.md` and `{{tmp}}/commit-message.md`. Index only: if this session's files
  aren't staged, ask before staging them (explicit paths). Never commit.
- **No** → go to Stage 8.

Follow that command's steps and entry format as written; don't restate or reformat them here.
Then show the file path(s), the title and the `**Total: …**` line.

## Stage 8 — Test playbook (ask)

{{#if qa}}
Always ask last: *"Want a test playbook — an .md saying exactly what to run, click and expect,
so you can test these changes yourself?{{#if tour}} It also carries a ready-made guided tour, so
`/{{prefix}}:pr-tour` and `/{{prefix}}:run-playbook` won't re-analyse the change.{{/if}}"* (**Yes**,
**No**). No → Stage 9.

Yes → write `ISSUE-<num>-TEST-PLAYBOOK.md` following `{{shared}}/test-playbook.md` (the format,
what it covers, the hard rules), from the Stage 4 diff + this session's work, checked against the
PRD's Verification / Acceptance criteria.{{#if tour}} It ends with its `## Tour` section (spec §2
*Tour*): write it now, while this session knows the change best: the windows by role, at most 8
steps with the exact labels, the parts it needs. The playbook already exists and the user keeps
it → still bring its `## Tour` section up to date with this session's work (add it when missing),
and say so in one line.{{/if}}

Then show the path, the parts table{{#if tour}} and the tour's step count{{/if}}, and say that
`/{{prefix}}:run-playbook <num>` runs it (it drives the steps it can, records the results in
`ISSUE-<num>-QA-RESULTS.md` and fixes the failures the user picks){{#if tour}} and `/{{prefix}}:pr-tour`
opens the tour on its own, then offers to commit it (`{{shared}}/tours/issue-<num>/`) so anyone can run
it later without an agent{{/if}}.
{{else}}
Not part of this toolkit (the QA pack is off). Go to Stage 9.
{{/if}}

## Stage 9 — The {{PR}}: open it (ask), publish the notes

Skipped after an early stop. The `ISSUE-<num>-*.md` files at the repo root (the handoff{{#if qa}}, the
playbook, the QA results{{/if}}, anything else kept for this issue) never enter the repo: they go on
the {{PR}} as collapsible comments linked from its description.

`host.md` §Find the PR.

### No {{PR}} yet → offer to open one

1. **Ready?** Check first, read-only:
   - On `{{base}}` → don't ask; one line: `/{{prefix}}:open-pr` creates a branch first. Go to
     Stage 10.
   - Nothing ahead of `origin/{{base}}` and nothing uncommitted → nothing to open: one line,
     Stage 10.
   - Tracked files changed but not committed (the *Don't commit — I'll review* choice, or `git
     status --short`; the untracked `ISSUE-*.md` and `PRD-*.md` don't count) → the {{PR}} would
     not hold them. The question below says so.
2. **Ask once** (**AskUserQuestion**):

   > Open {{a_PR}} for `<branch>` now? `/{{prefix}}:open-pr` pushes the branch and opens it against
   > `{{base}}` with `Closes #<num>` and a short, readable description (the detail folds into
   > collapsible sections). You see the description before it's created. <When uncommitted: "N
   > changed files aren't committed yet: I'll ask you to commit them first.">

   - **Yes, open the {{PR}} (Recommended)**
   - **No, later**: one line: `/{{prefix}}:open-pr` (or `/{{prefix}}:ship`) when ready; it also
     offers to publish the local `ISSUE-<num>-*.md` files. Go to Stage 10.
3. **Uncommitted work first.** Ask before the commit, as the user's commit rule says (the branch,
   the files, the message: `{{tmp}}/commit-message.md` when Stage 7 wrote it, else per
   `{{shared}}/commits.md`). Stage only this session's files, by path. Declined → stop here with
   one line: `/{{prefix}}:open-pr` refuses uncommitted work. Go to Stage 10.
4. **Run `/{{prefix}}:open-pr`.** This *Yes* is its push confirmation (its Stage 1) and settles
   `Closes #<num>` (its Stage 2). Hand it this session's context for `{{shared}}/pr-body.md` §1:
   - the PRD's location and the Stage 4 scope table, with the statuses Stage 6 reported;
   - the decisions taken with the user and the deviations from the PRD (the handoff file holds
     them when kept);
   - the gate and verification results of Stage 6, and what is still open.

   Its other gates still run: the description review (Stage 3) and the {{PR}} notes (Stage 5, the
   same files as below). Then point at `/{{prefix}}:pr-checks`{{#if tour}}, and `/{{prefix}}:pr-tour` to see
   the change hands-on (a tour the branch already commits runs without an agent too:
   `node {{shared}}/tour/tour.mjs <ID>`){{/if}}.

### Open {{PR}} → refresh it

- **Notes.** When `ISSUE-<num>-*.md` files exist: follow `{{shared}}/pr-notes.md` with `$PR` and
  `<num>`. It checks the files for secrets and personal data, asks which to publish, then
  creates or updates the comments in place and the links in the {{PR}} description. Running this
  stage again after the files change is the refresh.
- **Description.** When this session added commits to the {{PR}}, ask once *"Refresh {{PR}}
  #<PR>'s description with this session's work?"* (**Yes**, **No**). Yes → rewrite it per
  `pr-body.md` (sections replaced in place, the pr-notes block kept), print it, then write it
  back (`host.md` §Edit the PR description). Pushing new commits is a separate ask: never push
  without the user's yes.

## Stage 10 — Brief report

Always last. Write `{{reports}}/<YYYY-MM-DD>-issue-<num>-work.md` following
`{{shared}}/brief-report.md`: what this session finished, what is still open, the next
command. An early stop says where and why. Then print `Report: {{reports}}/<file>`.
