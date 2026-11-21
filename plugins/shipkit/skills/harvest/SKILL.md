---
name: harvest
description: Bring improvements made to a project's generated /<prefix>:* commands back into the shipkit templates, so every other project gets them on its next /shipkit:forge. It diffs the project's toolkit against what the templates would generate, separates generic improvements from project-specific ones, generalizes the generic ones into template edits (placeholders, host recipes, pack guards), moves stray project specifics into the project's profile, and bumps the kit version. Use when the user runs /shipkit:harvest, or asks to upstream, back-port, harvest or sync command improvements from a project into shipkit or its templates.
argument-hint: "[project-path] [--kit <path to the shipkit kit checkout>]"
---

# /shipkit:harvest — project improvements → templates

The commands get better where they are used: a gate that missed something, a clearer question, a
new recipe. Harvest carries those changes from one project back into the kit, so the next
`/shipkit:forge` elsewhere picks them up.

Rules: single agent unless the user's rules allow sub-agents and the user says yes. Never commit
without the user's approval (their commit rule: branch, files, message). Never push. Never edit the
installed plugin (`~/.claude/plugins/…`): templates are edited in a **checkout** of the kit, and
reach the plugin when that checkout is pushed and the marketplace updated.

## Stage 0 — The two sides

1. **The kit checkout** (`$KIT`): `--kit <path>`; else the current repo when it holds
   `plugins/shipkit/kit/manifest.json` (then `$KIT` is that `kit/` folder); else ask for the path of
   the shipkit repo checkout (the one with `.claude-plugin/marketplace.json` listing `shipkit`).
   Check it's a git work tree, and note uncommitted changes there (they'll mix with the harvest).
2. **The project** (`$P`): the argument, else ask. It needs a `.claude/*/shipkit.json`; a legacy
   toolkit with none → run `/shipkit:forge` on it first (adoption), or harvest it as legacy: every
   legacy file is compared with what the templates would render (status `adopt`).
3. The renderer: `$KIT/render.mjs` (the checkout's own, so new template edits are what you compare
   against).

## Stage 1 — What the project changed

```bash
node "$KIT/render.mjs" plan "$P" --kit "$KIT"
```

The edited files are the rows `kept`, `merged`, `conflict` and `adopt`; `unmanaged` rows are commands
the project has that the kit doesn't. For each edited file, the project's own edits are:

- with a base (`row.base` exists): `git diff --no-index "<row.base>" "$P/<dest>"`: what the user
  changed since the last forge;
- without one (`adopt`, or a lost base): `git diff --no-index "<row.next>" "$P/<dest>"`: everything
  that differs from today's render (it also shows the template's own changes since: tell them apart
  by reading the template).

Skip whitespace-only hunks. Read the profile too (`$P/<shared>/project.md`, `routing-tables.md`, …):
a hunk that restates a profile fact belongs to the profile, not to a template.

## Stage 2 — Classify every hunk

| Class | Test | Goes to |
|---|---|---|
| **Generic** | It would help any project: a clearer step, a missed gate, a safer default, a better report shape, a fixed script bug | the template, as is (after reverse substitution, Stage 4) |
| **Generic idea, project words** | The mechanism is general but it names this project's paths, tools, services or domain | the template, generalized: the specifics become a reference to a profile section (`local-gate.md` §Verify, `project.md` §Dev stack) or a neutral example |
| **Project fact in a command** | A path, command, rule or table that only holds here, written into a generated file | the project's profile (the matching section); the command hunk is then dropped, so the file returns to template + profile |
| **Project-only** | Only makes sense here (a domain step, a one-off) | stays in the project (the file stays `kept`), or, when it's a whole command, `--keep` it as the project's own |
| **New command** | An `unmanaged` command that would serve other projects | a new template (+ manifest entry, pack); its project facts go to the profile |

When a generic change needs a new profile fact (a template now cites `local-gate.md` §Smoke), the
kit's `profile/GUIDE.md` gets the new section, and forge's rescan will ask other projects for it.

Show one table, most valuable first:

```
| # | File | Change (one line) | Class | Proposal |
|---|------|-------------------|-------|----------|
```

Then **AskUserQuestion** (multi-select, the top changes as options; the rest by number under Other):
*"Which of these should go into the templates?"*. A second question when there are project facts:
*"Move these project facts into the profile?"*.

## Stage 3 — Read the conventions before editing

Read, in `$KIT`: `manifest.json`, the template you're about to edit, both host recipe files
(`templates/shared/host-github.md`, `host-gitlab.md`) and `profile/GUIDE.md`. The rules:

- **Placeholders:** `{{prefix}}`, `{{shared}}` (the shared folder), `{{tmp}}` (`.claude/.tmp`),
  `{{reports}}`, `{{base}}` (the base branch), `{{PR}}` (PR / MR), `{{a_PR}}` (a PR / an MR), `{{PR_LONG}}`, `{{CI}}`
  (checks / pipeline), `{{host_cli}}`. Nothing else in `{{…}}`: an unknown name fails the render.
- **Conditionals:** `{{#if qa}}…{{/if}}`, `{{#if tour}}`, `{{#if github}}` / `{{#if gitlab}}`,
  `{{#if hidden}}` / `{{#if committed}}`, `{{#unless …}}`, `{{else}}`. A tag alone on its line takes
  the line with it. Text about a pack is always guarded by that pack's flag.
- **Host calls** go through a named recipe in `host.md` (`host.md` §Find the PR), never a raw
  `gh` / `glab` line in a command. A new host operation → a new recipe with the same name in **both**
  host files (look the `glab` form up with `glab <cmd> --help`; don't guess flags).
- **Project facts** are never in a template: they are profile references (`{{shared}}/local-gate.md`
  §Gate in a command; `local-gate.md` §Gate inside a shared file).
- **Scripts** under `templates/shared/tour/` are copied raw (no placeholders): make them read what
  they need from arguments, environment, `surfaces.json`, `runner.json` (the project's commands:
  preflight, fixture, launch) or `shipkit.json` (prefix, base, host). A project's runner that hard-codes
  its stack (`sail`, a tenant, a seeded password) is generalized into a `runner.json` key, never copied.
  Host calls in a script go through `tour/stack.mjs`, for both hosts.
- **Project-owned folders** are never harvested as templates: `<shared>/playbooks/` and
  `<shared>/tours/` (a project's committed tours and their fixtures). What they teach (a field the tour
  format lacks, a check the runner should make) becomes a template edit.
- Keep the voice: short imperative sentences, the stage / gate structure, the `AskUserQuestion`
  option style, the "never commit / never push" rules.

## Stage 4 — Edit the templates

For each chosen hunk, edit `$KIT/templates/<src>` (the row's `src`):

1. Reverse the substitution: the project's prefix → `{{prefix}}`, its shared folder → `{{shared}}`,
   `.claude/.tmp` → `{{tmp}}`, its base branch (where it means the base) → `{{base}}`, PR / MR words
   → `{{PR}}`, a raw host command → its recipe.
2. Generalize project words (class 2) as the table proposed.
3. Guard pack-specific text.

A new command: `templates/commands/<name>.md` + a `manifest.json` entry
(`{"src": "commands/<name>.md", "dest": ".claude/commands/{{prefix}}:<name>.md", "pack": "<pack>"}`),
and mention it in the README's command table.

Project facts (Stage 2's second question): edit the project's profile files in place, then remove
the same facts from the project's generated file (so it matches the new render).

## Stage 5 — Check

```bash
node --test "$KIT/render.test.mjs"              # the renderer's tests
node "$KIT/render.mjs" plan "$P" --kit "$KIT"   # the harvested files now render (close to) what the project has
```

Render every pack and host combination once to catch an unbalanced tag or an unknown placeholder:

```bash
node --input-type=module -e '
import { renderAll } from "'"$KIT"'/render.mjs";
for (const host of ["github", "gitlab"]) for (const packs of [["core"], ["core","qa"], ["core","qa","tour"]])
  renderAll({ prefix: "x", base: "main", host, mode: "committed", packs }, "'"$KIT"'");
console.log("all combinations render");'
```

The harvested hunks now show as `same` in the project (or `merged` with only its project-only edits
left). Anything still `conflict` → look again.

## Stage 6 — Version

Bump `version` in `$KIT/manifest.json` and in the plugin's `.claude-plugin/plugin.json` together:
patch for wording and fixes, minor for a new command, recipe, profile section or pack behaviour.
Note the change in the kit's `CHANGELOG.md` (create it if missing): the version, the date, one line
per harvested change, and its source project by name only if the user agrees (it may be private).

## Stage 7 — Summary

```
## shipkit harvest — <project> → kit <old> → <new>

Harvested: <n> changes into <files> · New: <commands / recipes / profile sections>
Moved to the project's profile: <n> facts · Left project-only: <n>
Kit checkout: <path>, uncommitted
Next: commit the kit (asked now), push it, `claude plugin marketplace update <marketplace>`, then `/shipkit:forge` in each project to pick it up (starting with <project>, so its lock records the new base).
```

Offer the kit commit (the user's commit rule: branch, files, message such as
`feat(shipkit): <the main change> (kit <new>)`). Never push.
