# Guided tour

A short walk through what a change does, for a person to see it working on the dev stack. Used by
`/{{prefix}}:run-playbook` (its 👤 steps, and the tour of the changes before it puts dev back) and
`/{{prefix}}:pr-tour`. The caller gives: the branch or {{PR}}, what to show (acceptance criteria,
playbook steps) and what changed. Single agent, no sub-agents.

The person only looks and clicks. You do the setup, open the windows already signed in, and guide
them through a panel inside the browser: your status line, the current step (one action, one "✓ what
you should see"), a pulsing outline on the element the step talks about, the step list, and **✓ Looks
right** / **✗ Problem** buttons that you watch live. They can drag the panel by its header (or
collapse it to a pill) when it covers something; a double-click on the header puts it back in its
corner. The terminal gets a short copy.

The project's side of it is `tour.md`: its surfaces (where each app lives and how a window signs in),
its account kinds, how the launcher runs, and what needs a build first.

## 0. How it runs

| Piece | Runs | What |
|---|---|---|
| `tour/chrome.sh` | **host** (bash) | Starts a separate Chromium-family browser with its own empty profile (`{{tmp}}/tour-chrome/`, ignored by git) and the DevTools port on `127.0.0.1:9222`. `stop` quits only that browser |
| `tour/open.mjs` | where `tour.md` §Runner says (the host, or a container) | Connects to that browser over the DevTools port, opens one window per account, signs in with the surface recipe of `tour/surfaces.json`, injects the panel, watches the tour file, appends the answers to the log |
| `tour/tour-panel.js` | the pages | The panel |

What follows from it:

- **Addresses are the host's.** The pages load in the host's browser, so a tour never names a
  container-network address. Test scripts, which may run their own browser elsewhere, can.
  `tour.md` §Surfaces lists each surface's host address.
- **Once per machine:** the launcher needs Playwright where `tour.md` §Runner says; install it the
  way it says when it doesn't resolve.
- **Every window is a fresh browser context.** The tour browser's profile holds no account and no
  cookie; the windows sign in on their own.

## 1. Prepare (you, not them)

- **The code.** The branch the tour shows is checked out (the caller checks it). What needs a build
  or a restart before it shows the change: `tour.md` §Build.
- **The stack.** The health check of `project.md` §Dev stack, plus every service a window shows.
  Check each surface's sign-in page answers 200 before opening windows.
- **Accounts.** A window that signs in names a `login` of its surface; the password comes from the
  **accounts file**, `<ws>/accounts.json`: `{"<login>": "<password>"}`, `chmod 600`, under the
  ignored `{{tmp}}/`.
  - `/{{prefix}}:run-playbook` writes it in its Stage 3 with its throwaway accounts.
  - Otherwise make one per account kind the tour needs (`tour.md` §Accounts: how to create it, set
    its password from a script and disable it). Never print a password, a setup link or an invite
    link, and never pass one on a command line.
  - Sign-in failures may count toward an account's lock: never retry a failed sign-in in a loop.
    Fix the file or the account first.
- **Data.** Dev data first (read-only queries). Create only what is missing, through the app's own
  CLI or UI. Local stack only: nothing that reaches a real service, nothing that bills. Write each
  change where the caller keeps them (run-playbook: its ledger, before the change; pr-tour: its
  list) with its undo.
- **Windows.** The fewest that show the change: the role that acts (a desktop window), plus where
  the result shows (another role, a phone, a public page, the mail catcher), plus a role that must
  *not* see something when the change touches permissions. A check about 360 px or dark gets its own
  window (`mobile`, `dark`).

## 2. Write the tour file

**Start from what earlier sessions left; analyse only what they didn't cover.** In this order:

1. **The playbook's `## Tour` section** (`ISSUE-<n>-TEST-PLAYBOOK.md`, format in `test-playbook.md`
   §2 *Tour*): the windows and the steps, ready-made. Translate it as below, with no analysis of the
   diff; items 2 and 3 only fill it in. A `No tour: <why>` line is the answer: say it, nothing to
   analyse.
2. **The QA results** (`ISSUE-<n>-QA-RESULTS.md`): §Variables gives the `<NAME>`s their values
   (re-check each with its read-only lookup: the data may have changed since), §Recipes the selectors,
   queries and timings that worked, §Steps and §👤 To judge what a person already checked, §Findings
   what is still open.
3. **The handoff** (`ISSUE-<n>-HANDOFF.md`): the decisions taken and the verification still owed.
4. **Only when there is no `## Tour` section:** build the tour from the {{PR}} description, the PRD's
   Acceptance criteria and the changed files (`/{{prefix}}:pr-tour` §3), then offer once to append it to
   the playbook as its `## Tour` section, so the next tour reuses it.

These files are local and untracked, at the root of the checkout that wrote them. Not there (another
checkout, another machine) → read them from the {{PR}}'s note comments instead (`host.md` §PR comments,
the ones whose first line starts `<!-- {{prefix}}:pr-note `). Keep the text between the `<summary>`
line and `</details>`; a file posted in parts (`part N/M`) is its parts in order. Save them under
`<ws>/notes/` (read-only copies: never edit the {{PR}} from them).

**From the playbook's `## Tour` to the tour file:**

| `## Tour` | Tour file |
|---|---|
| a window row | an entry of `windows`: *Window* → `name`; *Opens* → `paths` (its `<NAME>`s filled in); *Options* → `mobile` / `dark` |
| *Account* `<surface> <role>` | `surface` and `login`: the caller's throwaway account of that kind (its password in the accounts file; made as in §1 when the caller has none) |
| *Account* `none` | no `login`; *Opens* is a whole address, or a `surface` gives the base |
| a step row | an entry of `steps`: *Window* → `window`, *Do* → `do`, *See* → `see`, *Outline* → `highlight`, *Page* → `path` |
| `Needs:` | the setup steps to run first, from those parts: local ones only (nothing that reaches a real service or bills), each written down with its undo before it runs |

**Steps already checked.** A step whose behaviour the QA results mark ✅ from a person (a tour ✓ or
*Looks right*), with no commit since the results' SHA (their header line) touching the files behind
it (`git diff --name-only <sha>..HEAD`), was already checked. When some were, ask once: **Only what
isn't checked yet (Recommended)** / **Everything**. A step tied to an open finding stays in, its
`see` naming the finding.

**Writing it.** `<ws>/tour/<name>.json` (`<ws>` is the caller's ignored workspace). Steps in the
tooling language; UI labels in backticks, exactly as the page shows them (`project.md` §Language).
Only what the change does: one step per behaviour, 8 steps at most (more: a second tour).

```json
{
    "title": "#118 · A member edits an item's title",
    "status": "Ready",
    "state": "ready",
    "accounts": "{{tmp}}/qa-118/accounts.json",
    "shots": "{{tmp}}/qa-118/evidence",
    "windows": [
        { "name": "Admin", "surface": "app", "login": "qa118-admin@example.test", "paths": ["/activity"] },
        { "name": "Member, phone", "surface": "app", "login": "qa118@example.test", "mobile": true, "paths": ["/inbox"] }
    ],
    "steps": [
        {
            "window": "Member, phone",
            "do": "Open the first item, change its title, tap `<the save label>`.",
            "see": "<what the page says after it>",
            "highlight": "<the save label>"
        },
        {
            "window": "Admin",
            "do": "Open the activity log.",
            "see": "the change, with the member's name",
            "path": "/activity"
        }
    ]
}
```

- **Top level.** `title`; `status` (your line at the top of the panel, free text); `state` (`ready`
  green, `working` amber and blinking, `done`); `current` (1-based: **changing** it moves every
  window to that step and clears its mark); `accounts` and `shots` (paths from the repo root: the
  accounts file, and the folder for the problem screenshots, by default next to the tour file).
- **windows[]** (read once, at the start): `name` (the tag the panel shows), `surface` (a key of
  `tour/surfaces.json`: gives the base address and the sign-in recipe), `login` (an account of that
  surface, signed in first; none → a public page), `paths` (tabs: relative to the base, or whole
  `http(s)` addresses), optional `base` (overrides the surface's), `mobile` (360 px, touch), `dark`.
- **steps[]**: `do` (one action) and `see` (what proves it works), one short line each. Optional:
  `window` (where it happens; the other windows say "do this one in …"), `highlight` (the visible
  text of the element to outline, or `css=<selector>`; nothing inside a frame), `path` (adds a "Go
  to" button: a path on the page's own site, or a whole address on another one).
- **No secrets in the file.** Passwords stay in the accounts file. A path that carries a token may go
  in `paths` or `path`, because the file is local and ignored; it never goes in the terminal copy,
  `ISSUE-<n>-QA-RESULTS.md`, a report or {{a_PR}}.

## 3. Open it and watch

```bash
{{shared}}/tour/chrome.sh                      # on the host; reuses the one already up
rm -f <ws>/tour/<name>.log
<tour.md §Runner: the launch command> --tour <ws>/tour/<name>.json
```

Run the last line with Bash `run_in_background`. One tour at a time: `tour.md` §Runner's stop
command ends a leftover one. Wait for the `ready` line:

```bash
for i in $(seq 1 90); do grep -q '"type":"\(ready\|error\)"' <ws>/tour/<name>.log 2>/dev/null && break; sleep 1; done; cat <ws>/tour/<name>.log
```

An `error` line, or `problem: … sign-in failed` / `problem: no browser` in the background task's
output: fix the cause (`chrome.sh` not started, a stale build, the account, the accounts file, the
surface recipe) and start again.

Then watch the person's answers with **Monitor** (`timeout_ms` 1800000, the maximum; re-arm it on
expiry while the background task still runs). `-n +1` replays what came before the Monitor started,
so a quick first click is never missed (that is why the old log is removed first):

```bash
tail -n +1 -F <ws>/tour/<name>.log | grep --line-buffered -E '"type":"(ok|problem|done|closed|error)"'
```

Every event is one JSON line: `step` is 1-based, `window`, `url`; a `problem` also has `text` and
`shot` (a screenshot of that page as the person saw it, without the panel; a path from the repo
root).

## 4. Print the short copy

Right after `ready`, in the terminal:

```
## Tour: #<n> · <title>   (the panel in the browser guides you)
1. [Member, phone] Open an item, change its title, tap `…`. ✓ <what the page says>
2. [Admin] Open the activity log. ✓ the change, with the member's name
Done: close the windows.
```

One line per step. No explanations, no setup steps, no addresses with a token.

## 5. React to the events

- **ok**: nothing to say; the panel moves on by itself. The caller may record it.
- **problem**: Read the `shot` (from the repo root) and the `text`. Edit the tour file at once:
  `"status": "Looking at step N…"`, `"state": "working"`. Trace it read-only to `file:line`, with
  the owning doc (`routing-tables.md` §Doc mapping), and tell the user in two lines what is wrong,
  then the screenshot's absolute path on a line of its own (`<repo root>/<shot>`, never relative).
  Then the caller's rule decides:
  - `/{{prefix}}:run-playbook` Stage 4: it is a finding, never fixed here. Set
    `"status": "Noted as finding <k>: <one line>"`, `"state": "ready"`.
  - `/{{prefix}}:pr-tour`, and run-playbook's tour of the changes: ask **Fix it here** / **Just note
    it**.

  A fix follows the hard rules (`project.md`, CLAUDE.md) and the owning doc, gets a test that fails
  first, and passes `local-gate.md` §Gate on the touched files. Never edit code a running background
  job depends on. A front-end fix may need a new build (`tour.md` §Build). Then set
  `"status": "Fixed: <one line>. Check step N again."`, `"state": "ready"` and `"current": N`: every
  window goes back to that step and clears its mark. No fix: `"status": "Noted: <one line>"`,
  `"state": "ready"`.
- **done**: one line in the terminal; set `"state": "done"`, `"status": "All checked"`.
- **closed**: stop the Monitor (TaskStop). Summarize in at most three lines: the steps that passed,
  the problems and what became of them, the data the tour created, and the `problem:` lines the
  launcher printed in the background task's output (JS errors, responses >= 400).
- **Stopping it yourself** (an abort, time): `tour.md` §Runner's stop command. The windows close, the
  log gets `{"type":"closed","why":"stopped"}` and the background task ends by itself; then stop the
  Monitor.

## 6. Afterwards

- `{{shared}}/tour/chrome.sh stop` when no other tour follows in this session.
- The tour files and the accounts file go with the caller's workspace. The tour browser's profile
  (`{{tmp}}/tour-chrome/`) stays: it holds nothing and starts faster next time.
- The accounts the tour signed in with are disabled by the caller (`tour.md` §Accounts). Removing
  one is asked first.

## Gotchas

- **The panel comes after the sign-in.** On a phone the panel is a bottom sheet; injected earlier it
  would cover the sign-in button.
- **Double-click guard.** The panel sends the step it showed with `ok`; the launcher drops an `ok`
  for a step that is no longer current. **After-done guard:** once done the panel hides ✓ / ✗ and the
  launcher ignores further `ok`.
- **Screenshots without the panel:** `__tourHide(true)`, shoot, `__tourHide(false)`.
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
- **Dragging:** by the header or the pill; 4 px separate a click from a drag, the click after a drag
  is swallowed, the position is clamped on screen and kept in `sessionStorage` (per tab), a
  double-click on the header (or ⇄) snaps it back to a corner.
- **The panel is read at launch:** a change to `tour-panel.js` needs a new run.
- **A half-written tour file** is ignored; the next change brings a whole one.
- **The DevTools port answers only a `Host` that is an IP address or `localhost`:** `open.mjs`
  resolves a name like `host.docker.internal` to its IPv4 address first.
- **One DevTools client at a time.** A second Playwright connected to the tour browser resets the
  windows' emulation (phone width, dark). Test with a separate browser instead.
- **A phone window** is 360 px emulated inside a window of about 420 px (Chrome's narrowest).
- **From a container,** `host.docker.internal:9222` reaches the host's `127.0.0.1:9222` (Docker
  Desktop; on Linux add `--add-host=host.docker.internal:host-gateway`); the port is never published
  beyond the machine.
- The project's own: `tour.md` §Gotchas.
