---
description: 🧪 QA — Run an issue's test playbook (or a story playbook) on the dev stack. It drives every step it can (CLI, SQL, HTTP, browser scripts), asks you only for judgment calls ({{#if tour}}in a guided tour: browser windows open signed in, with a control window of ✓ / ✗ beside them; or {{/if}}with the absolute path of every screenshot to open), can reach real services only when you choose, records results in ISSUE-<n>-QA-RESULTS.md, fixes the failures you pick, puts dev back and leaves a brief report in {{reports}}/{{#if tour}}. With `demo`, it builds a playbook's data up to a part in a guided browser and keeps it, to show the app{{/if}}
argument-hint: "[issue-number | playbook-path | story name] [parts, e.g. 2-4 | 1,3 | failed] [--real]{{#if tour}} [--tour | --shots] [demo]{{/if}}"
---

## Task

Run `ISSUE-<n>-TEST-PLAYBOOK.md`, or a story playbook from `{{shared}}/playbooks/`
(`test-playbook.md` §Story playbooks), against the dev stack and leave a results file a later session
or a reviewer can trust.{{#if tour}} With `demo`, the run builds data to show instead of testing it (§Demo mode).{{/if}}

- **Drive, don't dictate.** Run every step you can yourself. The user only judges what a person must
  (👤 steps). Never read steps out for them to click.
- **Show it, don't describe it.** {{#if tour}}A 👤 step is judged in a **guided tour** by default: browser
  windows open already signed in on the right page, beside a control window that says what to do and
  what they should see, with ✓ Looks right / ✗ Problem buttons you watch live (Stage 4, *Guided tour of a
  part*). When the user picks screenshots instead, print{{else}}For a 👤 step, print{{/if}} the absolute path of each
  screenshot, what to look at in it and what a pass looks like (Stage 4, *Handing evidence to the
  user*). Never "see the evidence folder".
- **Real services are a choice.** By default nothing reaches a deployed, shared or paid service
  (`{{shared}}/project.md` §Real services). The user can opt in at Stage 2 (`$REAL`).
- **Log failures and go on.** A failed step is recorded with its evidence and a read-only trace. The
  user picks what to fix at the end (Stage 5).
- **Leave dev as you found it.** Every change to dev is written to the ledger *before* it is made,
  and Stage 7 always runs, on an abort too.{{#if tour}} In demo mode the data the playbook built stays;
  everything else is put back.{{/if}}
- **End with a brief report.** Stage 9 writes a plain-words summary to `{{reports}}/`, on an abort too.

Run the stages in order. Stop only at the GATEs.

The playbook format is `{{shared}}/test-playbook.md`. Older playbooks without the Who column,
Variables or `_Changes:_` still run: infer them (§4 there). The dev stack (services, addresses,
helpers, quirks, test accounts, browser scripts) is `project.md` §Dev stack; read it first.

### Names used below

| Name | What |
|---|---|
| `<n>` | The issue number. For a playbook path that has no `ISSUE-<n>-` prefix (a story playbook), use its file stem instead |
| `$PB` | The playbook file |{{#if tour}}
| `$MODE` | `qa` (default) or `demo` (§Demo mode). Chosen in Stage 0 |{{/if}}
| `$RES` | `ISSUE-<n>-QA-RESULTS.md` at the repo root. Local and untracked: never stage or commit it |
| `$REPO` | The repo root as an absolute path (`git rev-parse --show-toplevel`). Screenshot paths shown to the user start with it |
| `$REAL` | `local` (default) or `real`: whether the run may reach the real services of `project.md` §Real services. Chosen in Stage 2 |
| `$TOUR` | {{#if tour}}`tour` (default) or `shots`: how the 👤 steps are judged. Chosen in Stage 2{{else}}always `shots` (the tour pack is off){{/if}} |
| `$WS` | `{{tmp}}/qa-<n>/`, ignored by git: `env.bak`, browser storage state, logs, `accounts.json` (the throwaway accounts' passwords{{#if tour}}, read by the tour{{/if}}){{#if tour}} and `tour/` (tour files and their logs){{/if}} |
| `$EV` | The evidence folder (`project.md` §Dev stack, browser scripts; default `{{tmp}}/qa-<n>/evidence/`): screenshots and output kept as evidence. Shown to the user as an absolute host path |
| `$SPEC` | Where this run's browser scripts go (`project.md` §Dev stack, browser scripts: a folder where the browser library resolves). If it is not ignored by git, never stage it, and delete it in Stage 7 |

### Helpers

`project.md` §Dev stack lists the project's helpers: how to query the database (read-only unless a
step writes), how to read the mail catcher, how to inspect background jobs, the in-network
addresses a browser script uses, and the overrides a CLI step needs to stay on the local stack.
Use them as written. A browser step is a plain script in `$SPEC` run the way §Dev stack says; dump
the page text before guessing selectors. Screenshots go to `$EV/<P>.<S>-<light|dark>-<1440|360>.png`
(only the themes the page has); the user is always shown the absolute host path.
{{#if tour}}
**Guided tour.** `{{shared}}/guided-tour.md`. Its windows are in a browser on the host, so its
addresses are the host's (`tour.md` §Surfaces), never in-network names.
{{/if}}

### Dev quirks

`project.md` §Dev stack, quirks (what restarts on a save, what can't run twice at once, how to
recover a killed process). Plus, always:

- Never print a `.env` value. Check a key with `grep -q '^KEY=' .env && echo set`.
- Never edit code a running background job depends on while it runs.

### Real-services mode

The keys for real services may sit in `.env`, which the dev stack loads, so nothing blocks a dev step
from reaching them. `$REAL` is the runner's promise, checked on every step.

A step is **☁️** when it reaches anything `project.md` §Real services lists (a deploy, a hosted
account, a third-party API with real side effects, a shared environment). A part with a ☁️ step is a
☁️ part.

- **`local` (default).** No step touches a real service. A ☁️ step is not run: it is ⏭ `needs real
  services`, and its part says so in the plan. Everything on the local stack runs as usual.
- **`real`.** The user chose to run ☁️ steps against the accounts in `.env` (Stage 2), and confirmed
  what they name (Stage 3). They then run like any command, each with a ledger line first.
- **Local overrides stay on in both modes** (`project.md` §Dev stack). A step that is about a
  deployed service itself is asked on its own, every time.
- **Never lifted by `real`:** production, anything that can bill, and the rest of `project.md`
  §Real services' *always ask* list. Each is asked on its own (Stage 2).

{{#if tour}}
### Demo mode

`demo` in the arguments builds a playbook's data on the dev stack and leaves it there, so someone can
show the app with it. It runs in the **guided browser** (below): the person sees every step happen
and confirms it. It isn't a QA run: nothing is fixed, nothing is published. It is meant for the story
playbooks (`test-playbook.md` §Story playbooks), whose parts build on each other. The stages run as
described, with these differences:

| Stage | In demo mode |
|---|---|
| 0 | A single part number `N` means `0-N`: everything up to the end of Part N. A range or a list is taken as given; none means every part. `--tour` / `--shots` are ignored |
| 1 | Step 5: when `$RES` shows parts already done (by a demo or a QA run), offer **Go on after Part <last done> (Recommended)** first: their data is still on dev, so those parts don't run again. Part 0 still runs |
| 2 | No scope or judging question: print the plan and go. Still asked: the real-services question (a demo stays local unless the user says otherwise), each live part, and the *always asked* list. Warn when a part in scope needs a part that is neither in scope nor done in `$RES` |
| 3 | As usual, ledger included: it becomes the list of what the demo left on dev. The tour browser always starts (step 7) |
| 4 | The parts run in the guided browser. Every step's `→ Expect:` is still checked by the script, and the person gives a verdict on it (✓ / ✗): that verdict covers the 👤 judgments; a ✗ is a finding, with its screenshot. A step or part the playbook says to ask about first (⚠️ permanent, a reset) is still asked, in the terminal, before its part starts. On ❌: repair an environment problem and retry once, as usual; otherwise record it, mark the steps that depend on it ⏭ blocked and go on. Never edit product code or `$PB` |
| 5–6b | Skipped. The findings go into the summary, with a pointer to the QA run (the same parts without `demo`) that would fix them |
| 7 | Run the playbook's *Put dev back* part, which says what demo mode keeps. Undo only the ledger lines that aren't demo data (a `.env` key, a service started for one step) and tick the rest `kept (demo)`. The throwaway accounts stay enabled: the person signs in with them to show the app. Stop the tour browser. Keep `$EV` without asking; delete `$WS` last, except `vars.json` (the ids the next parts read), `accounts.json` (`chmod 600`) and `$EV` |
| 8 | Print the *Demo ready* block instead of the summary. Nothing is published to {{a_PR}} |
| 9 | The report is `{{reports}}/<YYYY-MM-DD>-<file stem>-demo.md` |

#### Guided browser

A demo is shown, not only built. The person drives it from the control window of the guided tour
(`{{shared}}/guided-tour.md`); you watch the events.

- **Part scripts.** One per part: `{{shared}}/playbooks/<stem>/part-<N>.mjs`, built on
  `{{shared}}/tour/demo.mjs` (read its header). Run the existing ones as they are. A part in scope
  with no script: write it from the playbook part, following the existing scripts:
  - one `steps` entry per playbook step (`id` `<P>.<S>`, `do` who does what, `see` its `→ Expect:`,
    `highlight` the control it names, `look` where its result shows: *What the viewer sees*, below),
    and a last `end` entry;
  - `demo.window(<role>, { surface, login })` per role of the part, signed in with the throwaway
    account (`tour.md` §Accounts), or without `login` for a public page;
  - `demo.go`, or `demo.wait` + `demo.act`, before every page and every action; `demo.mark` after the
    step's checks; `demo.saveVars` for the ids and codes later parts need (never links or passwords);
    `demo.closePrompt` last, all inside `demo.run`.

  Keep it next to the others. It is the project's file: in committed mode it is committed with the
  playbook, after the user approves the commit. A read-only part can be smoke-tested first with no
  window: `TOUR_HEADLESS=1 TOUR_CDP_PORT=<spare port> {{shared}}/tour/chrome.sh`, then
  `DEMO_AUTO=1 TOUR_CDP=http://127.0.0.1:<port> node <script>`, then `chrome.sh stop` with the same
  port.
- **Layout.** The control window at the right edge of the screen and the app windows to its left, one
  per role, desktop-sized. No phone or dark windows: a demo doesn't need every device
  (`DEMO_DEVICES=1` brings them back, with screenshots in both themes at 1440 + 360 px). One
  screenshot per failed or ✗ step, in `$EV`.
- **What the viewer sees.** Someone watching a shared screen may see only the app window, so the
  window itself shows where to look, and nothing else (no label, no caption):
  - a **pointer** glides to every element the script clicks or types into, with a ripple on each
    click and a glow on the field being filled. It comes by itself: every Playwright action goes
    through one hook in `demo.mjs`, so a part script needs nothing for it (`DEMO_POINTER=0` turns it off);
  - a **violet ring** before a step, on its `highlight` (what it will use);
  - an **amber ring** after a step, on its `look` (where its result shows: the total, the new status,
    the record that appeared), until the next step starts; not on a failed step. A `look` is visible
    text (the smallest visible element holding it wins, buttons and links first, so pick text only the
    result has: `Order approved`, not `approved`), `css=<selector>` (a canvas, a field), or a `{VAR}`
    the parts saved (`{ORDER_CODE}`). Every step whose result is on a page gets one; a download has
    none. Each look is a `look` event saying what it rings (`"found": "dd: 762.30"`, or `null`);
    `DEMO_LOOKSHOTS=1` keeps `<evidence>/<step>-look.jpg` as the viewer sees it. Check every new
    look that way, on a smoke test, before a person sees it.
- **Two clicks per step.** **▶ Do it** (or Enter) runs what the `Next:` line says. Then the control
  window shows the script's own check as a green or red line above the step and asks **✓ Looks
  right** / **✗ Not right**; a ✗ carries the person's words and a screenshot of that window. There is
  no ←: the script can't undo a step. **✎ Note** (or N) records a remark; **No stops** runs the rest
  of the part without stopping, **Stop** stops again (the notes `auto` and `pause` do the same). A
  part ends with **▶ Go on to Part N**, the last one with **▶ Close the windows**.
- **Run and follow.** Tell the person in a few lines how it works (the control window, the two clicks,
  ✎ Note). Then run every part in scope in one background command, in order, one log per part, the
  way `tour.md` §Runner runs the launcher (environment variables passed through it):
  `for n in <parts>; do <runner> node {{shared}}/playbooks/<stem>/part-$n.mjs > $WS/part-$n.log 2>&1 || break; done`.
  Set `DEMO_WS=$WS` and `DEMO_EV=$EV` when they aren't the defaults (`{{tmp}}/qa-<stem>/` and its
  `evidence/`). Follow them with Monitor (`timeout_ms` 1800000, re-arm while it runs):
  `tail -n +1 -F $WS/part-*.log | grep --line-buffered -E '"type":"(step|verdict|problem|mode|error|done|closed)"'`.
  - Answer each event in one short line.
  - `closed` means the person closed the control window: the run stopped there and the next parts
    didn't start; ask whether to start again.
  - An `error` line (an action that failed, with `url` and `shot`; `fatal` when the script itself
    stopped) is traced read-only like any ❌. A ❌ that is the script's fault (a wrong check, not the
    app) is 🟡: fix the part script for the next run.
  - After each part, update `$RES` from its log: the script's marks, the person's verdicts, the notes.
- **Restart.** The person may ask to start over at any time: stop the background command,
  `pkill -f '{{shared}}/playbooks/<stem>/part-'` (SIGTERM: the scripts close their own windows; never
  `-9`), put back what the parts already run changed (a read-only part changed nothing), and launch
  again from the part they name.
- **Without an agent.** Showing a story should not need you every time. Once its folder has
  `setup.mjs` (Part 0 as a script: the throwaway accounts written to `DEMO_ACCOUNTS`, the base data,
  safe to run again, one `{"type":"setup","item","state":"done|already|failed","why"}` line per item)
  and `demo.json` (`title`, `surface` or `base`, `signIn` without passwords, `startAt` with `{VAR}`s,
  `reset`: the commands that wipe dev back to the seed, `standaloneFrom`), anyone runs it with
  `node {{shared}}/tour/present.mjs <stem> [parts]` (`test-playbook.md` §Story playbooks): preflight,
  the reset question, setup, the parts in one browser, the *Demo ready* block. It shares this mode's
  workspace, so a demo can go on with or without you. When a demo run here wrote a part script and the
  story has no `setup.mjs` or `demo.json` yet, offer once to write them from Part 0 and the *Demo
  ready* block (**Yes (Recommended)**, **No**); smoke-test `setup.mjs` twice (the second run says
  `already`). They are the project's files, committed with the playbook like the part scripts.

The *Demo ready* block:

```
## Demo ready — <playbook title> · up to Part <N>

**State:** <one line: what the data shows now>
**Sign in:** <each account of the playbook that exists now: its login and the surface's address; the passwords are in {{tmp}}/qa-<stem>/accounts.json, never printed>
**Start at:** <2 to 4 host addresses of the records the run created>
**Did not work:** <the ❌, ✗ and ⏭ blocked steps, and what data is missing because of them, or none>
**Later:** go further with `/{{prefix}}:run-playbook <path> <M> demo` · test the same parts with `/{{prefix}}:run-playbook <path> <parts>` · put dev back: <the ledger lines kept (demo), with their undo>
```

{{/if}}
## Stage 0 — Resolve the playbook

1. Take `$ARGUMENTS`:
   - **A number** → `ISSUE-<n>-TEST-PLAYBOOK.md`.
   - **A path** → that file.
   - **A name** → the story playbook `{{shared}}/playbooks/<name>.md`.
   - **A trailing parts list** → keep it for Stage 2. It can be `2-4`, `1,3` or `failed`.
   - **`--real`** → the user already wants `$REAL=real`. Stage 2 skips its question; Stage 3 still
     confirms. When no part in scope is ☁️, say *"`--real` ignored: nothing in scope reaches a real
     service"* and use `local`.
{{#if tour}}
   - **`--tour`** / **`--shots`** → `$TOUR`. Stage 2 skips its judging question.
   - **`demo`** → `$MODE=demo` (§Demo mode).
{{/if}}
2. **Empty arguments.**
   - The branch matches `^issue-(\d+)-` → ask *"Run the playbook of issue #<n>?"* (**Yes**,
     **Another one**).
   - It doesn't → `ls ISSUE-*-TEST-PLAYBOOK.md {{shared}}/playbooks/*.md` and ask which.
3. **No playbook** → ask **Write one now** or **Abort**.
   - Write → follow `test-playbook.md`, built from `git diff origin/{{base}}...HEAD`, the working tree
     and the issue's PRD. Then continue with Stage 1.
   - Never guess another issue number.

## Stage 1 — Preflight (read-only)

1. **Branch.** If `git branch --show-current` isn't the issue's branch, warn that the playbook would
   test code that isn't checked out. Ask **Continue** / **Abort**. Never switch branches. A playbook
   with no issue behind it (a story playbook, or any path with no `ISSUE-<n>-` prefix) runs on any
   branch: name the branch and go on.
2. **Freshness.** Take the playbook's date: its last commit (`git log -1 --format=%cI -- "$PB"`) when
   it is tracked, else its mtime. Compare `git log --since="<that date>" --name-only --format=%h` with
   the files and areas the playbook names. If they overlap, flag *"the playbook may be stale: N commits since it
   was written touch <areas>"*. Flag it, don't block. List the uncommitted changes too
   (`git status --short`).
3. **Parse `$PB`.** For each part read:
   - its title, Who mark, cost / risk and `_Changes:_`;
   - its steps, each with its action, its `→ Expect:`, any `- [ ]` checks and any 👤 or ⚠️ marker;
   - its `> **Live run.**` callout;
   - whether it is ☁️ (§Real-services mode) and what it does there.

   Then read the Variables, the *Put dev back* part and the appendices{{#if tour}}, and the `## Tour` section (spec
   §2 *Tour*: Stage 6b opens it){{/if}}. Fill in what an old playbook lacks (spec §4). When *Put dev back*
   is missing, Stage 7 works from the ledger alone: say so.{{#if tour}} When `## Tour` is missing, say so in
   the plan: Stage 6b then builds the tour and offers to add it.{{/if}}
4. **Stack.** The health check of `project.md` §Dev stack: the services must be healthy, plus the
   ones Part 0 needs. Note any background job in flight (it limits Stage 6). Don't start anything
   that costs money or a shared resource just to check it.
5. **`$RES` exists.** Read it: its parts table, ledger, Variables and Session sections. If the ledger
   has unticked entries, say so first: dev is still changed from the last run. Ask:
   - **Resume at Part <first not done>**;
   - **Re-run failed + untested only**;
   - **Start over**: move the old file to `$WS/results-<date>.md`. Its unticked ledger entries carry
     over.

## Stage 2 — Plan (GATE)

Print:

```
## Playbook run — issue #<n> · <playbook title>
Branch <branch> @ <sha> · playbook <fresh | ⚠️ maybe stale: …> · stack <healthy | …>

| Part | What | Who | Cost / risk | Changes | ☁️ Real services |
|---|---|---|---|---|---|
```

The last column is `—` for a part that never reaches a real service, else what it does there.

Then one **AskUserQuestion**, with up to three questions.

**1. Scope.** Skipped when Stage 0 got a parts list: that list is the scope, and each live part in it
still gets asked.

> Which parts should I run?

- **Everything, ask before each live part (Recommended)**
- **Free parts only**: live parts are recorded as ⏭
- **Everything, no per-part ask**

The user can also type a part list under Other.

**2. Real services.** Asked only when a part in scope is ☁️ and Stage 0 didn't get `--real`, even
when question 1 is skipped.

> Should ☁️ steps reach the real services your `.env` names?

- **Local only (Recommended)**: `$REAL=local`. The ☁️ steps are recorded as ⏭ `needs real services`
  and nothing touches them.
- **Yes, the accounts in my `.env`**: `$REAL=real`. The ☁️ steps run for real. Stage 3 shows what
  they will touch and asks once more.
{{#if tour}}

**3. Judging.** Asked only when a part in scope has a 👤 step a browser can show (a page, a mail in
the mail catcher) and Stage 0 didn't get `--tour` or `--shots`.

> How do you want to judge the 👤 steps?

- **Guided tour (Recommended)**: `$TOUR=tour`. At the end of each part with 👤 steps, browser
  windows open already signed in on the page, beside a control window: what to do, what you should see,
  ✓ Looks right / ✗ Problem. I watch your answers live.
- **Screenshots**: `$TOUR=shots`. I take them, print their paths and ask here.
{{/if}}

Rules:

- Part 0 and *Put dev back* always run.
- `failed` means the parts with a ❌ or an untested step in `$RES`.
- *Free parts only* also skips every ☁️ part, whatever `$REAL` says.

**Always asked on its own, whatever the scope or `$REAL`:** production, anything that can bill,
starting a shared or paid resource (ask the user to start it unless they let you, and never stop
one you didn't start), and the rest of `project.md` §Real services' *always ask* list.

## Stage 3 — Setup

1. **Workspace.** Create `$WS` and `$EV`. `$SPEC` is created when the first browser step needs it.
2. **Results file.** Write the `$RES` skeleton (§Results file) before anything changes dev.
3. **Write-ahead ledger.** From here on, before every change to dev, add a ledger line:
   `- [ ] <change> · undo: <exact command or click>`. Tick it when Stage 7 undoes it. Changes include:
   a `.env` key; DB rows; a dev deploy; a service started; a user account; files in `$SPEC`; and
   **a ☁️ change (`$REAL=real`)**: it changes a real service, not dev; the undo is the playbook's
   own, else the one `project.md` §Real services gives. Name the record by id, never a key or a
   token.
4. **`.env` edits.**
   - Copy it once: `cp .env $WS/env.bak`.
   - Change only the named key in place (`sed -i.bak 's/^KEY=.*/KEY=<value>/' .env && rm .env.bak`),
     or append it when it is absent.
   - The ledger gets the key name, never a value.
   - Then restart what reads it (`project.md` §Dev stack).
5. **Throwaway accounts** (only when a part signs in somewhere). Create them the way `project.md`
   §Dev stack, test accounts says (an `@example.test` address, a fake identifier that reaches no
   one), set a password generated in a browser script, and write it to `$WS/accounts.json`
   (`{"<login>": "<password>"}`, `chmod 600`{{#if tour}}: the guided tour signs in with it{{/if}}) with the
   storage state in `$WS`. Never print them or copy them into `$RES`. An account left from a past
   run → re-enable it and reset its password the same way. A setup or invite link is never written
   anywhere.
6. **Real services** (only `$REAL=real`).
   - Check the keys `project.md` §Real services names without printing a value:
     `for k in <KEYS>; do grep -q "^$k=." .env && echo "$k set" || echo "$k MISSING"; done`.
     A missing key → say which, set `$REAL=local` and mark the ☁️ parts ⏭.
   - Tell the user what is about to happen, from the plan's ☁️ column: which parts, what they do
     and to which record. Say that the accounts `.env` names may be production's, that what a deploy
     publishes may be reachable on the internet, and that the run undoes only what it created, in
     Stage 7.
   - Never print a key, an account id or any `.env` value. Name the keys, not their contents.
   - Ask **Use the accounts in my .env** / **Back to local only** (`$REAL=local`, ☁️ parts ⏭).
   - Record `$REAL` in `$RES` (header line and §Dev state ledger).
{{#if tour}}
7. **Tour browser** (only `$TOUR=tour`, `guided-tour.md` §0). Check the launcher's prerequisites
   (`tour.md` §Runner), add the ledger line, then start the browser:
   `- [ ] tour browser started · undo: {{shared}}/tour/chrome.sh stop`.
   It fails (no Chromium-family browser, the port taken) → say why in one line, set `$TOUR=shots`
   and go on.
{{/if}}
8. **Variables.** Resolve each `<NAME>` with its read-only lookup and print the picks with one line on
   why each fits. Ask once: **Use these** / **Let me pick**. Record them in `$RES` §Variables, as ids
   and slugs only.
9. **Run Part 0's steps** as in Stage 4.

## Stage 4 — Execute

Go part by part, in playbook order, within the Stage 2 scope.

**Before a live part.** Unless the scope says no ask, restate its callout: what it calls, how long it
takes, what it writes. Ask **Run** / **Skip**. A ☁️ part under `$REAL=real` is a live part: restate
what it does to the real service too.

**Each step.** Its kind decides how it runs:

| Step | How |
|---|---|
| A command or HTTP call | As written, the way `project.md` §Run says, plus the local overrides. Over ~2 min: Bash `run_in_background`, with a Monitor when there is a log to follow |
| A ☁️ step | `$REAL=local` → don't run it: ⏭ `needs real services`, and steps that depend on it are ⏭ blocked. `$REAL=real` → ledger line first, then run it. Read the command before running it |
| SQL | The database helper. Write only when the step itself writes |
| A click | A browser script in `$SPEC`. Assert the exact toast, label or state from `→ Expect:` |
| `- [ ]` visual check | Screenshots in every theme the page has, at 1440 + 360 px. Read them and judge what is objective: present, readable, no sideways scroll (`scrollWidth > clientWidth`), no console error. Taste goes to 👤, and its screenshots are kept for the hand-over below |
| Mail | The mail-catcher helper: subject, recipient (the test inbox), body text |
| 👤, or not reachable from the stack (a phone, a real mailbox, legal wording) | Collect these, with their evidence ready (screenshots taken, URLs noted). At the end of the part, hand them over: {{#if tour}}`$TOUR=tour` → *Guided tour of a part*; `shots`, and every step a browser can't show → {{/if}}*Handing evidence to the user*. Send a PushNotification when this blocks |

Compare what happened with `→ Expect:` and mark the step:

| Mark | Meaning |
|---|---|
| ✅ | Pass |
| ❌ | Fail: the behaviour is wrong |
| 🟡 | The behaviour is right but the playbook is wrong: wording, a number, a label, a missing step |
| ⏭ | Skipped: out of scope, declined at a gate, or `blocked by P.S` |
| 🚫 | Not testable on dev: say why and what covers it instead (a test file, a later environment) |

A ⚠️ step gets a ✅ or ❌ like any other. Note in `$RES` whether its guess held.
{{#if tour}}

### Guided tour of a part (`$TOUR=tour`)

The person judges the part's 👤 steps on the real pages, signed in, guided by the control window
(`{{shared}}/guided-tour.md`). For each part with 👤 steps a browser can show:

1. **Build the tour** `$WS/tour/part-<P>.json`:
   - `title` `#<n> · Part <P> — <part title>`, `accounts` `$WS/accounts.json`, `shots` `$EV`.
   - One step per 👤 step or taste check, in playbook order, at most 8 (more → a second tour,
     `part-<P>b.json`). `do` is the step's action in one line, `see` its `→ Expect:` or its
     `- [ ]` check, `highlight` the control it names, `path` the page it happens on.
   - Windows: the throwaway accounts by surface (`tour.md` §Accounts), public pages by whole
     `http://localhost:<port>` address. A check about 360 px or dark gets its own `mobile` / `dark`
     window.
   - The data is what the part already set up: the tour adds none. A part tour is a quick look, never
     committed: it stands on this run's data.
2. **Run it:** `guided-tour.md` §3 *A quick look*, then §4–§5, with the old log removed first.
3. **Record each answer** as it comes, in `$RES`:
   - **ok** → ✅, evidence `tour ✓`.
   - **problem** → ❌ (🟡 when the person says the playbook is what's wrong), evidence the `shot`
     (from the repo root) and the person's words. Trace it read-only and add a finding, as in *On ❌*
     below. Never fix it here: set `"status": "Noted as finding <k>: <one line>"`, `"state":
     "ready"`, `"current": N+1` (after the last step: `"state": "done"` instead).
   - **closed** before every step was answered → the unanswered steps go to *Handing evidence to
     the user*.
4. **Between parts** the tour browser stays up (`chrome.sh` reuses it); each part opens new windows.
{{/if}}

### Handing evidence to the user

{{#if tour}}With `$TOUR=shots`, and for the 👤 steps a tour can't show.{{else}}For every 👤 step.{{/if}} The user must open every
file you ask about without hunting for it. For each such step at the end of a part:

1. **Only what needs a person.** List the screenshots a person must judge: taste, wording, balance, a
   real device. Not the ones you already judged objective.
2. **Check each file exists** (`ls`) and is the latest one for that step: after a retry, the retry's
   shot. A missing file gets retaken, never listed.
3. **Print the paths in chat first, then ask.**
   - Use the **absolute** host path, never `$EV` or a relative one.
   - Put one path per line, bare: no backticks, no table, no markdown link. A terminal makes a bare
     absolute path clickable, and a table cell that wraps breaks it.
   - Group by step, in this shape:

   ```
   ### 👤 To judge — Part <P> (<k> items)

   <P>.<S> — <the question for the person, in one line>
     look at: <the section, the control or the state, exactly>
     pass if: <the expectation>
     /Users/…/<repo>/<evidence>/<P>.<S>-light-1440.png   (light · desktop)
     /Users/…/<repo>/<evidence>/<P>.<S>-dark-360.png     (dark · 360 px)
   ```

   - Then one line the user can paste to open them all: `! open <path> <path> …` (macOS; `xdg-open`
     on Linux; quote a path that holds a space). The `!` runs it in the session, so the images open
     at once.
4. **Repeat the paths inside the question.** The dialog may be all the user sees. One
   **AskUserQuestion** question per 👤 step (up to 4 per call; more steps, more calls). Each names the
   step, what to judge and the absolute paths. Options: **Looks right** / **Wrong: <say what>**.
5. **Not a screenshot?** Give the exact place instead: the mail-catcher message (its address plus the
   subject), the page URL (a `$REAL=real` page may be on the internet: give its address), or where to
   look on the phone.
6. **Record it.** In `$RES` §👤 To judge write the same list with paths relative to `$REPO` and the
   verdict. An absolute path carries the home directory, and `$RES` can reach {{a_PR}}.

**On ❌:**

1. Capture the evidence: the exact output lines (trimmed), a screenshot, job logs.
2. Trace the cause read-only, down to `file:line`, reading the owning doc
   (`{{shared}}/routing-tables.md` §Doc mapping).
3. Classify it:
   - **Product bug** → a finding.
   - **Playbook bug** → 🟡 and a finding.
   - **Environment** (a service down, a stale build, a killed process) → repair it and retry the
     step once. If the repair cost time, write it under Recipes.
4. Steps that depend on the failed one → ⏭ blocked.
5. Go on with the rest. **Never edit product code in this stage.**

**After each part.**

- Update `$RES`: the part's verdict, its step rows with evidence paths, and any new findings.
- Print one status line: `Part 3 — ✅ 6 · ❌ 1 · 🟡 1 · ⏭ 0 — <the failure in a few words>`.

## Stage 5 — Findings (GATE)

No findings → say so and go to Stage 7.

```
## Findings — issue #<n>

| # | Sev | Step | Seen (vs expected) | Root cause | Proposed fix |
|---|---|---|---|---|---|
| 1 | ⛔ bug / ⚠️ costly / 📝 playbook | 3.2 | <quoted> | <file:line or data> | <one line> |
```

Severity:

- **⛔ bug:** wrong behaviour, a hard-rule breach (`project.md` §Hard rules, CLAUDE.md), or data at
  risk.
- **⚠️ costly:** slow, flaky, retries.
- **📝 playbook:** the expectation or the step is wrong.

Under the table, list the evidence of each finding that has a screenshot, as absolute paths one per
line (the *Handing evidence to the user* format), so the user can open it before choosing.

Then ask one **AskUserQuestion** with two questions:

1. *"Which should I fix?"* (multi-select). Options: the 3 most severe findings plus **All playbook
   corrections (📝)**. Others can be named by number under Other, and *none* is a valid answer.
2. *"Commits?"* (**Commit each fix**, **Don't commit — I'll review**). The user's own commit rule
   (CLAUDE.md) still applies on top.

## Stage 6 — Fix

1. **No job in flight.** Check that no background job the fix touches is running (`project.md`
   §Dev stack). If one is, wait or ask.
2. **For each chosen finding:**
   - Read the owning doc first and follow the hard rules.
   - Write a test that fails before the fix.
   - Fix it.
   - Run `{{shared}}/local-gate.md` §Gate on the touched files only, never the whole suite.
   - Bump the versions the change requires (`routing-tables.md` §Sync pairs).
   - Keep the sync pairs together.
   - Docs win: if the fix contradicts a locked decision, ask.
3. **Re-verify for real.**
   - Wait for the restarted services to be healthy again.
   - Re-run the failed step, the steps it blocked and the steps the fix plausibly touches.
   - A 👤 step is re-judged the way it was judged.{{#if tour}} A tour: run that part's tour again with
     `"current": <the step>` and `"status": "Fixed: <one line>. Check step <N> again."` (a front-end
     fix may need a build first, `tour.md` §Build).{{/if}}
   - In `$RES` the mark becomes ✅ *fixed in <sha | uncommitted>*. A fix that doesn't hold stays ❌,
     with the new evidence.
4. **Playbook corrections.** Edit `$PB` in place and list each one in `$RES` §Playbook corrections.{{#if tour}}
   A correction to a step the `## Tour` section repeats (a label, an expectation, a page) goes there
   too, so the next tour starts right.{{/if}}
5. **A new gotcha** (it cost time and isn't in the project's docs) → propose the entry. Write it only
   on a yes.
6. **Handoff file.** If `ISSUE-<n>-HANDOFF.md` exists, append `## Session N (<date>) — QA run`: the
   verdict, the fixes and what is still owed.
7. **Commit.** Commit-each-fix chosen → stage only that fix's files, `fix(<scope>): <summary> (#<n>)`
   per `{{shared}}/commits.md`. Never stage `$RES`, `$PB` or `$SPEC`. Never push.
{{#if tour}}

## Stage 6b — Guided tour of the changes (ask)

Skipped on an abort. Asked once, while dev still holds the run's data and accounts (Stage 7 undoes
them):

> Want a guided tour of what issue #<n> changed, to see it yourself before I put dev back?

- **Yes, guide me (Recommended)**
- **No**: go to Stage 7.

Yes → a committed tour of the issue (`{{shared}}/tours/issue-<n>/tour.json`) that is still fresh
(`tour.mjs issue-<n> --check` exits 0) → run it as it is (`guided-tour.md` §3). Otherwise follow
`{{shared}}/guided-tour.md` §3 *A quick look* with `$WS/tour/changes.json`, on the data and accounts
the run already made (`$TOUR=shots` runs start the tour browser here: Stage 3, step 7):

- **The playbook's `## Tour` section** is the tour: translate it (`guided-tour.md` §2), its `<NAME>`s
  from `$RES` §Variables, its `Needs:` already met by the parts that ran (a part that didn't run:
  run its local setup steps first, ledger lines included). No re-analysis.
- **No such section:** build one, at most 8 steps, one per user-visible behaviour of the issue, from
  the PRD's Verification / Acceptance criteria and the parts that ran. After the tour, offer once to
  append it to `$PB` as its `## Tour` section (spec §2 *Tour*).
- Behaviours a 👤 step already judged in a tour this run are left out unless a fix changed them.

A problem reported here is a finding of the run: add it to `$RES` §Findings, then ask **Fix it here**
(Stage 6's rules, then *Check step N again*) / **Just note it**.

Every step ✓ and no committed tour yet → offer once to make it one, so anyone can run it later
without an agent: *"Turn this tour into a committed one (`{{shared}}/tours/issue-<n>/`), with a fixture
that makes its data?"* (**Yes (Recommended)**, **No**). Yes → write the tour file from
`changes.json` (the values back to `{NAME}`s, `guided-tour.md` §2) and the fixture from the setup steps
of the parts that made that data, through the same code paths (`tour.md` §Data); check them
(`--lint`, `--prepare` twice) and follow `guided-tour.md` §6 for the commit.
{{/if}}

## Stage 7 — Put dev back

This always runs: {{#if tour}}after Stage 6b, {{/if}}on an Abort at any gate, and before any stop. A cut-off
session is recovered by the next run (Stage 1, step 5).

1. Run the playbook's *Put dev back* part.
2. Undo the ledger, newest first, ticking each line:
   - **`.env`:** `cp $WS/env.bak .env && cmp -s .env $WS/env.bak && echo restored`, then restart
     what reads it.
   - **Real services** (`$REAL=real`): run the undo of each ☁️ ledger line, newest first.
     - Undo only what the run created. Never delete anything on a real service the run didn't make.
     - A step with no undo stays unticked in the ledger with what it changed.
   - **Services:** stop the ones the run started. A service the run re-wired goes back to how it
     was.
{{#if tour}}
   - **Tour:** one still open → stop its launcher (`tour.md` §Runner) and TaskStop its Monitor. Then
     `{{shared}}/tour/chrome.sh stop`. `$WS/tour/` and `$WS/accounts.json` go with `$WS`.
{{/if}}
   - **Throwaway accounts:** disable them (`project.md` §Dev stack, test accounts). Removing an
     account or test data is asked first.
   - **Data:** whatever the playbook's last part doesn't cover, with the undo the ledger names.
   - **Files:** `rm -r $SPEC`. Ask **Keep** / **Delete** for `$EV`. Delete `$WS` last: `env.bak`
     and `accounts.json` hold secrets.
3. **Verify.**
   - `git status --short` shows nothing from the run except the fixes and the untracked `ISSUE-<n>-*`
     files.
   - The dev stack's health check is green.
4. Anything not undone stays unticked in the ledger with its exact undo command, and the summary says
   so.

## Stage 8 — Summary and publish

```
## Playbook run — issue #<n> — <date>

**Verdict:** ✅ works as specified / ⚠️ works, with caveats: <one line> / ⛔ blocking bugs open: <#s>
**Scope:** <parts run> of <all> · <skipped live parts>
**Real services:** local (☁️ parts ⏭: <parts>) / real (<what was reached>, undone / left: <ledger items>)
**Judged:** {{#if tour}}guided tour (<k> ✓ · <m> ✗) / {{/if}}screenshots (<k> items) / — no 👤 step{{#if tour}} · **Tour of the changes:** <k> ✓ · <m> ✗ / — not taken{{/if}}

| Part | Result |
|---|---|
| 0 Setup | ✅ |
| 3 <title> | ❌→✅ fixed (1) · 🟡 1 |

**Findings:** N (fixed M, open K) · **Playbook corrections:** N applied
**Not exercised:** <short list, or none>
**Dev:** ✅ restored / ⚠️ left as is: <ledger items>
**Results:** `ISSUE-<n>-QA-RESULTS.md`
```

Then publish: `{{shared}}/host.md` §Find the PR.

- **Open {{PR}}** → follow `{{shared}}/pr-notes.md` with `$PR` and `<n>`. It checks the files for
  secrets and personal data and asks before posting. `$RES` goes with the handoff and the playbook.
- **No {{PR}}** → one line: `/{{prefix}}:open-pr` (or `/{{prefix}}:ship`) offers it once the {{PR}} exists.

**Next:** `/{{prefix}}:start-pre-merge-review`, then `/{{prefix}}:ship`. If bugs are still open, fix them
first (`/{{prefix}}:start-working-on-issue <n>` reads the handoff).

## Stage 9 — Brief report

Always last: after Stage 8, and after Stage 7 on an abort. Write
`{{reports}}/<YYYY-MM-DD>-issue-<n>-qa.md` (a story playbook: `<file stem>-qa`{{#if tour}}; demo mode: `<file stem>-demo`{{/if}}) following `{{shared}}/brief-report.md`: the verdict, what
works, the fixes, the open bugs and what wasn't exercised, whether dev is back, the next command. It
is a summary of `$RES`, never a replacement: `$RES` stays the file a later run resumes from. Then
print `Report: {{reports}}/<file>`.

## Results file

A fresh session must be able to resume from `$RES` alone. It holds facts with paths, not narrative.
Its sections are updated in place, and each later run appends a `## Session N (<date>)` section.

```markdown
# Issue #<n> — QA results

Playbook `<file>` · branch `<branch>` @ `<sha>` · run <date>{{#if tour}} · mode <qa | demo>{{/if}} · scope <parts> · real services <local | real> · judged by <tour | shots> · <committed / uncommitted fixes>

## Verdict
<one paragraph>

| Part | Result | Notes |
|---|---|---|

## Variables
- `<RECORD_ID>` = 705030 (<what kind of record>)

## Steps
### Part 3 — <title>
| Step | Mark | Evidence |
|---|---|---|
| 3.1 | ✅ | `<the literal output line>` |
| 3.2 | ❌ | `<evidence path>/3.2-light-360.png` · see finding 1 |

## 👤 To judge
Paths are relative to the repo root (`$REPO`), never absolute.

| Step | Look at | Files | Verdict |
|---|---|---|---|
| 3.3 | the drawer's spacing | `<evidence path>/3.3-light-1440.png`, `<evidence path>/3.3-dark-360.png` | ✅ looks right / ❌ <what the user said> |

## Findings
| # | Sev | Step | Seen | Root cause | Status |
|---|---|---|---|---|---|
| 1 | ⛔ | 3.2 | … | `<file>:123` | fixed in `abc1234` / open / won't fix: <why> |

## Fixes applied
| File | Change | Why | Test |
|---|---|---|---|

## Playbook corrections
- 3.4: <old> → <new> (applied)

## Not exercised
- 7.3: <why> · covered by <test file / later environment>

## Dev state ledger
- [x] `.env` FEATURE_X_ENABLED changed · undo: restore `env.bak`
- [ ] record 705030 changed by Part 3 · undo: <exact command or click>
- [ ] ☁️ (`real`): <what was created, by id> · undo: <exact command>

## Recipes
<selectors, SQL, env wiring and timings that worked and weren't obvious>
```

Never put in `$RES`:

- secrets, tokens, passwords, setup or invite links, an address that carries a token, `.env` values;
- an absolute path: it carries the home directory. Write paths relative to `$REPO`;
- a person's name, phone number or email. Refer to records by id. `pr-notes.md` checks again before
  anything leaves the machine.
