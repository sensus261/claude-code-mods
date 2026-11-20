# shipkit

A per-project workflow toolkit for Claude Code, forged from shared templates. It covers the whole path
from an idea to a merged PR or MR:

```
plan-to-prd → start-working-on-issue → start-pre-commit-review → open-pr → pr-checks → start-pre-merge-review → ship
                       ↘ test playbook → run-playbook (QA on the dev stack) → pr-tour (guided tour in a real browser)
```

Every project gets its **own** commands, under its own prefix (`/hunter:ship`, `/acme:ship`), backed by
a **profile** that `/shipkit:forge` builds by scanning the repo: the area tags, the docs that specify
each area, the things that must change together, the lint / type / test gate, the hard rules, the
production upgrade steps, the dev stack. The commands are generic; the profile makes them yours.

| Command | Does |
|---|---|
| `/shipkit:forge` | Install the toolkit in a project, or re-sync it: rescan the code, refresh the profile, upgrade the commands to the current templates, keep your hand edits (3-way merge) |
| `/shipkit:harvest` | Bring improvements you made to a project's commands back into the templates, so every project gets them on its next forge |

## Install

```
/plugin install shipkit --marketplace sensus261/claude-code-mods
```

Then, in any project: `/shipkit:forge`. It scans, asks four questions (prefix, committed or hidden,
packs, and the base branch or host when it can't tell), shows the hard rules it found for you to
confirm, writes the profile and the commands, and checks the result.

Needs Node ≥ 18 (the renderer) and `gh` or `glab` signed in (the PR / MR commands).

## Choices

- **Committed or hidden.** Committed: normal files the team shares; the commands' scratch output
  (`.claude/.tmp/`, `reports/`, the review reports, `ISSUE-*` notes) goes in `.gitignore`. Hidden:
  everything is listed in `.git/info/exclude`, so nothing in the repo changes and the toolkit stays on
  your machine.
- **Packs.** `core` (24 commands), `qa` (+ `run-playbook`, the test-playbook format and story
  playbooks), `tour` (+ `pr-tour` and guided tours: app windows open already signed in, beside a
  control window at the right edge of the screen with the steps and ✓ / ✗ buttons the agent watches
  live, and a ring on the element each step names; plus `run-playbook … demo`, which builds a story
  playbook's data up to a part in that guided browser and keeps it, to show the app; for web apps).
- **Git host.** GitHub (`gh`) or GitLab, self-hosted included (`glab`). Every host call goes through
  named recipes in one file, `host.md`, so the commands read the same on both.

## The commands a project gets

| Group | Commands |
|---|---|
| Plan and build | `plan-to-prd`, `start-working-on-issue` |
| Staged (pre-commit) | `start-pre-commit-review` → `analyze-changes`, `code-review`, `review-tests`, `update-docs`, `check-migrations`, `changelog` |
| Branch (pre-merge) | `start-pre-merge-review` → `analyze-changes-branch`, `code-review-branch`, `review-tests-branch`, `update-docs-branch`, `check-migrations-branch`, `changelog-branch` |
| PR / MR | `open-pr`, `pr-checks`, `pr-review-feedback`, `ship` |
| Upkeep | `update-docs-all`, `audit-deps`, `tag-release`, `clear` |
| QA *(qa)* | `run-playbook` (an issue's playbook, or a story playbook from `<shared>/playbooks/`) |
| Tour *(tour)* | `pr-tour`, and `run-playbook … demo` (a guided demo of a story playbook) |

They never commit, push or post without asking, and a commit rule in your CLAUDE.md always wins.

## What lives where

```
plugins/shipkit/
  skills/forge/SKILL.md      the install / rescan flow       skills/forge/scan.md   what the scan reads
  skills/harvest/SKILL.md    project edits → templates
  kit/render.mjs             the renderer (no dependencies)  kit/render.test.mjs    its tests
  kit/manifest.json          template → destination, pack, host; the profile files per pack
  kit/templates/commands/    one file per command
  kit/templates/shared/      host recipes, PR description and notes, reports, checklists, playbook, tour
  kit/templates/shared/tour/ chrome.sh, open.mjs (a tour), demo.mjs (a guided demo), tour-control.mjs
                             (control window, layout, ring), surfaces.mjs (sign-in), tour-panel.js
  kit/profile/GUIDE.md       what each profile file holds
```

In a project:

```
.claude/commands/<prefix>:*.md      generated
.claude/<prefix>-shared/            generated shared files + the profile (yours):
    project.md  routing-tables.md  local-gate.md  review-rules.md  upgrade-steps.md  [tour.md  tour/surfaces.json]
    shipkit.json                    your choices + a hash of every generated file
    playbooks/                      story playbooks (yours): <name>.md, samples/, <name>/part-<N>.mjs
```

The merge bases for future upgrades are kept under the repo's git dir (`.git/shipkit/`), never
committed.

## Renderer

```
node kit/render.mjs plan  <project>                         what would change, as JSON (writes nothing in the project)
node kit/render.mjs apply <project> [--take|--keep|--remove|--skip <file>]…
node kit/render.mjs render --root <project> <template>      one template, rendered, to stdout
node --test kit/render.test.mjs
```

Templates use `{{prefix}}`, `{{shared}}`, `{{tmp}}`, `{{reports}}`, `{{base}}`, `{{PR}}`, `{{a_PR}}`,
`{{PR_LONG}}`, `{{CI}}`, `{{host_cli}}`, and `{{#if qa|tour|github|gitlab|hidden|committed}} … {{else}} … {{/if}}`
(`{{#unless …}}` too). A tag alone on its line takes the line with it; an unknown placeholder fails the
render.

## Improving the templates

Improve a command where you use it, then run `/shipkit:harvest` from this repo's checkout. It splits
your edits into generic improvements (generalized into the templates) and project facts (moved into
that project's profile), bumps the kit version, and leaves the commit to you. Push, run
`claude plugin marketplace update claude-code-mods`, then `/shipkit:forge` in each project.
