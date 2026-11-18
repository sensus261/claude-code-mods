---
description: 🔹 STAGED (pre-commit) — Code review of all git-staged files for correctness, hard rules, conventions and doc sync
argument-hint: none
---

## Task

Review ALL git-staged files for correctness, the project's hard rules, conventions and
completeness. Report findings by severity. Don't apply fixes unless the user asks.
BRANCH version: `/{{prefix}}:code-review-branch`.

## Steps

1. **Discover changes:** `{{shared}}/digest-discovery.md` (STAGED).
2. **Load context:** read `{{shared}}/routing-tables.md` and `{{shared}}/project.md` once, then the
   doc sections mapped to the changed areas (the digest's "Docs to read" list). Only those.
3. **Review:** apply `{{shared}}/code-review-checklist.md` and `{{shared}}/review-rules.md`
   §Checklist. Open callers and surrounding code where the diff alone can't prove correctness.

## Output

```
## <file-path>

### 🔴 Critical (bug / security / data loss / hard rule)
- Line N: <problem>. <fix>.

### 🟡 Warning (convention / sync pair / error handling)
- Line N: <problem>. <fix>.

### 🔵 Info (docs impact / simplification)
- <note>.
```

End with:

| Severity | Count |
|----------|-------|
| 🔴 Critical | N |
| 🟡 Warning | N |
| 🔵 Info | N |

Write "None found." for an empty severity.
