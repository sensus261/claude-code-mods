---
description: 🔹 STAGED (pre-commit) — Review git-staged changes for missing tests, test gaps and convention violations
argument-hint: none
---

## Task

Decide whether the tests cover ALL git-staged changes: missing tests, tests needing
adaptation, convention violations. Don't write tests unless the user asks.
BRANCH version: `/{{prefix}}:review-tests-branch`.

## Steps

1. **Discover changes:** `{{shared}}/digest-discovery.md` (STAGED).
2. **Load context:** `{{shared}}/routing-tables.md` once, then the mapped doc sections (they
   define the behavior the tests must pin down).
3. **Find existing tests:** `{{shared}}/test-review-core.md` §Find existing tests.
4. **Read** every changed production file and the tests that cover it.
5. **Review:** checklists A–D of `test-review-core.md`; skip items marked *(branch)*.

## Output

```
## Test Coverage Review — Staged Files

### 🔴 MUST FIX — Missing tests / broken coverage
- **<changed-file>:** <what changed>. **Missing:** <test needed>. **Why critical:** <what breaks silently>.

### 🟡 SHOULD FIX — Test gaps / weak assertions
- **<test-file>:** <gap>. **Fix:** <test to add>.

### 🔵 NICE TO HAVE — Edge cases
- **<test-file>:** <scenario>. **Consider:** <test>.

### ✅ Adequate Coverage
- **<changed-file>:** covered by `<test-file>`.

## Test Review Summary

| Finding | Count |
|---------|-------|
| 🔴 Missing tests | N |
| 🟡 Test gaps | N |
| 🔵 Edge cases | N |
| ✅ Adequate | N |

### Verdict
✅ **Ready** / ⚠️ **Add tests** — N gaps before committing / ❌ **Blocked** — N critical missing tests
```

"None found." for an empty severity.
