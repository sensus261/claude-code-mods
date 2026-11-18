---
description: 🔹 BRANCH (pre-merge) — Compare branch changes vs origin against the project's docs and CLAUDE.md and update stale documentation
argument-hint: "[base-branch]"
---

## Task

Check whether ALL changes on the current branch vs `origin/{base-branch}` (default
`origin/{{base}}`) leave any documentation stale: the doc set in `{{shared}}/project.md` §Docs,
`README.md`, `CLAUDE.md` and `{{shared}}/*.md`. Update the affected docs, after confirmation.
STAGED version: `/{{prefix}}:update-docs`.

The docs are the spec, in the authority order `project.md` §Docs gives. A change that
contradicts a doc is either an intended design change (update the doc) or a bug (fix the code).
When it contradicts a **locked decision** (the sources `project.md` §Docs names, a CLAUDE.md
hard rule), don't pick: flag it 🔴 and ask the user which side is wrong.

## Steps

1. **Discover changes:** `{{shared}}/digest-discovery.md` (BRANCH). The digest's "Docs" and
   "Sync pairs" fields are the starting point; open a source file only when the digest can't
   judge staleness.
2. **Map to docs:** `{{shared}}/routing-tables.md` §Doc mapping + §Sync pairs. Also check:
   new modules or areas missing from routing-tables; new commands or scripts missing from
   CLAUDE.md; status lines the project keeps (`project.md` §Docs).
3. **Read each mapped doc** and compare with what the code now does. Skip cosmetic changes.

## Findings format

```
## <doc path> §<section>

### 🔴 MUST UPDATE — behavior mismatch (or: locked decision contradicted → ask)
- Doc says: <claim>
- Code does: <behavior>
- Update: <change>

### 🟡 WORTH MENTIONING — new behavior, setting, state or convention
- New: <thing>
- Add to doc: <suggested content>

### 🔵 MINOR — stale reference (path, name, count, link anchor)
- <detail>
```

Zero findings: `✅ No documentation updates needed — docs are in sync with this branch.`

## Confirm, then apply

Ask: "Apply these documentation updates? (yes / no / pick)". Wait for the answer.

Apply with the rules in `/{{prefix}}:update-docs` §Confirm, then apply (read the whole doc, keep
voice and structure, superseded not deleted, identical names across docs, links checked,
CLAUDE.md minimal).

## Output

`✅ No documentation updates needed — X docs checked.` or
`📝 Applied N updates across M docs.` + one line per doc.
