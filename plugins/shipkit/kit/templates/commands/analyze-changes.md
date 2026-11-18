---
description: 🔹 STAGED (pre-commit) — Read all staged changes once and write a shared digest for downstream review commands
argument-hint: none
---

## Task

Read every git-staged change **once** and write a compact digest that `/{{prefix}}:code-review`,
`/{{prefix}}:review-tests`, `/{{prefix}}:update-docs`, `/{{prefix}}:check-migrations` and
`/{{prefix}}:changelog` reuse instead of each re-running `git diff --cached` and re-reading every
file.

## Steps

### 1. Discover changes

Always run the full staged diff here (this command produces the digest):

```bash
git diff --cached --name-status
git diff --cached --stat
git diff --cached
git diff --cached --binary | git hash-object --stdin   # fingerprint
```

If nothing is staged, say so and stop.

### 2. Read every changed file

Read every staged file in full, applying the skip list in `{{shared}}/digest-discovery.md`.

### 3. Write the digest

Read `{{shared}}/routing-tables.md` once (area tags, doc mapping, sync pairs).
Write `{{tmp}}/change-analysis.md` (create `{{tmp}}/` if missing):

~~~markdown
# Staged analysis

**Fingerprint:** <hash-object output>
**Files changed:** N files (+X −Y lines)

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
- **Sync pairs triggered:** <list with whether the other side is also staged>
- **Docs to read before reviewing:** <deduplicated doc sections>
```

## Output

`📝 Digest written to {{tmp}}/change-analysis.md — N files analyzed.`

Don't print the digest; it's for the downstream commands.
