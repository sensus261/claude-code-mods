---
description: 🔹 BRANCH (pre-merge) — Generate a structured changelog from all changes on the current branch vs origin
argument-hint: "[base-branch]"
---

## Task

Generate a structured changelog from ALL changes on the current branch vs
`origin/{base-branch}` (default `origin/{{base}}`), grouped by area. Used for {{PR}}
descriptions. STAGED version: `/{{prefix}}:changelog`.

## Steps

### 1. Discover changes

Follow `{{shared}}/digest-discovery.md` (BRANCH; the fallback also runs
`git log --oneline "origin/$BASE"...HEAD` for the commit subjects). Read
`{{shared}}/routing-tables.md` once for the area tags.

### 2. Categorize by area

Tag each meaningful change with its area. A change spanning areas gets an entry under each.

### 3. Write the changelog

**Title:** the dominant theme of the branch ({{PR}} title or the biggest feature), under 80
chars, in `type(scope): summary` form so `/{{prefix}}:open-pr` can reuse it.

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

Write `{{tmp}}/changelog-branch.md`, ending with `**Total: X changes across Y areas**`.
Revisions update the same file.
