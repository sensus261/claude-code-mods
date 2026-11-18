# Test playbook: the format

`ISSUE-<num>-TEST-PLAYBOOK.md` at the repo root says exactly what to run, click and expect to test
an issue's changes. These commands use this spec:

- `/{{prefix}}:start-working-on-issue` writes the playbook (Stage 8).
- `/{{prefix}}:run-playbook` runs it (and writes one when it's missing).
{{#if tour}}
- `/{{prefix}}:pr-tour` and run-playbook's Stage 6b read its `## Tour` section.
{{/if}}

A person can follow it by hand; the runner drives what it can and asks for the rest. Write it for
both.

The file is local and untracked: never stage or commit it. It reaches the {{PR}} as a collapsible
comment (`pr-notes.md`), so a reviewer can follow it too. Announce the file name before writing it.
If it already exists, ask **Overwrite** / **Keep it**.

## 1. What it covers

- **Scope.** Cover what the branch actually changes (`git diff origin/{{base}}...HEAD` plus the
  working tree), checked against the PRD's Verification / Acceptance criteria. Every user-visible
  change, command, setting, route, job and migration gets a step. Nothing the branch doesn't
  contain gets one.
- **Sources.** Take commands from the CLI and the docs, and routes and labels from the code. Never
  invent one.
- **Hard rules hold** (`project.md` §Hard rules and §Dev stack):
  - Commands run the way `project.md` §Run says.
  - Anything that sends (mail, messages, webhooks) stays in the project's test mode.
  - No real identity, secrets or tokens (`…` placeholders).
  - Anything that reaches a deployed or paid service is a live part (below).
- **Unconfirmed steps.** Mark a step whose expected result you couldn't confirm from the code with ⚠️.

## 2. Shape

```markdown
# Test playbook: <what> (issue #<num>)

<One line on how to follow it.>

| Part | What | Who | Time | Cost / risk |
|---|---|---|---|---|
| 0 | Setup | 🤖 | 2 min | none |
| 1 | … | 🤖+👤 | … | … |
| N | **<live part>** | 🤖 | … | **<what it spends or touches>** |
| N+1 | Put dev back | 🤖 | … | none |

---

## Part 0 — Setup

### Variables

- `<RECORD_ID>`: a record the playbook may change. Find one with the read-only query or click path
  that lists candidates (`project.md` §Dev stack, database access).

1. <step>

   **→ Expect:** <exact result>

## Part 1 — <title>

_Changes:_ <what this part writes to dev: DB rows, `.env` keys, local services, dev deploys,
services started>. Omit the line when the part only reads.

1. <one action>

   **→ Expect:** `<literal string>` …
2. 👤 <a step only a person can judge>
   - [ ] <visual check>
```

### Ordering

- Parts that cost nothing and run locally come first.
- Parts that touch something real come last, with the risk in **bold**: a paid API, a real deploy,
  a real domain or mailbox, or production.

### The parts table

- Columns: Part · What · **Who** · Time · Cost / risk.
- Who is one of three marks:
  - 🤖 a runner can do every step (CLI, SQL, HTTP, a browser script, screenshots);
  - 👤 only a person can;
  - 🤖+👤 mixed.

### Part 0 — Setup

- The `.env` edits, noting the old values to restore (by key, never printing a secret).
- The commands to rebuild, migrate, restart or seed data.
- A `### Variables` list: each `<NAME>` the playbook uses, what it must be, and the read-only query
  or click path that finds a candidate. Name a variable by what it is (`<RECORD_ID>`, `<SLUG>`,
  `<VERSION>`), never by a real value.

### One part per feature area

- **Headings** are exactly `## Part N — <title>`. The runner parses them.
- **`_Changes:_` line** at the top of every part that writes dev state.
- **Steps** are numbered, one action each: what to run (a fenced command) or what to click. Then
  `**→ Expect:**` with the exact log line, toast, email subject, state, row or page, with literal
  strings in backticks.
- **Labels** are named as the UI shows them (in the product's language, `project.md` §Language,
  with the English in brackets the first time when it isn't English).
- **Visual checks** are `- [ ]` lists. UI parts cover every theme the product has and desktop +
  360 px.
- **👤 prefix** on a step that needs human judgment or something outside the stack:
  - legal or marketing wording;
  - taste ("reads well", "looks balanced");
  - a phone, a real mailbox, a physical device.

  An objective visual check (present, readable, no sideways scroll, no console error) is not 👤: a
  runner checks it from a screenshot.

### Edge cases

Guards, disabled states, roles / permissions and the failure paths from the PRD and the code. They
go in their own part or at the end of each area's part.

### A live part

It opens with a `> **Live run.**` callout:

- what it calls, what it costs and how long it takes;
- what it changes in the dev data;
- what must be running first (`project.md` §Dev stack); never stop a service you didn't start.

### Last part — Put dev back

- Undo every `_Changes:_` line and every Part 0 `.env` edit.
- Stop the services the playbook started.
- Delete or keep the test data it made: say which.

### Appendices

- **Appendix A:** the automated checks (`local-gate.md` §Gate, relevant tests only) and the new or
  rewritten test files. Name what was skipped and why.
- **Appendix B:** a Symptom · Likely cause · Fix table.
{{#if tour}}

### Tour (last section)

A ready-made guided tour of the change (`guided-tour.md`), written now, while the change is fresh.
`/{{prefix}}:pr-tour` and `/{{prefix}}:run-playbook` (Stage 6b) fill in its Variables and open it as
is, instead of analysing the diff again. It goes after the appendices, under exactly `## Tour`:

```markdown
## Tour

A guided tour of this change (`/{{prefix}}:pr-tour`, or `/{{prefix}}:run-playbook` before it puts dev back).
Needs: Part 0, Part 3.

| Window | Account | Opens | Options |
|---|---|---|---|
| Admin | app admin | `/settings/team` | |
| Member, phone | app member | `/inbox` | mobile |
| Public page | none | `http://localhost:3000/pricing` | dark |

| # | Window | Do | See | Outline | Page |
|---|---|---|---|---|---|
| 1 | Member, phone | Open an item, change its title, tap `<label>`. | `<what the page says>` | `<label>` | `/inbox` |
| 2 | Admin | Open the activity log. | the change, with the member's name | `<label>` | |
```

- **Steps:** at most 8, one per user-visible behaviour (the PRD's Acceptance criteria / Verification),
  in the order a person meets them. *Do* is one action, *See* what proves it works, both one short
  line. *Outline* (optional) is the visible text of the element the step talks about, or
  `css=<selector>`; *Page* (optional) is where it happens, for the panel's "Go to" button.
- **Windows** by role, never by account: *Account* is one of the account kinds in `tour.md`
  §Accounts (`<surface> <role>`), or `none` (a public page). *Opens* is a path on that surface, or a
  whole `http://localhost:<port>` address (the tour's browser runs on the host: `tour.md`
  §Surfaces). *Options*: `mobile`, `dark`. The fewest windows that show the change.
- **Needs:** the parts whose setup the tour stands on (the data, a build, a service). Variables are
  the playbook's own `<NAME>`s: the tour adds none.
- **Labels** follow the playbook's rules: exactly as the page shows them, from the code; ⚠️ on one
  you couldn't confirm.
- **Nothing a person could see** (only internals, a CLI, tests): write the section anyway, as one
  line, `No tour: <why>`, so a reader stops there instead of analysing again.
- No secret, token or real identity, as everywhere in the playbook.
{{/if}}

## 3. After writing

Show the path, the parts table{{#if tour}} and the tour's step count{{/if}}. Then suggest
`/{{prefix}}:run-playbook <num>` to run it{{#if tour}}, and `/{{prefix}}:pr-tour` to see the change hands-on{{/if}}.

## 4. Older playbooks

Playbooks written before this spec have no Who column, no Variables list and no `_Changes:_` lines.
They stay valid. The runner infers them:

- **Who:** 🤖 unless a step needs a person.
- **Variables:** every `<NAME>` placeholder.
- **Changes:** every step that writes (a POST, an `INSERT` / `UPDATE` / `DELETE`, a non-dry-run
  command, a `.env` edit, a deploy, starting a new service).

Don't rewrite an old playbook only to add them. Corrections from a run are applied in place.
{{#if tour}}

A playbook without a `## Tour` section still runs. The tour readers then fall back to building one
(`guided-tour.md` §2), and offer to append the section they built, so the next tour reuses it.
{{/if}}
