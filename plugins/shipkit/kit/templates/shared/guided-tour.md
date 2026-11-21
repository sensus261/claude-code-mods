# Guided tour

A short walk through what a change does, for a person to see it working on the dev stack. Used by
`/{{prefix}}:pr-tour` and `/{{prefix}}:run-playbook` (its 👤 steps, and the tour of the changes before
it puts dev back). The caller gives: the branch or {{PR}}, what to show (acceptance criteria, playbook
steps) and what changed. Single agent, no sub-agents.

**A tour is committed with its change:** `{{shared}}/tours/<ID>/tour.json` (the windows and steps, the
names of the data it needs, the files each step depends on, the commit it was last checked on), and
its data comes from a **fixture**, the project's code that finds or makes it (`tour.md` §Data).
Anyone runs it later **without an agent**, at no token cost: `node {{shared}}/tour/tour.mjs <ID>` (or
the {{PR}} number) checks the stack, makes the data and the accounts, opens the windows signed in and
writes a report (§8). Your part is what needs judgment: write a tour, run it live while you can still
fix what the person finds, and repair one that went stale.{{#if hidden}} In this checkout the toolkit
is hidden from git, so a tour stays on this machine: the {{PR}} gets only its steps, as text (§6).{{/if}}

The person only looks and clicks. They are guided by a **control window**: a narrow browser window at
the right edge of the screen with the tour panel (the status line, the current step and the window it
happens in, one action and one "what you should see", **✓ Looks right** / **✗ Problem** buttons, the
step list). The app windows fill the space to its left and stay clean: only a pulsing ring around the
element the current step names. When a step moves to another window, that window comes forward. In
the control window, Enter or → confirms, ← goes back and N opens the ✗ form.

`--panel overlay` puts the floating panel on every app page instead (draggable by its header,
collapsible to a pill, a double-click on the header puts it back in its corner): for one small screen
where a control window beside the app doesn't fit.

The project's side of it is `tour.md` (its surfaces, account kinds, runner, data and build), with two
files the scripts read: `tour/surfaces.json` (how a window signs in) and `tour/runner.json` (how the
scripts run, the stack's preflight, the fixture command).

## 0. How it runs

| Piece | Runs | What |
|---|---|---|
| `tour/tour.mjs` | **host** (it starts the browser) | The agent-free runner of a committed tour: `tour/runner.json`'s preflight, the fixture (`prepare`), `chrome.sh`, then `open.mjs --tour` on a live copy; it prints each ✓ / ✗ and writes a report. `--check`, `--lint`, `--prepare`, `--markdown`, `--list`; `--agent` leaves every ✗ to you |
| `tour/present.mjs` | **host** | The agent-free runner of a story playbook's demo (`/{{prefix}}:run-playbook`'s demo mode as a script: `test-playbook.md` §Story playbooks) |
| `tour/chrome.sh` | **host** (bash) | Starts a separate Chromium-family browser with its own empty profile (`{{tmp}}/tour-chrome/`, ignored by git) and the DevTools port on `127.0.0.1:9222`. `stop` quits only that browser |
| `tour/open.mjs` | as `runner.json` `launch` says (the host, or a container) | Connects to that browser over the DevTools port, opens the control window and one window per account, signs in with the surface recipe of `tour/surfaces.json`, puts the ring on the app pages, watches the tour file, appends the answers to the log |
| `tour/demo.mjs` | as `open.mjs` | The guided demo engine: the part scripts of a story playbook run on it, in the same control window |
| `tour/tour-control.mjs`, `tour/surfaces.mjs`, `tour/stack.mjs`, `tour/tour-file.mjs` | imported | The DevTools connection, control window, layout and ring; the sign-in recipes and the accounts file; the runners' preflight, prompts and host calls; the tour file's checks |
| `tour/tour-panel.js` | the pages | The panel: the control window (`docked`), the ring on the app pages (`ring`), or the floating panel (`--panel overlay`) |

What follows from it:

- **Addresses are the host's.** The pages load in the host's browser, so a tour never names a
  container-network address. Test scripts, which may run their own browser elsewhere, can.
  `tour.md` §Surfaces lists each surface's host address.
- **Once per machine:** the scripts need Playwright where `tour.md` §Runner says; install it the way
  it says when it doesn't resolve.
- **Every window is a fresh browser context.** The tour browser's profile holds no account and no
  cookie; the windows sign in on their own.

## 1. The data and the accounts: a fixture, not steps for you

- **The stack.** The runner checks it from `tour/runner.json` `preflight` (`tour.md` §Runner): the
  services up, the front end served, the migrations, the workers on this branch's code. What a change
  needs on top (a build, a restart): `tour.md` §Build.
- **Dev data first.** What the seed already has is named in the steps as it is.
- **Everything else comes from the tour's fixture** (`tour.md` §Data: where fixtures live and the one
  command that runs one, `runner.json` `prepare`). A fixture:
  - **looks first for what an earlier run made and the tour has not used up**, so running it twice
    gives the same values; once a run used the data (a message sent, an order approved), the next
    run makes a fresh set;
  - otherwise **makes it through the app's own code** (its services, CLI or API, the way the seeds
    do), never raw SQL that skips the app's rules;
  - makes the **throwaway accounts** the windows sign in with (`tour.md` §Accounts: fake identifiers,
    `@example.test`), writes their passwords to the accounts file the runner names (`{accounts}`,
    `chmod 600`), and never prints one;
  - prints the vars by name as its last line, `{"vars": {"ITEM": 42, "ITEM_CODE": "IT-0042"}}`;
  - runs on the local stack only: nothing that reaches a real service, nothing that bills.
- **Check it:** `node {{shared}}/tour/tour.mjs <ID> --prepare` twice (the same values both times),
  then the project's fixture test (`tour.md` §Data: it runs every fixture on a fresh seed, twice).
  A project with no `prepare` command yet gets one with its first fixture: the cheapest entry point
  that goes through the app's own code (a framework command, or `{dir}/prepare.mjs` calling the app's
  CLI or API). Write it in `runner.json` `prepare` and `tour.md` §Data in the same change.
- **Windows.** The fewest that show the change: the role that acts (a desktop window), plus where the
  result shows (another role, a phone, a public page, the mail catcher), plus a role that must *not*
  see something when the change touches permissions. A check about 360 px or dark gets its own window
  (`mobile`, `dark`).
- **Files to upload** are not made by the agent-free run yet. Make them yourself (small and valid: a
  one-page PDF is enough) in `~/Downloads/{{prefix}}-tour/<ID>/` (never under a folder whose name
  starts with a dot: the macOS file picker hides it), write the full path in the step's `do` with
  "⌘⇧G in the dialog takes a pasted path", and say in the {{PR}} block how to make them.

## 2. The tour file

**Start from what earlier sessions left; analyse only what they didn't cover.** In this order:

1. **A committed tour** of the change (`{{shared}}/tours/<ID>/`): repair it (§7), don't rewrite it.
2. **The playbook's `## Tour` section** (`ISSUE-<n>-TEST-PLAYBOOK.md`, format in `test-playbook.md`
   §2 *Tour*): the windows and the steps, ready-made. Translate it as below, with no analysis of the
   diff; items 3 and 4 only fill it in. A `No tour: <why>` line is the answer: say it, nothing to
   analyse.
3. **The QA results** (`ISSUE-<n>-QA-RESULTS.md`): §Variables tells the fixture what to find or make,
   §Recipes the selectors, queries and timings that worked, §Steps and §👤 To judge what a person
   already checked, §Findings what is still open.
4. **The handoff** (`ISSUE-<n>-HANDOFF.md`): the decisions taken and the verification still owed.
5. **Only when there is none of these:** build the tour from the {{PR}} description, the PRD's
   Acceptance criteria and the changed files (`/{{prefix}}:pr-tour` §3), then offer once to append it
   to the playbook as its `## Tour` section, so the next session reuses it.

These files are local and untracked, at the root of the checkout that wrote them. Not there (another
checkout, another machine) → read them from the {{PR}}'s note comments instead (`host.md` §PR comments,
the ones whose first line starts `<!-- {{prefix}}:pr-note `). Keep the text between the `<summary>`
line and `</details>`; a file posted in parts (`part N/M`) is its parts in order. Save them under
`<ws>/notes/` (read-only copies: never edit the {{PR}} from them).

**From the playbook's `## Tour` to the tour file:**

| `## Tour` | Tour file |
|---|---|
| a window row | an entry of `windows`: *Window* → `name`; *Opens* → `paths` (its `<NAME>`s as `{NAME}`); *Options* → `mobile` / `dark` |
| *Account* `<surface> <role>` | `surface` and `login`: a throwaway account of that kind the fixture makes (`tour-<ID>-<role>@example.test`, or a `{VAR}` it returns) |
| *Account* `none` | no `login`; *Opens* is a whole address, or a `surface` gives the base |
| a step row | an entry of `steps`: *Window* → `window`, *Do* → `do`, *See* → `see`, *Outline* → `highlight`, *Page* → `path` |
| a `<NAME>` | a `{NAME}` in `vars`, which the fixture returns |
| `Needs:` | what the fixture makes: the data those parts' setup made, through the same code paths |

**Steps already checked.** A step whose behaviour the QA results mark ✅ from a person (a tour ✓ or
*Looks right*), with no commit since the results' SHA (their header line) touching the files behind
it (`git diff --name-only <sha>..HEAD`), was already checked. When some were, ask once: **Only what
isn't checked yet (Recommended)** / **Everything**. A step tied to an open finding stays in, its
`see` naming the finding.

**Writing it.** `{{shared}}/tours/<ID>/tour.json`, `<ID>` the tour's name: `issue-<n>` for an issue's
change, else a short slug of what it shows (letters, digits, `-`; never only digits: a number is a
{{PR}}). A change with two things to show gets two tours. Steps in the tooling language; UI labels in
backticks, exactly as the page shows them (`project.md` §Language). Only what the change does: one
step per behaviour, 8 steps at most.

```json
{
    "version": 2,
    "id": "issue-118",
    "title": "#118 · A member edits an item's title",
    "pr": 120,
    "verifiedOn": "abc1234",
    "verifiedAt": "2026-11-21",
    "vars": {
        "ITEM": { "what": "an item the member owns, with a title" }
    },
    "touches": ["src/items/**"],
    "windows": [
        { "name": "Admin", "surface": "app", "login": "tour-issue-118-admin@example.test", "paths": ["/activity"] },
        { "name": "Member, phone", "surface": "app", "login": "tour-issue-118-member@example.test", "mobile": true, "paths": ["/items/{ITEM}"] }
    ],
    "steps": [
        {
            "window": "Member, phone",
            "do": "Change the title, tap `<the save label>`.",
            "see": "<what the page says after it>",
            "highlight": "<the save label>",
            "touches": ["web/src/pages/items/edit.tsx"]
        },
        {
            "window": "Admin",
            "do": "Open the activity log.",
            "see": "the change, with the member's name",
            "path": "/activity",
            "touches": ["src/activity/**"]
        }
    ]
}
```

- **Top level.** `version` (2), `id` (its folder), `title`; `pr` (the {{PR}} that brought it);
  `verifiedOn` / `verifiedAt` (the commit, `git rev-parse --short HEAD`, and the date of the last run
  where every step got ✓: leave them out until then); optional `i18n` (the control window's own
  words in the product's language, `project.md` §Language: the keys of `words` in `tour/tour-panel.js`).
- **vars**: every `{NAME}` the windows and steps use, each with `what` (the row in words, with its
  seeded code when there is one). The fixture returns exactly these names.
- **touches**: the files each step depends on (globs; `**` crosses folders): the page, its handler,
  the service behind the action. Tour-wide `touches` count for every step. This is what makes a
  re-sync cheap: `--check` lists the steps whose files changed since `verifiedOn`.
- **windows[]**: `name` (the tag the control window shows on each step), `surface` (a key of
  `tour/surfaces.json`: gives the base address and the sign-in recipe), `login` (an account of that
  surface, signed in first; none → a public page), `paths` (tabs: relative to the base, or whole
  `http(s)` addresses), optional `base` (overrides the surface's), `mobile` (360 px, touch), `dark`.
- **steps[]**: `do` (one action) and `see` (what proves it works), one short line each. Optional:
  `window` (where it happens: the control window names it, brings that window forward and rings the
  element only there), `highlight` (the visible text of the element to ring, or `css=<selector>`;
  nothing inside a frame), `path` (a "Go to" button that opens it in the step's window), `touches`.
- **No secrets.** Passwords stay in the accounts file the fixture writes. A link with a token is never
  written down: the fixture returns what the window needs to reach it, or the step says where to find
  it (the mail catcher). `--lint` refuses what looks like a token.
- **Check it:** `node {{shared}}/tour/tour.mjs <ID> --lint` (the shape, ≤ 8 steps, windows, surfaces,
  `{NAME}` used = declared, no tokens).

## 3. Run it and watch

```bash
node {{shared}}/tour/tour.mjs <ID> --agent      # Bash run_in_background
```

It does what used to be your checklist: the preflight, the fixture, the `{NAME}` values, the tour
browser, then `open.mjs --tour {{tmp}}/tour/<ID>.json` (the **live copy**: the committed file with
the values filled in, plus `status`, `state`, `accounts` and `shots`), and the short copy of the steps
in its output. `--agent` leaves every ✗ to you (§5) and asks nothing at the end. Wait for the `ready`
line:

```bash
for i in $(seq 1 120); do grep -q '"type":"\(ready\|error\)"' {{tmp}}/tour/<ID>.log 2>/dev/null && break; sleep 1; done; cat {{tmp}}/tour/<ID>.log
```

An `error` line, a `✗` line from the runner or a `problem: … sign-in failed` / `problem: no browser`
in its output: fix the cause (the stack, a stale build, the fixture, the accounts file, the surface
recipe) and start again. One tour at a time: `tour.md` §Runner's stop command ends a leftover one.

**No screen** (a remote session, SSH, a container with no display: Chromium cannot open a window): say
so in one line, give the short copy (§4) with the full addresses and accounts instead, and let the
person follow it in their own browser and answer in the terminal ("N: <what>").

Then watch the person's answers with **Monitor** (`timeout_ms` 1800000, the maximum; re-arm it on
expiry while the background task still runs). `-n +1` replays what came before the Monitor started,
so a quick first click is never missed (the runner removes the old log first):

```bash
tail -n +1 -F {{tmp}}/tour/<ID>.log | grep --line-buffered -E '"type":"(ok|problem|done|closed|error)"'
```

Every event is one JSON line: `step` is 1-based, `window`, `url`; a `problem` also has `text` and
`shot` (a screenshot of the step's window as the person saw it, without the ring; a path from the
repo root). `closed` has `why`: `control` (the person closed the control window: that ends the
tour), `windows` (every app window closed), `browser` or `stopped`.

**A quick look with no committed tour** (`/{{prefix}}:run-playbook`'s tour of a part, a check while you
work): write a tour file by hand under the caller's ignored workspace (`<ws>/tour/<name>.json`, the
same windows and steps with the values already in, plus `"status"`, `"state": "ready"`, `"accounts"`
and `"shots"`), then `{{shared}}/tour/chrome.sh`, `rm -f <ws>/tour/<name>.log` and
`<tour.md §Runner: the launch command> --tour <ws>/tour/<name>.json` in the background. Watch
`<ws>/tour/<name>.log` the same way, and print the short copy yourself.

## 4. The short copy

The runner prints it, one line per step:

```
## Tour: #118 · A member edits an item's title   (the control window on the right guides you)
1. [Member, phone] Change the title, tap `…`. ✓ <what the page says>
2. [Admin] Open the activity log. ✓ the change, with the member's name
Done: close the windows.
```

Don't repeat it; add one line at most when the person needs to know something the steps don't say.
No explanations, no setup steps, no addresses with a token.

## 5. React to the events

- **ok**: nothing to say; the control window moves on by itself. The caller may record it.
- **problem**: Read the `shot` (from the repo root) and the `text`. Edit the live copy at once:
  `"status": "Looking at step N…"`, `"state": "working"`. Trace it read-only to `file:line`, with
  the owning doc (`routing-tables.md` §Doc mapping), and tell the user in two lines what is wrong,
  then the screenshot's absolute path on a line of its own (`<repo root>/<shot>`, never relative).
  Then the caller's rule decides:
  - `/{{prefix}}:run-playbook` Stage 4: it is a finding, never fixed here. Set
    `"status": "Noted as finding <k>: <one line>"`, `"state": "ready"`, `"current": N+1` (after the last step: `"state": "done"` instead).
  - `/{{prefix}}:pr-tour`, and run-playbook's tour of the changes: ask **Fix it here** / **Just note
    it**.

  A fix follows the hard rules (`project.md`, CLAUDE.md) and the owning doc, gets a test that fails
  first, and passes `local-gate.md` §Gate on the touched files. Never edit code a running background
  job depends on. A front-end fix may need a new build (`tour.md` §Build). Then set
  `"status": "Fixed: <one line>. Check step N again."`, `"state": "ready"` and `"current": N`: the
  control window goes back to that step, clears its mark and brings its window forward. No fix:
  `"status": "Noted: <one line>"`, `"state": "ready"`, `"current": N+1` (after the last step: `"state": "done"` instead). A step whose text was wrong
  (not the app): correct it in the live copy and in `{{shared}}/tours/<ID>/tour.json`.
- **done**: one line in the terminal; set `"state": "done"`, `"status": "All checked"`.
- **closed**: stop the Monitor (TaskStop). The runner wrote `{{tmp}}/tour/<ID>-report.md`. Summarize
  in at most three lines: the steps that passed, the problems and what became of them, the data the
  fixture made (local only, it stays), and the `problem:` lines the runner printed (JS errors,
  responses >= 400). Then §6.
- **Stopping it yourself** (an abort, time): TaskStop the runner's background task (SIGTERM: the
  windows close and the log gets `{"type":"closed","why":"stopped"}`), never `kill -9`; then stop the
  Monitor.

## 6. Commit it with the change (ask)

Offer it only when the last answer of every step was ✓ (an unresolved ✗: say why it is not offered),
and only for a tour of a change that will ship ({{a_PR}}, or a branch that will get one).{{#if hidden}} One
**AskUserQuestion**: *"Keep this tour on this machine and put its steps in {{PR}} #N's description, so
reviewers can follow it by hand?"* (**Keep it (Recommended)**, **No**). The toolkit is hidden from git,
so the tour file is never committed; steps 1, 2, 4 and 5 below still apply, and step 3 commits only
the fixture, when it is project code the team wants (asked).{{else}} One **AskUserQuestion**: *"Commit
this tour with {{PR}} #N, so anyone can run it again with `node {{shared}}/tour/tour.mjs <ID>`, without
an agent?"* (**Commit it (Recommended)**, **No**). When the branch is not the user's own, say whose
branch it changes.{{/if}}

On yes:

1. **The file:** `verifiedOn` (`git rev-parse --short HEAD`), `verifiedAt` (today) and `"pr": N` in
   `{{shared}}/tours/<ID>/tour.json`.
2. **Check:** `tour.mjs <ID> --lint`, `--prepare` twice (same values), the project's fixture test and
   `local-gate.md` §Gate on the fixture (`tour.md` §Data). The tour and its `vars` descriptions like
   any {{PR}} text: `pr-notes.md` §2 (secrets, personal data). Hits: fix them, never commit them.
3. **Commit** the tour, the fixture and any fix on the branch, under the user's commit rule
   (`commits.md`: ask first, naming the branch, the files and the message), then push only when asked.
4. **The {{PR}} description:** the block between `<!-- {{prefix}}:guided-tour -->` and
   `<!-- /{{prefix}}:guided-tour -->` is `tour.mjs <ID> --markdown` (the run command and the steps for
   people who go by hand, no JSON). Read the body (`host.md` §Edit the PR description); the block
   there → replace it; absent → insert it before the final attribution line (`🤖 Generated with …`),
   or append it. Write the whole body back with the same recipe.
5. One line to the user with the {{PR}} link. Then delete `{{tmp}}/tour/<ID>*` (the live copy, the
   log, the report, the screenshots, the accounts file) and the upload files in
   `~/Downloads/{{prefix}}-tour/<ID>/` (also on **No**, unless the user wants them kept).

## 7. Re-sync a tour that went stale

`node {{shared}}/tour/tour.mjs <ID> --check` prints each step as `fresh` or `stale`, with the files that
changed since `verifiedOn` (exit code 2 when something is stale). Read only the stale steps and only
those files' diffs (`git diff <verifiedOn> -- <file>`), fix the steps (and the fixture, when the
project's fixture test did not already make someone fix it), run the tour (§3), and on all ✓ commit it
with a new `verifiedOn` (§6). A `verifiedOn` that is not in the clone (a rebase): every step counts as
stale.

A teammate's run without an agent leaves `{{tmp}}/tour/<ID>-report.md` on their machine (and, when
they chose to, the same report as a {{PR}} comment): each ✗ with the person's words and a local
screenshot path. `/{{prefix}}:pr-tour <ID> --from-report` starts from that report: trace each ✗, then
fix the app or the step.

## 8. Without an agent

What a teammate types, on the host, from the repo root (`tour.md` §Runner may list `npm run` aliases):

```bash
node {{shared}}/tour/tour.mjs <ID>              # a tour, on the current branch
node {{shared}}/tour/tour.mjs <{{PR}} number>       # the tour {{a_PR}} adds or changes: offers to check its branch out
node {{shared}}/tour/tour.mjs --list            # the tours on this branch
node {{shared}}/tour/tour.mjs <ID> --check      # no windows: the steps whose files changed since it was checked
node {{shared}}/tour/present.mjs <story> [parts] # a story playbook's demo (test-playbook.md §Story playbooks)
```

The runner asks before anything that changes the checkout or the database (a checkout, a migration,
starting a dev server), notes each ✗ and moves the panel on, writes the report, and at the end offers
to post it on the open {{PR}} (`[y/N]`) and, when every step got ✓, to set `verifiedOn` in the tour
file (the person commits it). It stops the tour browser it started. CI can run
`tour.mjs --lint` with Node alone, and the project's fixture test (`tour.md` §Data).

## 9. Afterwards

- `{{shared}}/tour/chrome.sh stop` when no other tour follows in this session.
- The live copies, logs, reports and accounts files stay under `{{tmp}}/tour/` (ignored) until §6
  cleans them; the tour browser's profile (`{{tmp}}/tour-chrome/`) stays: it holds nothing and starts
  faster next time.
- The fixture's throwaway accounts stay, disabled or not as `tour.md` §Accounts says: the next run
  re-uses them. Removing one is asked first.

## Gotchas

- **The control window** is a browser context of its own on a fake address (`http://tour.control/`,
  answered by the launcher, never the network), with no colour emulation: it follows the system's
  light or dark. Chrome keeps a minimum window width (about 500 px): the launcher reads the width it
  really got and leaves the rest of the screen to the app windows.
- **Window layout:** desktop windows fill the space left of the control window, a little staggered;
  phone windows keep 420 px at its right edge, beside the desktops when at least 1024 px are left for
  them, else on top (the step's window comes forward). Extra tabs and popups of a window go to the
  same place. Headless, nothing is placed.
- **Keys in the control window:** Enter or → is ✓, ← goes back, N opens the ✗ form (Esc closes it,
  ⌘/Ctrl Enter sends it). A focused button keeps its own Enter. After ✓ or ←, the keyboard comes back
  to the control window.
- **The ring (or the overlay panel) comes after the sign-in.** On a phone the overlay panel is a
  bottom sheet; injected earlier it would cover the sign-in button.
- **Double-click guard.** The panel sends the step it showed with `ok`; the launcher drops an `ok`
  for a step that is no longer current. **After-done guard:** once done the panel hides ✓ / ✗ and the
  launcher ignores further `ok`.
- **Screenshots without the ring or panel:** `__tourHide(true)`, shoot, `__tourHide(false)`.
- **Shadow root on `<html>`, outside `<body>`:** the app's styles don't leak in, the panel is not in
  `document.body.innerText`, and a re-render can't remove it (it re-appends itself).
- **Its own palette,** light or dark like the page (`data-theme` on `<html>`, else the system's).
- **A constructed stylesheet** (`adoptedStyleSheets`): a strict `style-src` without
  `'unsafe-inline'` doesn't block it.
- **Top-level pages only.** Playwright's init scripts also run in frames; the panel skips any frame.
  `highlight` can't reach inside a frame either.
- **SPA navigation keeps the panel;** a full page load re-injects it, and it fetches its state with
  `__tourGet()` (it waits up to 5 s for the binding).
- **Typing survives re-renders:** a status update mid-typing keeps the textarea's draft.
- **Dragging** (overlay only): by the header or the pill; 4 px separate a click from a drag, the click after a drag
  is swallowed, the position is clamped on screen and kept in `sessionStorage` (per tab), a
  double-click on the header (or ⇄) snaps it back to a corner.
- **The panel is read at launch:** a change to `tour-panel.js` (or `tour-control.mjs`) needs a new run.
- **Connected, not launched.** The windows live in the host's browser, not in a child process: the
  launcher and `demo.mjs` close their own windows on exit and on SIGTERM (`pkill -f <script>`), never
  `kill -9` them, or the windows stay open.
- **A half-written tour file** is ignored; the next change brings a whole one.
- **The fixture's `{accounts}`** is a path from the repo root, so a fixture that runs in a container
  writes it where the host reads it as long as the container works from the mounted repo root.
- **Smoke-testing the runners** without a window: `TOUR_HEADLESS=1 TOUR_CDP_PORT=<spare port>
  {{shared}}/tour/chrome.sh`, then `TOUR_HEADLESS=1 TOUR_CDP=http://127.0.0.1:<port> node
  {{shared}}/tour/tour.mjs <ID> < /dev/null` (it closes the tour once ready; with `TOUR_CDP` set it
  leaves the browser to you), then `chrome.sh stop` with the same port.
- **The DevTools port answers only a `Host` that is an IP address or `localhost`:** `open.mjs`
  resolves a name like `host.docker.internal` to its IPv4 address first.
- **One DevTools client at a time.** A second Playwright connected to the tour browser resets the
  windows' emulation (phone width, dark). Test with a separate browser instead.
- **A phone window** is 360 px emulated inside a window of about 420 px (Chrome's narrowest).
- **From a container,** `host.docker.internal:9222` reaches the host's `127.0.0.1:9222` (Docker
  Desktop; on Linux add `--add-host=host.docker.internal:host-gateway`); the port is never published
  beyond the machine.
- The project's own: `tour.md` §Gotchas.
