# shipkit kit changelog

## 0.3.0 — 2026-11-21

- **Guided tours run without an agent.** A tour is committed with its change,
  `<shared>/tours/<ID>/tour.json` (format v2: `vars` by name, `touches` per step, `verifiedOn` /
  `verifiedAt`, `pr`), and `tour/tour.mjs <ID | PR number>` runs it with no Claude Code: the stack's
  preflight, the fixture, the tour browser, the windows signed in, each ✓ / ✗, a report it offers to
  post on the PR / MR, and `verifiedOn` once every step passed. `--check` lists the steps whose files
  changed since the tour was checked (exit 2), `--lint` checks every tour file (for CI: shape, ≤ 8
  steps, surfaces, `{VAR}` used = declared, no tokens), `--prepare` runs the fixture alone,
  `--markdown` prints the PR block, `--agent` leaves each ✗ to Claude Code.
- **Tour data comes from a fixture, not prose.** One `prepare` command per project (new profile file
  `tour/runner.json`, with `launch`, `env` and the `preflight` steps; `tour.md` gains `## Data`): it
  finds what an earlier run left unused or makes it through the app's own code, writes the throwaway
  accounts' passwords to the accounts file, and prints the vars.
- **`/pr-tour` writes, repairs and runs committed tours:** `--check` first and only the stale steps
  re-read; `--from-report` picks up a teammate's agent-free run; a tour built live is offered for
  commit with its fixture, and its steps go in the PR description as a `<!-- <prefix>:guided-tour -->`
  block. run-playbook's tour of the changes can become one too.
- **Story demos without an agent:** `tour/present.mjs <story> [parts]` runs a story playbook's part
  scripts after its `setup.mjs` (Part 0 as a script) with `demo.json` (title, sign-in, start pages,
  reset), and prints the *Demo ready* block. Same workspace as run-playbook's demo mode.
- **Demos show the viewer where to look:** a pointer glides to every element the script clicks or
  types into (one hook on Playwright's Frame actions, `DEMO_POINTER=0` turns it off), and a step's
  new `look` puts an amber ring on its result until the next step; each look is reported as a `look`
  event (`DEMO_LOOKSHOTS=1` keeps a screenshot), and `present.mjs --rehearse` prints a ring that finds
  nothing.
- **Forge** writes `tour/runner.json` from the scan, adds the `--lint` gate row, and in committed mode
  offers `npm run tour` / `npm run demo` aliases in the root `package.json`.

## 0.2.0 — 2026-11-20

- **Guided tours get a control window.** `open.mjs --tour` opens the tour panel in its own window at
  the right edge of the screen; the app windows fill the space to its left and show only a pulsing
  ring on the element the current step names. The step's window comes forward when the step moves,
  "Go to" opens the path in the step's window, Enter / → / ← / N drive it from the keyboard, and
  closing the control window ends the tour. `--panel overlay` keeps the floating in-page panel for
  one small screen. Light or dark like the system; its words can be translated (`i18n` in the tour file).
- **New tour scripts:** `tour-control.mjs` (DevTools connection, control window, window layout, ring)
  and `surfaces.mjs` (sign-in recipes and the accounts file), shared by `open.mjs` and the new
  `demo.mjs`. The launcher and the demo close their own windows on exit and SIGTERM.
- **Demo mode for `run-playbook`** (tour pack): `/<prefix>:run-playbook <story> <N> demo` builds a
  story playbook's data up to Part N in the guided browser and keeps it, to show the product. Part
  scripts (`<shared>/playbooks/<name>/part-<N>.mjs`) run on `tour/demo.mjs`: two clicks per step
  (▶ Do it, then ✓ / ✗), notes, a "No stops" mode, error screenshots, `vars.json` between parts.
  No fixes, no publish; a *Demo ready* block and a `-demo` brief report.
- **Story playbooks** (qa pack): committed, issue-free playbooks of one realistic flow, in
  `<shared>/playbooks/`; `run-playbook <name>` resolves them, runs them on any branch and measures
  freshness from their last commit.
