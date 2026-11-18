---
description: 🔷 FULL AUDIT — Compare the whole codebase against every doc (the project's docs, README, CLAUDE.md, the toolkit's tables) and fill the gaps
argument-hint: "[doc-scope]"
---

## Task

Audit every doc against the **entire codebase**, not recent changes. For each doc: is every
factual claim still true, and is every significant code area documented? Change-driven
`/{{prefix}}:update-docs[-branch]` miss drift that built up over time; this catches it.

`[doc-scope]` narrows the audit: a doc name or a comma list (`/{{prefix}}:update-docs-all
README,CLAUDE`). No argument: every doc in `{{shared}}/routing-tables.md` §Doc audit map.

## 1. Inventory

```bash
ls {{shared}}/ .claude/commands/
```

plus the doc set of `{{shared}}/project.md` §Docs. Flag immediately:
- Broken links or `#anchors` between README, CLAUDE.md and the docs.
- Paths or files named in CLAUDE.md or routing-tables that don't exist.
- Source folders with no row in routing-tables §Area tags or §Doc mapping.

## 2. Reverse map

`routing-tables.md` §Doc audit map: for each doc, what to verify it against. It is the starting
point; read each doc for its own claims. Always first: `CLAUDE.md` (every path, command,
setting and test it names exists; hard rules still match the conventions; it stays minimal),
then the toolkit's own tables (`{{shared}}/*.md`: still match the tree, tests and docs).

## 3. Audit

Batch the docs (CLAUDE.md, README and the toolkit's tables first; then the rest in groups of
two or three related docs). With the user's go-ahead, run one agent per doc in a batch
(`Explore` for "does X still exist" sweeps, general-purpose for behavior checks) and wait for a
batch before starting the next; otherwise go batch by batch yourself.

Per doc: extract every claim (paths, symbols, settings and defaults, states, routes, commands,
counts, cross-links); verify each against the code; then list significant code the doc
doesn't mention (new modules, settings, states, actions, failure modes).

The docs are the spec: where code and doc disagree, say which looks intended. Anything
contradicting a locked decision (`project.md` §Docs, CLAUDE.md hard rules) is reported for the
user to decide, never silently "fixed" in the doc.

## 4. Findings format

```
## <doc>

### 🔴 MUST UPDATE — doc is wrong (or code violates a locked decision → user decides)
- Doc says: <claim>
- Code does: <behavior>
- Update: <change>

### 🟠 UNDOCUMENTED — code exists, doc is silent
- Missing: <feature / setting / state / action>
- Location: <repo-relative path(s)>
- Suggested section: <where>

### 🟡 WORTH MENTIONING — new pattern or convention
- New: <thing>
- Add to doc: <suggested content>

### 🔵 MINOR — stale reference
- <old path, renamed symbol, wrong count, dead anchor>
```

Zero findings: `✅ <doc> — in sync with codebase.`

Summary:
```
📊 Audit complete: N docs checked
🔴 X MUST UPDATE · 🟠 Y UNDOCUMENTED · 🟡 Z WORTH MENTIONING · 🔵 W MINOR
```

## 5. Confirm, then apply

Ask: "Apply these documentation updates? (yes / no / pick docs or findings)". Wait.

Apply with the rules in `/{{prefix}}:update-docs` §Confirm, then apply (read the whole doc, keep
voice and structure, superseded not deleted, identical names across docs, links checked,
CLAUDE.md minimal).

## Output

`✅ Documentation audit complete — all N docs in sync.` or
`📝 Documentation audit complete — applied X updates across Y docs.` + one line per doc.

Time-box it: 🔴 and 🟠 matter most. Don't catalogue every undocumented helper.
