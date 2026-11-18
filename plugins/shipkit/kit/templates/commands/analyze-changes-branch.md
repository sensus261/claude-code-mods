---
description: 🔹 BRANCH (pre-merge) — Read all branch changes vs origin once and write a shared digest for downstream review commands
argument-hint: "[base-branch]"
---

## Task

Read every change on the current branch vs `origin/{base-branch}` (default `origin/{{base}}`)
**once** and write a compact digest that `/{{prefix}}:code-review-branch`,
`/{{prefix}}:review-tests-branch`, `/{{prefix}}:update-docs-branch`,
`/{{prefix}}:check-migrations-branch` and `/{{prefix}}:changelog-branch` reuse instead of each
re-diffing and re-reading every file.

## Steps

### 1. Discover changes

Always run the full branch diff here (this command produces the digest):

```bash
BASE="${1:-{{base}}}"
git fetch origin "$BASE" -q
git diff --name-status "origin/$BASE"...HEAD
git log --oneline "origin/$BASE"...HEAD
git diff --stat "origin/$BASE"...HEAD
git diff "origin/$BASE"...HEAD
echo "$(git rev-parse "origin/$BASE") $(git rev-parse HEAD)"   # fingerprint
git status --short                                             # uncommitted leftovers
```

If there are no commits ahead of `origin/$BASE`, say so and stop.

### 2. Read every changed file

Read every changed file in full, applying the skip list in `{{shared}}/digest-discovery.md`.

### 3. Write the digest

Read `{{shared}}/routing-tables.md` once (area tags, doc mapping, sync pairs).
Write `{{tmp}}/branch-analysis.md` (create `{{tmp}}/` if missing):

~~~markdown
# Branch analysis: `<branch>` vs `origin/<base>`

**Fingerprint:** <origin sha> <head sha>
**Commits:** N
**Files changed:** N files (+X −Y lines)
**Uncommitted (not analyzed):** <git status --short summary, or "none">

## <file-path>

- **Change type:** added / modified / deleted / renamed
- **Lines:** +X −Y
- **Area:** [TAG] (routing-tables §Area tags)
- **Docs:** <doc sections from §Doc mapping, or "none">
- **Sync pairs:** <rows of §Sync pairs this file triggers, or "none">
- **Summary:** <what changed: new functions/classes, changed logic, new settings, new
  states/transitions, new routes/actions, schema, tests added/removed>
- **Relevant diff:**
  ```diff
  <the changed hunks with a few lines of context, not the whole file>
  ```
~~~

End with:

```markdown
## Overview

- **Total files changed:** N
- **By area:** [TAG] x, [TAG] x, …
- **Existing tests touched:** <list or "none">
- **New test files:** <list or "none">
- **Sync pairs triggered:** <list with whether the other side also changed>
- **Docs to read before reviewing:** <deduplicated doc sections>
```

## Output

`📝 Digest written to {{tmp}}/branch-analysis.md — N files analyzed against origin/<base>.`

Don't print the digest; it's for the downstream commands.
