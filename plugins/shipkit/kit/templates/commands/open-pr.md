---
description: 🔀 {{PR}} — Push the current branch and open {{a_PR}} against {{base}} with a generated title/description, linking any issue
argument-hint: none
---

## Task

Push the current branch and open {{a_PR}} against `{{base}}`, with title and description generated
from the branch changelog, linking the issue when the branch name encodes one. Never push or
open {{a_PR}} without the user's confirmation. Never `--force`. Base is always `{{base}}`.

Related: `/{{prefix}}:pr-checks` (gate an existing {{PR}}), `/{{prefix}}:ship` (review → {{PR}} → gate).
Git host calls go through `{{shared}}/host.md`, by recipe name.

## Stage 0 — Preconditions

1. `BRANCH="$(git branch --show-current)"`.
2. On `{{base}}` → STOP and ask (**AskUserQuestion**): *"You're on `{{base}}`. Create a feature
   branch first, or abort?"* (**Create a branch**, **Abort**). Create → ask for a name
   (suggest `issue-<num>-<slug>` or `<type>/<slug>`), `git switch -c <name>`.
3. `host.md` §Find the PR. An open {{PR}} exists → show it and STOP; suggest
   `/{{prefix}}:pr-checks`, and, when `ISSUE-<num>-*.md` files exist,
   `/{{prefix}}:start-working-on-issue` (Stage 9) to publish or refresh them on the {{PR}}.

## Stage 1 — Confirm and push

1. Show what goes in:
   ```bash
   git fetch origin {{base}} -q
   git log --oneline origin/{{base}}..HEAD
   git status --short
   ```
2. Uncommitted changes → STOP; tell the user to commit first (convention in
   `{{shared}}/commits.md`). Don't commit for them here. Untracked `ISSUE-*.md` and `PRD-*.md` at
   the repo root are local notes and don't count (Stage 5).
3. No commits ahead of `origin/{{base}}` → STOP; nothing to open.
4. Ask *"Push `<BRANCH>` to origin and open {{a_PR}} against `{{base}}`?"* (**Yes, push & open**,
   **Abort**). A caller whose question already named the push and the {{PR}} (Stage 9 of
   `/{{prefix}}:start-working-on-issue`) counts as this yes.
5. Yes → `git push -u origin HEAD`.

## Stage 2 — Title and description

1. Run `/{{prefix}}:changelog-branch` (writes `{{tmp}}/changelog-branch.md`).
2. Branch matches `^issue-(\d+)-` → ask *"Branch looks linked to issue #<num>. Add
   `Closes #<num>`?"* (**Yes**, **No**). A caller that already settled it (Stage 9 of
   `/{{prefix}}:start-working-on-issue`) skips the question.
3. **Title:** its `type(scope): summary` title (< 80 chars).
4. **Description:** follow `{{shared}}/pr-body.md`: a short, readable top (What, Why,
   Highlights, Review guide, How to verify, Upgrade notes) and the detail in collapsible
   sections (Scope vs PRD, All changes by area, Decisions, Tests, Follow-ups), from the inputs
   its §1 lists, plus whatever context the caller hands over. Write it to `{{tmp}}/pr-body.md`,
   run its §3 checks, and end it with the session's required attribution line.

## Stage 3 — Review the description and metadata

Print the title and the whole description as it will be posted, then ask *"Open the {{PR}} with
this description?"* (**Open as-is**, **Change the description first**, **Add labels/reviewers**).
Change → apply what the user says, print it again, ask again. Labels only from the host's label
list (`host.md` §Issues); never invent one.

## Stage 4 — Create and report

`host.md` §Create the PR with `BASE={{base}}`, `HEAD=$BRANCH` and the title. Print the {{PR}} URL.

## Stage 5 — Session notes (ask)

The issue number comes from the branch (`^issue-(\d+)-`). `ls ISSUE-<num>-*.md` at the repo
root: none → skip. Else follow `{{shared}}/pr-notes.md` with the new {{PR}}'s number: it checks the
files for secrets and personal data, asks which to publish, posts each as a collapsible comment
and links them from the {{PR}} description. The files stay local and untracked; they are never
added to the branch.

Then suggest `/{{prefix}}:pr-checks` next.
