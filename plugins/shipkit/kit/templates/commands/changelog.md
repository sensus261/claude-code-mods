---
description: 🔹 STAGED (pre-commit) — Generate a structured changelog and commit message from all git-staged changes
argument-hint: none
---

## Task

Generate a structured changelog from ALL git-staged changes, grouped by area, plus a commit
message. BRANCH version: `/{{prefix}}:changelog-branch`.

## Steps

### 1. Discover changes

Follow `{{shared}}/digest-discovery.md` (STAGED). Read `{{shared}}/routing-tables.md` once for
the area tags.

### 2. Categorize by area

Tag each meaningful change with its area. A change spanning areas gets an entry under each.

### 3. Write the changelog

**Title:** the dominant theme, under 80 chars.

**Entries:**

```
- **[AREA]** <Past-tense verb> `<symbol or path>` — <what it does, why it matters, key detail>
```

- Past tense: Added, Fixed, Expanded, Updated, Removed, Refactored.
- Specific: name the function, class, state, setting or file. No vague "improved X".
- Contextual: the why or the effect, not only the what.
- One `---` block per area, most impactful first.
- Changes that matter for the production upgrade (anything `{{shared}}/upgrade-steps.md`
  §Detect lists: settings, schema, migrations, versioned config, services) get their own bullet.

```markdown
## <Title>

---

- **[AREA]** ...
- **[AREA]** ...
---

---

- **[OTHER-AREA]** ...
---
```

## Output

Write `{{tmp}}/changelog.md`, ending with `**Total: X changes across Y areas**`.

Then write `{{tmp}}/commit-message.md`: `type(scope): summary` per `{{shared}}/commits.md`, e.g.
`feat(api): bulk approve on the review queue && fix(worker): cap retries per job`.
Add a short body only when the why isn't obvious. Long enough to describe the change, no
longer.
