---
description: 🔹 STAGED (pre-commit) — Compare git-staged changes against the project's docs and CLAUDE.md and update stale documentation
argument-hint: none
---

## Task

Check whether ALL git-staged changes leave any documentation stale: the doc set in
`{{shared}}/project.md` §Docs, `README.md`, `CLAUDE.md` and `{{shared}}/*.md`. Update the
affected docs, after confirmation. BRANCH version: `/{{prefix}}:update-docs-branch`.

The docs are the spec, in the authority order `project.md` §Docs gives. A staged change that
contradicts a doc is either an intended design change (update the doc) or a bug (fix the
code). When the change contradicts a **locked decision** (the sources `project.md` §Docs names,
a CLAUDE.md hard rule), don't pick: flag it 🔴 and ask the user which side is wrong.

## Steps

1. **Discover changes:** `{{shared}}/digest-discovery.md` (STAGED). The digest's "Docs" and
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

Zero findings: `✅ No documentation updates needed — docs are in sync with staged changes.`

## Confirm, then apply

Ask: "Apply these documentation updates? (yes / no / pick)". Wait for the answer.

For each approved update:
- Read the whole doc first; keep its structure, voice and density.
- Don't remove content unless it's wrong. A replaced decision stays, marked superseded,
  pointing to its replacement.
- Keep names identical across docs (`project.md` §Docs lists the names that must match).
- Repo-relative paths, backticked symbols and settings; cross-link with relative links.
- After editing, check every link and `#anchor` you touched still resolves.
- CLAUDE.md stays minimal: add only what future sessions need on every prompt.

## Output

`✅ No documentation updates needed — X docs checked.` or
`📝 Applied N updates across M docs.` + one line per doc.
