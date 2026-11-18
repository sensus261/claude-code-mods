# Digest-first discovery

Review commands read one shared digest instead of each re-diffing and re-reading every file.

| Variant | Scope | Digest | Written by |
|---|---|---|---|
| STAGED | `git diff --cached` | `{{tmp}}/change-analysis.md` | `/{{prefix}}:analyze-changes` |
| BRANCH | `origin/$BASE...HEAD` (`BASE` = first arg, default `{{base}}`) | `{{tmp}}/branch-analysis.md` | `/{{prefix}}:analyze-changes-branch` |

## 1. Use the digest when it's fresh

Each digest's header records a fingerprint. Recompute it and compare:

```bash
# STAGED
git diff --cached --binary | git hash-object --stdin
# BRANCH
git fetch origin "$BASE" -q
echo "$(git rev-parse "origin/$BASE") $(git rev-parse HEAD)"
```

Match: work from the digest's per-file summaries and hunks. Open a source file only when the
digest can't answer the question (surrounding context, callers, tests).
Missing or mismatched: use the fallback. A stale digest is never used.

## 2. Fallback

```bash
# STAGED
git diff --cached --name-status
git diff --cached --stat
git diff --cached

# BRANCH
git fetch origin "$BASE" -q
git diff --name-status "origin/$BASE"...HEAD
git log --oneline "origin/$BASE"...HEAD
git diff --stat "origin/$BASE"...HEAD
git diff "origin/$BASE"...HEAD
```

Then read the changed files, applying the skip list. With more than ~15 changed files, run
the matching analyze command first so the following commands reuse its digest.

## Skip list

- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `poetry.lock`,
  `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `go.sum`, …) and vendored, generated or minified
  files: stat only; note version bumps.
- Data dumps and large fixtures: stat only.
- `.claude/` files: skip unless the task is about docs or commands.
- The project's own additions and its **never skip** list: `routing-tables.md` §Skip list.
  Migrations, schema files, settings examples and container/compose files are behavior: never
  skipped.

## Scope notes

- BRANCH covers committed work only. If `git status --short` shows uncommitted changes,
  say so in the output; they are not reviewed.
- STAGED covers the index only. Mention unstaged changes to the same files if present.
