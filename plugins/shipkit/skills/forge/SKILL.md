---
name: forge
description: Install or re-sync the shipkit workflow toolkit in a project. It writes project-specific /<prefix>:* commands (plan-to-prd, start-working-on-issue, the pre-commit and pre-merge pipelines, open-pr, pr-checks, ship, changelog, docs sync, migrations check, tag-release, audit-deps, test playbooks, guided tours) from the plugin's templates, plus a project profile built by scanning the repo, either committed to the repo or hidden from git. Run it again at any time to rescan the project and upgrade the toolkit, keeping hand edits. Use when the user runs /shipkit:forge, asks to set up, install, regenerate, rescan, update or upgrade the toolkit, workflow commands or "sensus tools" in a project, or to adopt a hand-copied set of such commands.
argument-hint: "[project-path] [--prefix name] [--mode committed|hidden] [--packs core,qa,tour]"
---

# /shipkit:forge — install or re-sync the toolkit

One idempotent command. No toolkit in the project → **install**. A toolkit already there → **rescan**:
refresh the project profile from the code, upgrade the generated commands to the plugin's current
templates, keep every hand edit.

**Where things are.** The kit is next to this skill: `${CLAUDE_PLUGIN_ROOT}/kit/` (the renderer
`render.mjs`, `manifest.json`, `templates/`, `profile/GUIDE.md`). If `${CLAUDE_PLUGIN_ROOT}` is not
filled in, find it: `ls -d ~/.claude/plugins/*/*/plugins/shipkit/kit ~/.claude/plugins/cache/*/shipkit/*/kit 2>/dev/null`
(or Glob for `**/shipkit/kit/render.mjs`). Below, `$KIT` is that folder and `$P` the project root.
Read `scan.md` (next to this file) and `$KIT/profile/GUIDE.md` before Stage 1.

**What a project gets** (the prefix and the shared folder are chosen in Stage 2):

```
.claude/commands/<prefix>:*.md        the commands (from templates: don't hand-edit unless you mean it)
.claude/<prefix>-shared/              templates' shared files + the profile (project-owned):
    project.md routing-tables.md local-gate.md review-rules.md upgrade-steps.md [tour.md tour/surfaces.json tour/runner.json]
    shipkit.json                      choices + a hash of every generated file
    playbooks/                        story playbooks (project-owned, never generated: forge leaves them alone)
    tours/<ID>/tour.json              committed guided tours (project-owned, never generated: forge leaves them alone)
```

Packs: **core** (24 commands: PRD → issue → implement → PR/MR → checks → pre-merge review → ship,
the staged/branch reviews, changelog, docs sync, migrations, tag-release, audit-deps, clear),
**qa** (`run-playbook`, the test-playbook format, story playbooks), **tour** (`pr-tour`, guided
tours in a real browser with a control window beside the app, and `run-playbook … demo`, a guided
demo of a story playbook; tours are committed with their change and run again **without an agent**,
`tour/tour.mjs`, like story demos, `tour/present.mjs`; needs qa and a web UI).

Modes: **committed** (normal files; the scratch output — `.claude/.tmp/`, `reports/`, review
reports, `ISSUE-*` notes — is added to `.gitignore`), **hidden** (everything listed in
`.git/info/exclude`: nothing in the repo changes, the toolkit stays on this machine).

Rules: single agent unless the user's rules allow sub-agents and the user says yes. Never commit
without the user's approval (their CLAUDE.md commit rule wins: ask with the branch, the files and
the message). Never push. Never touch `.claude/` files the toolkit doesn't own (other commands,
skills, agents, settings).

## Stage 0 — Where and what

1. `$P` = the argument path, else the current repo root (`git rev-parse --show-toplevel`). Not a
   git repo → say hidden mode is unavailable (no `.git/info/exclude`) and continue only if the user
   wants committed mode.
2. Look for `$P/.claude/*/shipkit.json`:
   - **One** → **rescan** (go to §Rescan after Stage 1).
   - **Several** → ask which (each is a separate toolkit with its own prefix).
   - **None** → **install**. Also check for a **legacy** toolkit (`scan.md` §7): commands whose
     names match the templates', with or without a prefix, and the shared folder they cite. Found →
     say so: the install adopts it (Stage 3 carries its project knowledge into the profile).

## Stage 1 — Scan (read-only)

Follow `scan.md`. Show its summary (§8). On a big repo, read headings and configs, not every file.

## Stage 2 — Choices (install)

One **AskUserQuestion**, up to four questions, each with the recommended option first:

1. **Prefix** for the commands (`/<prefix>:ship`): a short lowercase name from the repo (`hunter`
   for `websites_hunter`); a legacy toolkit's own prefix when there is one. The user may type another.
2. **Mode:** committed (recommended when the team should share the commands) or hidden.
3. **Packs:** core + qa + tour (recommended for a web app with a dev stack the scan could map),
   core + qa (a service or CLI with something to run by hand), core only (a library).
4. **Base branch / host:** only when the scan couldn't decide.

Flags given to the command (`--prefix`, `--mode`, `--packs`) skip their question.

Then, in plain text (not a dialog), show the **hard rules** you derived (CLAUDE.md and docs, each
with its source) and ask the user to confirm, drop or add. They become `project.md` §Hard rules,
the 🔴 checks of every review.

Shared folder: `.claude/<prefix>-shared`. Adopting a legacy toolkit whose commands cite another
folder (`.claude/review-shared`): keep that folder (`"shared": ".claude/review-shared"` in the
config) so existing references and the user's habits stay valid.

## Stage 3 — Write the config and the profile

1. Write `$P/<shared>/shipkit.json` (only the choices; the renderer adds the rest):

   ```json
   { "prefix": "<prefix>", "base": "<base>", "host": "github|gitlab", "packs": ["core", …],
     "mode": "committed|hidden", "shared": "<only when not .claude/<prefix>-shared>" }
   ```

2. Write the profile files of the chosen packs (`$KIT/manifest.json` → `profile`), following
   `$KIT/profile/GUIDE.md` exactly: section headings, tables, the header comment. From the scan;
   never invented. **Adopting a legacy toolkit:** its files are the best source. Carry over, verbatim
   where possible:
   - its routing tables → `routing-tables.md` (area tags, doc mapping, sync pairs; its skip list
     from its digest-discovery file);
   - its local gate → `local-gate.md` (§Gate, §Fix, §Verify) and its commit rules → `project.md`
     §Commits when they differ from `commits.md`;
   - the project-specific sections of its code-review checklist and test-review core →
     `review-rules.md` §Checklist and §Tests;
   - the detect table and production sequence of its check-migrations command → `upgrade-steps.md`;
   - its CI description (pr-checks), its dependency table (audit-deps), its release conventions
     (tag-release), its dev-stack helpers, quirks and real-services rules (run-playbook), its
     guided-tour surfaces, accounts and runner → `project.md` / `local-gate.md` / `tour.md` /
     `tour/surfaces.json`;
   - anything else project-specific in its commands that a template now reads from the profile.

   **Tour pack:** `tour/runner.json` is the machine form of `tour.md` §Runner and §Data (GUIDE.md
   says its keys): `launch` from the launch command, `env` from where Playwright resolves, and
   `preflight` from `project.md` §Dev stack (the services, what serves the front end, migrations,
   workers). `prepare` only when the project already has a fixture entry point; otherwise `tour.md`
   §Data says `None yet` and the first tour that needs data adds it. Add the row
   `node <shared>/tour/tour.mjs --lint   # when <shared>/tours/ changed` to `local-gate.md` §Gate.
   A legacy toolkit with committed tours elsewhere (`.claude/tours/`): say so, and offer to move them
   to `<shared>/tours/` (a `git mv`, asked).
   A profile file that already exists (a rescan, or a name the legacy folder shares, like
   `routing-tables.md`) is **edited in place**, never replaced: its rows stay.
3. Show what was written: one line per file with its counts (`routing-tables.md: 12 area tags,
   18 doc rows, 9 sync pairs`), and the gaps (`None yet:` sections) the user may want to fill.

## Stage 4 — Render

```bash
node "$KIT/render.mjs" plan "$P"
```

It prints JSON: a `summary` of statuses and one row per file. Show a short table (status → count,
then the files that need a decision). Statuses:

| Status | Meaning | Default |
|---|---|---|
| `new` / `update` | not there yet / unedited since the last forge | written |
| `same` / `kept` | nothing to do / hand-edited, template unchanged | left as is |
| `merged` | hand-edited and the template changed; a clean 3-way merge | the merge is written (show its diff: `git diff --no-index "$P/<dest>" <row.merge>`) |
| `conflict` | hand-edited and the template changed; the merge conflicts (or no base) | **decide** |
| `adopt` | a file that was there before shipkit (legacy) | **decide** |
| `removed` | generated earlier, deleted by hand | **decide** |
| `orphan` | generated earlier, no template now (a pack dropped, a template retired) | **decide** |
| `unmanaged` | a `/<prefix>:*` command shipkit doesn't generate (yours, or a legacy one renamed) | **decide** |

Decisions, one **AskUserQuestion** per group (multi-select where it fits), always showing what is
at stake (a diff summary: `git diff --no-index --stat`, and the key hunks):

- **adopt:** after Stage 3 carried its project knowledge into the profile, recommend **take the
  template** (`--take`). Keep it (`--keep`) when it holds behaviour the template lacks; then suggest
  `/shipkit:harvest` to bring that behaviour into the templates.
- **conflict:** resolve it with the user: the row's `merge` file holds the conflict markers
  (`yours` / `previous template` / `new template`). Write the resolved text to `$P/<dest>`, then
  `--keep <dest>`. Or `--take` (lose the edits) / leave it pending.
- **removed:** `--take` (restore) or `--skip` (never generate it again).
- **orphan / unmanaged:** `--remove` or `--keep` (kept as the user's own file, never asked again).
  A legacy command renamed by the templates (`start-working-on-github-issue` → `start-working-on-issue`)
  is recommended for removal once the new one exists.

Then:

```bash
node "$KIT/render.mjs" apply "$P" [--take <dest>]… [--keep <dest>]… [--remove <dest>]… [--skip <dest>]…
```

It writes the files, the lock (`shipkit.json` → `files`), the merge bases (under the repo's git
dir, never committed), and the ignore block (`.gitignore` in committed mode, `.git/info/exclude` in
hidden mode; switching modes moves it). Read its JSON: `done`, `pending` (left for later),
`trackedButHidden` (hidden mode, but git already tracks those files: say so, and offer
`git rm --cached <files>`, which stages a deletion; ask first).

## Stage 5 — Check

1. `node "$KIT/render.mjs" plan "$P"` again: only `same` / `kept` (and pending decisions the user
   chose to leave).
2. Hidden mode: `git -C "$P" status --short -- .claude` shows none of the toolkit's files.
   Committed mode: `git -C "$P" check-ignore -q .claude/.tmp/x && echo ignored`.
3. Tour pack: `node "$P/<shared>/tour/tour.mjs" --lint` exits 0 (no tours yet is fine), and
   `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$P/<shared>/tour/runner.json"`
   parses.
4. Every file the commands cite exists: `grep -oh '\.claude/[A-Za-z0-9_./:-]*\.md' "$P"/.claude/commands/<prefix>:*.md "$P"/<shared>/*.md | sort -u`,
   then `test -e` each (ignore the ones under `.claude/.tmp`). A missing profile file → write it
   (Stage 3).

## Stage 6 — Summary

```
## shipkit — <install | rescan> of <project> (kit <version>)

Commands: /<prefix>:… (<N>) · packs <core+qa+tour> · mode <committed | hidden> · host <github | gitlab> · base <branch>
Profile: project.md · routing-tables.md (<k> tags, <m> sync pairs) · local-gate.md · review-rules.md · upgrade-steps.md[ · tour.md]
Files: <n> created · <n> updated · <n> merged · <n> kept · <pending> pending
Start with: /<prefix>:plan-to-prd, /<prefix>:start-working-on-issue <n>, /<prefix>:start-pre-merge-review, /<prefix>:ship
```

New command files show up in the `/` menu right away; if one doesn't, restart the session.

Tour pack, committed mode, a `package.json` at the repo root: offer once (**AskUserQuestion**) to add
`npm run` aliases for the agent-free runners, so a teammate types `npm run tour -- <ID>` and
`npm run demo -- <story>`: **Add `tour` and `demo` (Recommended)** / **No**. Only names its `scripts`
don't use yet (taken → offer `tour:<prefix>` / `demo:<prefix>`), values `node <shared>/tour/tour.mjs`
and `node <shared>/tour/present.mjs`. It edits a file outside `.claude/`: show the two lines first,
change nothing else in the file (keep its indentation), and name them in `tour.md` §Runner. Hidden
mode never touches it.

Committed mode: offer to commit the toolkit (the user's commit rule applies: ask, naming the branch,
the files and a message such as `chore(claude): add the /<prefix>:* workflow commands (shipkit
<version>)`). On the default branch, suggest a branch first. Hidden mode: nothing to commit, say so.

## Rescan

Same stages, with these differences:

- **Stage 2** is skipped unless flags change a choice (`--packs`, `--mode`): then update
  `shipkit.json` and say what changes (a dropped pack's files become `orphan`; a mode switch moves
  the ignore block). A new `--prefix` is a new toolkit: install it, then remove the old one's files
  (`orphan` / `unmanaged` under the old prefix), asked first.
- **Stage 3 — profile drift.** Re-scan and compare with the profile. Propose, as one multi-select
  per file, only real differences:
  - source folders no area tag covers, and area-tag paths that no longer exist;
  - doc-mapping rows whose code or doc moved; docs added or removed;
  - new sync-pair candidates (a new setting file, a new migration tool, a new client of an API);
  - gate, CI and dependency commands that changed (CI is the authority);
  - new migrations, deploy files or scheduled jobs for `upgrade-steps.md`;
  - (tour) surfaces whose port or sign-in form changed; `runner.json` preflight steps whose service,
    dev server or migration command changed; a fixture entry point that appeared (`prepare`).
  Edit the chosen rows in place; leave everything else alone.
- **Stage 4** is where template upgrades arrive: `update` and `merged` rows are the plugin's
  improvements; show the template changes briefly (what got better), not every line.

## When something fails

- `render.mjs` exits 1 with `shipkit: …`: a config error (it names the field), an unbalanced
  template (a kit bug: report it), or no config found. Fix and re-run; nothing was half-written
  (apply writes after the plan succeeds).
- Node missing → the renderer can't run: say so (Node ≥ 18 is needed); don't hand-render 40 files.
