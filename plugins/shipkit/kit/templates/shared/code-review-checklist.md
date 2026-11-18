# Code review checklist

Apply every section that touches the changed areas, then the project's own checklist in
`review-rules.md` §Checklist. The docs mapped in `routing-tables.md` §Doc mapping are the spec: a
mismatch between code and doc is a finding either way (bug or stale doc).

## Severity

- 🔴 **Critical**: bug, crash, data loss, security or privacy hole, or a violation of a hard rule
  in `project.md` §Hard rules (and CLAUDE.md).
- 🟡 **Warning**: convention or sync-pair miss, weak error handling, a UI change not checked in
  every theme the project supports, dev/prod config drift.
- 🔵 **Info**: docs impact, simplification, naming.

## 1. Correctness

- Logic, edge cases, null / empty handling, off-by-one, timezone-aware datetimes, exact decimals
  (not floats) for money.
- Transactions: committed or rolled back, connections and sessions closed; no lazy loads after the
  session is gone; no partial writes on an error path.
- Concurrency and async: no blocking calls in async code, every coroutine / promise awaited or
  handled, clients and handles closed, no shared mutable state without a guard.
- Idempotency: a retried job, request or migration does not double-apply; duplicate triggers are
  no-ops where the design says so.
- Errors: caught at the right level, logged with context, never swallowed silently; user-facing
  messages don't leak internals.

## 2. Security and privacy

- Input validated at the boundary; no SQL / shell / template injection (parameterized queries,
  no string-built commands, escaping on by default).
- Authentication and authorization on every new route or action, refused server-side even when the
  UI hides it.
- No secrets in code, fixtures, logs or error messages; new settings that hold secrets come from the
  environment.
- Outbound requests to addresses a user can influence go through the project's guard, if it has one
  (`review-rules.md`), never follow redirects blindly.
- Personal data: collected only when needed, kept only as long as the project's rules say, never
  logged in full.

## 3. Project rules

`review-rules.md` §Checklist: the project's hard-rule checks (each one a 🔴 when broken) and its
conventions (🟡).

## 4. Config, schema, sync pairs

- New or changed settings go through the project's config layer with safe defaults, and reach the
  settings example and its docs (`routing-tables.md` §Sync pairs).
- Schema change: a new migration with a working rollback where the tool supports one, the data
  docs updated (`upgrade-steps.md` §Detect).
- Every other row of `routing-tables.md` §Sync pairs that the diff touches.

## 5. Build and runtime

- Instructions, error messages and docs use the project's way to run things (`project.md` §Run),
  never a tool the project doesn't install.
- Production config works on its own; dev-only bits live in the dev overlay.
- No secrets baked into images or bundles; ignore files still exclude env files, data and
  dependency folders.
- Version pins that must move together still do (`routing-tables.md` §Sync pairs).

## 6. Style

- Types where the language has them; the project's linter and formatter clean (`local-gate.md`).
- Reads like the surrounding code: naming, comment density, idioms, file size.
- Code and comments in the language of `project.md` §Language; user-facing copy in the product's.
- No dead code, debug prints or commented-out blocks.

## 7. Branch only

- Commit messages follow `commits.md` and match what the commits actually do.
- No fixup noise that should be squashed before merge (only flag it; never rewrite history).
