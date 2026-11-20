# shipkit kit changelog

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
