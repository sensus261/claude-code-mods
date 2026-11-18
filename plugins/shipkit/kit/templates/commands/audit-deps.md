---
description: 🛡️ SECURITY — Scan the project's dependencies for known vulnerabilities, group per dependency, then fix the ones you choose
argument-hint: "[min-severity: critical|high|moderate|low] [ecosystem]"
---

## Task

Scan every dependency manifest, group findings per dependency, let the user choose what to
fix, apply the fix the way the project runs things, and verify the advisory is gone.

Guardrails:
- Never commit, push or open {{a_PR}} here. Verify and stop; hand off to `/{{prefix}}:open-pr`.
- Every audit and install runs the way `{{shared}}/project.md` §Run says (on the host, or in the
  project's container), never another way.
- Degrade gracefully: a missing host permission or an audit tool failure is one warning and a
  partial scan, never a hard stop.

Arguments (both optional, any order): `min-severity` drops anything below it; `ecosystem`
limits the run. None → everything.

## 1. Manifests

`{{shared}}/local-gate.md` §Dependencies: per ecosystem, the manifest, the lock, where it's
installed, the audit command and the upgrade commands. A manifest in the tree that the table
doesn't list → audit it with the usual tool for its ecosystem (`npm audit --json`,
`pnpm audit --json`, `yarn npm audit --json`, `pip-audit`, `composer audit --format=json`,
`bundle-audit check`, `cargo audit --json`, `govulncheck ./...`) and say the table needs a row.

## 2. Gather (two sources)

**A. The host's dependency alerts**, if available (`{{shared}}/host.md` §Dependency alerts). Per
alert: package, ecosystem, manifest, vulnerable range, first patched version, severity,
advisory ids, summary, link. Not available → one warning, continue with B.

**B. Local audits:** every audit command of `local-gate.md` §Dependencies (a non-zero exit
often just means "found some": read the output).

## 3. Group and present

Merge A and B, dedupe by `(ecosystem, package)` (one row, all advisories listed). Compute the
jump current → first patched: `patch` / `minor` / **`major`**. Also note whether the package
is a direct dependency (in the manifest) or transitive. Apply `min-severity`; sort by severity.

```
| # | Package | Ecosystem | Direct? | Current | Vulnerable | Fix | Jump | Severity | Advisories | Source |
|---|---------|-----------|---------|---------|------------|-----|------|----------|------------|--------|
```

Then one line of counts (`1 critical · 2 high · …`). Nothing found → say so and stop.

## 4. Choose

Ask which to fix: `#` list (`1,4`), `all`, `all-critical`, `all-high`, or `none`. Wait.

## 5. Apply (per chosen dependency)

1. Target = first patched version (or the nearest safe one).
2. **Major jump** → STOP: *"⚠️ major bump, breaking-change risk — check the changelog"*, and
   confirm this dependency separately. Patch/minor apply without asking.
3. Pins that must move together (`local-gate.md` §Dependencies, `routing-tables.md` §Sync
   pairs): ask before bumping, then bump both sides.
4. Apply with the ecosystem's upgrade command from `local-gate.md` §Dependencies (direct: raise
   the bound in the manifest, then relock; transitive: the targeted relock/update).

## 6. Verify

- The lock/install exited 0.
- Rebuild what the project bakes dependencies into (`local-gate.md` §Dependencies says when),
  re-run the audit and the gate (`local-gate.md` §Gate, with the relevant tests).
- Flag anything that didn't resolve or introduced a new advisory.

## 7. Output

```
| Package | Change | Status |
|---------|--------|--------|
| <pkg>   | <old> → <new> | ✅ fixed / ⚠️ needs review / ❌ failed |
```

List skipped major bumps and unresolved items. Then:

> Changes are in the working tree only. Run `/{{prefix}}:open-pr` to ship (production needs the
> steps `upgrade-steps.md` lists for dependency changes).
