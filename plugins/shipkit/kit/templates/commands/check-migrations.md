---
description: 🔹 STAGED (pre-commit) — Detect staged changes that need a migration or a production upgrade step (schema, settings, image, services) and check they're complete
argument-hint: none
---

## Task

Find staged changes that need a migration or an extra step when production upgrades
(`{{shared}}/upgrade-steps.md` §Production upgrade). Check each is complete, offer to fix what's
missing, and write upgrade notes for the {{PR}} / release. BRANCH version:
`/{{prefix}}:check-migrations-branch`.

## 1. Discover changes

`{{shared}}/digest-discovery.md` (STAGED). The digest's file list and summaries are usually
enough; open a file only to classify it.

## 2. Detect

Match every changed file against `upgrade-steps.md` §Detect (columns: Changed · Means · Check ·
Production step). Always also:

| Changed | Means | Check | Production step |
|---|---|---|---|
| An existing, already-applied migration modified | 🔴 rewrites history production already ran | make a new migration instead | — |
| A new required setting without a default | config | the settings example and its docs list it | set it in production before the upgrade |
| A dependency manifest or lockfile | image / install | pins that move together still do (`routing-tables.md` §Sync pairs) | rebuild / reinstall |

## 3. Verify

Run what applies from `upgrade-steps.md` §Verify (one migration head, models ⇄ migrations, the
settings example ⇄ the settings, …), the way `{{shared}}/project.md` §Run says.

## 4. Report and offer fixes

If nothing matched: `✅ No migration or upgrade steps needed.` and stop.

Otherwise show:

```
## Migration / upgrade check

| File | Kind | Status | Production step |
|---|---|---|---|
| <models file> | schema | ❌ no migration staged | <step> |
| <migration file> | migration | ✅ one head, rollback ok | <step> |
```

For each ❌, ask with **AskUserQuestion** whether to fix it (generate the migration the way
`upgrade-steps.md` §Generate says, then review and tidy the generated file; add the missing
settings-example line). Never edit an existing applied migration; never run migrations against
the dev or production database without asking.

Then ask: *"Write upgrade notes for the {{PR}} / release?"* Options: **Yes**, **Skip**.
**Yes** → write `{{tmp}}/upgrade-notes.md`: the ordered production steps (always starting with
the backup `upgrade-steps.md` §Production upgrade names when a migration is included), each with
its command and why.

## Output

- `📝 Upgrade notes written to {{tmp}}/upgrade-notes.md — <steps>`
- `⚠️ N migration issue(s) left unfixed — <list>`
- `✅ No migration or upgrade steps needed.`
