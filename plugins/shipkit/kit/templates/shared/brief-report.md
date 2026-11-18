# Brief report: what a run did, in plain words

The last step of `/{{prefix}}:start-working-on-issue`, `/{{prefix}}:start-pre-merge-review`,
{{#if qa}}`/{{prefix}}:run-playbook` {{/if}}and `/{{prefix}}:plan-to-prd`. A person who wasn't watching reads it in
under a minute and knows what happened, where things stand and what to do next. The detailed files
(the handoff, {{#if qa}}the QA results, {{/if}}`PRE-MERGE-REVIEW-REPORT.md`, the PRD) stay as they are; this one
points at them.

## Where

- `{{reports}}/` at the repo root, ignored by git. Never stage, commit or post it (`pr-notes.md` reads
  only `ISSUE-<n>-*.md` at the root, so it never picks a report up).
- **One new file per run**, never overwritten: `{{reports}}/<YYYY-MM-DD>-<name>.md`, with today's date.

  | Command | `<name>` |
  |---|---|
  | `start-working-on-issue` | `issue-<n>-work` |
{{#if qa}}
  | `run-playbook` | `issue-<n>-qa` (a playbook without an issue number: its file stem, lowercased) |
{{/if}}
  | `start-pre-merge-review` | `pre-merge-<branch>` (`/` in the branch becomes `-`) |
  | `plan-to-prd` | `prd-<slug>` (the PRD's slug) |

- The file exists already (a second run the same day) → add `-2`, `-3`, … before `.md`.
- `mkdir -p {{reports}}` first. Write it with the Write tool.

## When

- **Always last**: after the final summary and any publish step, so it can carry the {{PR}} comment's
  URL.
- **On an early stop too** (a gate halt, an abort, an error): it then says where the run stopped,
  why, and how to pick it up. Only an abort before anything was done (the first question
  answered *Abort*) writes none.
- After writing, print one line in chat: `Report: {{reports}}/<file>`.

## Shape

```markdown
# <title> · <D Mon YYYY>

**In short:** <verdict mark> <one or two sentences: what happened and where it stands now>

## Done
- <an outcome, in plain words>

## Still open
- <what isn't done or isn't verified, and why>   (or: Nothing)

## Your next step
- <what the user does next, with the exact command>

<footer: one line, ` · `-separated: the detailed files, the branch, the commits, the {{PR}} or issue link>
```

Verdict mark: ✅ done / all good · ⚠️ done, with caveats · ⛔ blocked or stopped.

## Writing rules

- **Short.** At most 25 non-blank lines. One line per bullet, at most five bullets per section:
  group the rest ("4 doc fixes: docs/api.md, docs/setup.md, README, CLAUDE.md").
- **Plain words, outcomes not process.** Say what changed for a person or the product ("An invite
  of an address that already has an account now asks first"), not what the run executed ("Stage 5
  item 3 ✅"). No stage numbers, no severity codes (🔴 🟡 🔵), no tables, no markers, no jargon a
  reader must look up. Code names (a file, a command, a setting) only where the reader needs them
  to act.
- **Honest.** Failing checks, skipped steps, things not verified, uncommitted work and dev left
  changed go in *Still open*, never smoothed over. Nothing left → `- Nothing`.
- **Shorter than the chat summary**, not a copy of it.
- **Safe to share.** Paths relative to the repo root (never absolute: they carry the home
  directory). No secret, token, password, invite or setup link, `.env` value, or a person's name,
  phone number or email: refer to records by id and to people by role.
- Written in the language of `project.md` §Language (tooling language), English by default.

## What goes in, per command

| Command | Title | In short | Done | Still open | Your next step | Footer |
|---|---|---|---|---|---|---|
| `start-working-on-issue` | `Issue #<n> — <title>` | scope complete or not; tests green; committed / held for review | the scope items finished this session, as outcomes (plus docs updated, in one bullet) | unfinished items, verification still owed, open questions, dev data or `.env` to revert | {{#if qa}}the playbook run, {{/if}}the pre-merge review, the {{PR}} | PRD, handoff, {{#if qa}}playbook, {{/if}}branch, commit count |
{{#if qa}}
| `run-playbook` | `Issue #<n> — QA run` | the verdict (works as specified / with caveats / blocking bugs) | what was confirmed to work, the fixes applied (each with its commit or "uncommitted"), playbook corrections in one bullet | open bugs, what wasn't exercised and why, parts skipped, anything not put back on dev | fix the open bugs, or the pre-merge review and ship | QA results file, evidence folder, branch @ sha |
{{/if}}
| `start-pre-merge-review` | `Pre-merge review — <branch>` | the overall verdict (✅ ready, ⚠️ ready with comments, ⛔ not ready; a PRD item left undone counts toward it) and the one reason why not | what the reviews confirmed, fixes applied, docs brought in line, no / some upgrade steps | warnings worth fixing before merge, test gaps, PRD items not done or only partly done, uncommitted edits (not on the {{PR}} until pushed), where a gate halted | commit and push the edits, then `/{{prefix}}:ship` (or the re-run after a halt) | `PRE-MERGE-REVIEW-REPORT.md`, changelog, {{PR}} comment URL, {{PR}} / issue |
| `plan-to-prd` | `PRD — <title>` | the feature in one sentence, and the PRD's state (written / issue opened) | the key decisions: goals, what's out of scope, the phases | open questions, conflicts raised with the project's decisions or hard rules, owner-only steps | `/{{prefix}}:start-working-on-issue <n>` on branch `issue-<n>-<slug>`, or create the issue | PRD path, issue URL |

## Example

```markdown
# Issue #98 — Invite of an existing account · 5 Nov 2026

**In short:** ✅ An invite of an address that already has an account now asks before adding it.
All scope done, tests green, 2 commits, not pushed.

## Done
- The invite dialog asks for confirmation when the address already has an account
- Account cards show which other workspaces an account is also on
- The CLI `invite` command takes `--existing` to add a known account
- Docs: docs/accounts.md, docs/cli.md, CLAUDE.md

## Still open
- The dialog flow has no browser test yet (only covered by the manual playbook)

## Your next step
{{#if qa}}
- Run the playbook: `/{{prefix}}:run-playbook 98`
{{/if}}
- Then `/{{prefix}}:start-pre-merge-review` and `/{{prefix}}:ship`

ISSUE-98-HANDOFF.md · {{#if qa}}ISSUE-98-TEST-PLAYBOOK.md · {{/if}}branch issue-98-invite-existing-account · 2 commits
```
