# The project profile: what each file holds

The generic commands know nothing about a project. Everything project-specific lives in a handful of
**profile files** in the project's shared folder (`.claude/<prefix>-shared/`). `/shipkit:forge`
writes them from the scan and the interview; the project owns them afterwards. A rescan never
overwrites them: it proposes rows to add and rows that went stale.

Rules for every profile file:

- **Facts from the repo, never invented.** Every path, command, setting and test named must exist.
  A section with nothing to say holds one line: `None.` (or `None yet: <what would go here>`), so a
  command reading it knows it was considered.
- **Exact commands**, the way the project runs them (`project.md` §Run): copy-pasteable, with the
  container prefix when there is one.
- **Short.** Tables over prose. A row per thing. The commands read these files on every run.
- **No secrets, no personal data.** Name settings and keys, never their values.
- **Section headings are exact** (`## Gate`, `## Sync pairs`, …): the commands cite them as
  `local-gate.md` §Gate.
- A header line on each: `# <title> — <project name>` and one sentence on what it is for, then
  `<!-- shipkit profile: edit freely; /shipkit:forge proposes changes, never overwrites -->`.
- **An existing file** (a legacy toolkit's `routing-tables.md` or `local-gate.md`): keep every row,
  rename its headings to the exact ones below (`## Verify a change works` → `## Verify`), move
  sections that belong elsewhere (commit rules → `project.md` §Commits when they differ from
  `commits.md`), and add the missing sections.

---

## project.md — the project card

| Section | Holds | Typical source |
|---|---|---|
| `## Stack` | Languages, frameworks, package managers, the main source folders and what each is, one line each | manifests, the tree, README |
| `## Run` | How a command runs here: on the host, or in a container (the exact prefix, e.g. `docker compose run --rm -T app`); what must never run on the host; how to start and stop the dev stack | compose files, Makefile, README, CLAUDE.md |
| `## Hard rules` | Numbered, one line each: the rules a change must never break (money, real sends, production, data, security, tooling). Each is a 🔴 in review | CLAUDE.md, CONTRIBUTING, docs; ask the user |
| `## Language` | The tooling language (code, comments, docs, reports; default English) and the product's UI language(s) | README, i18n folders, CLAUDE.md |
| `## Docs` | The doc set (paths, one line on each); the authority order (e.g. `docs/` > `ARCHITECTURE.md` > code); where locked decisions live (an ADR folder, a decisions log, a "Key decisions" table, CLAUDE.md); names that must stay identical across docs; status lines the project keeps (a roadmap, a changelog file); where gotchas are recorded | docs/, README, CLAUDE.md |
| `## Commits` | Only when the project differs from `commits.md`: its own types or scopes, sign-off, ticket prefixes | git log, commitlint config, CONTRIBUTING |
| `## Releases` | Tag format, lightweight or annotated, the version file(s) and whether a release bumps them, a CHANGELOG file to update | tags, package manifest, CHANGELOG |
| `## Sensitive data` | Extra secret patterns (the project's own key prefixes), the phone-number pattern for its country, kinds of personal data it holds (so reports refer to them by id) | `.env.example`, models |
| `## Dev stack` *(qa pack)* | The services and their addresses (on the host, and inside the container network when scripts run there); the health check; **helpers** (how to query the database read-only, how to read the mail catcher, how to see background jobs, the overrides a CLI step needs to stay local); **quirks** (what restarts on save, what can't run twice, how to recover a killed process); **test accounts** (per surface: create, set a password from a script, enable / reset, disable; fake identifiers only, `@example.test`); **browser scripts** (where Playwright resolves, how to run a script, `$SPEC` and `$EV` folders); **test mode** for anything that sends | compose files, seeds, README, CLI help |
| `## Real services` *(qa pack)* | What counts as ☁️ (deploys, hosted accounts, third-party APIs with side effects, shared environments); the `.env` keys that enable each (names only); the undo for each; the *always ask* list (production, billing, anything shared) | `.env.example`, deploy scripts, CI |

## routing-tables.md — where things live and what moves together

| Section | Holds |
|---|---|
| `## Area tags` | `| Tag | Paths |`: one `[AREA]` per part of the codebase; every source folder has exactly one. Tests take the tag of the area they test. The lowercase tag is the commit scope. Keep it to 6–15 tags |
| `## Doc mapping` | `| Area / pattern | Docs |`: for code paths, the doc sections that specify them (what the code must match, and what to update when it changes) |
| `## Doc audit map` | `| Doc | Verify against |`: for each doc, the code it describes (the reverse map, for `update-docs-all`). CLAUDE.md and README first |
| `## Sync pairs` | `| If this changes | Also update | Guarded by |`: things that must change together (a setting ⇄ its example file and docs; models ⇄ a migration; a route ⇄ its permission; a version pin ⇄ its twin; an API shape ⇄ the client's types; a string ⇄ its translations). *Guarded by* names the test that catches a miss, or `—` |
| `## Skip list` | Two lines: **Stat only** (the project's lockfiles, generated and vendored folders, data dumps) and **Never skip** (migrations, schema files, versioned config, the settings example, container files) |

Start the sync pairs from what the scan finds, then ask the user for the ones only they know. A
missing pair is the most common review miss, so the table grows over time: each command that finds a
new pair proposes a row.

## local-gate.md — lint, types, tests, CI, dependencies

| Section | Holds |
|---|---|
| `## Gate` | A fenced block: the lint, format, type and test commands, one per line, each with a trailing comment saying when it applies (`# when web/ changed`). Tests are the relevant ones, never the whole suite by default |
| `## Relevant tests` | How to pick the tests for a change: the naming map (source → test file), `grep` for importers, the tests a PRD names, by-kind rules (a model change → the schema test, …). When the whole suite is fine to run, say so |
| `## Fix` | The auto-fix commands, on changed files only (`eslint --fix <files>`, `ruff check --fix <files>`, `prettier --write <files>`) |
| `## Verify` | How to see a change working, per kind of change (a CLI command with a dry run, a page and its address, a job and its logs, a mail in the catcher, an API call). What never runs just to verify (paid APIs, production) |
| `## CI` | Where CI is defined (`.github/workflows/*.yml`, `.gitlab-ci.yml`), its jobs and steps, and the map from a failing step or job to lint / types / tests / other. `None.` when there is no CI |
| `## Dependencies` | `| Ecosystem | Manifest | Lock | Installed where | Audit | Upgrade (direct / transitive) |`, then pins that must move together and what needs a rebuild after a bump |

## review-rules.md — the project's own review checks and test conventions

| Section | Holds |
|---|---|
| `## Checklist` | Sub-sections per concern, bullets. First the hard-rule checks (each a 🔴 when broken: *every send path honours test mode*, *every write route declares a permission*, *money is never a float*…), then conventions (🟡: the project's patterns for errors, logging, i18n, accessibility, themes). Derived from CLAUDE.md, the docs and the code's own guards |
| `## Tests` | Where tests live and how they're named (source → test), shared fixtures and fakes, the suites (`| Suite | Marker / place | Runs |`), the must-cover list (behaviours that always need a test here), and test conventions (no network, the DB marker, the clock fixture) |

## upgrade-steps.md — what a change means for production

| Section | Holds |
|---|---|
| `## Production upgrade` | The ordered sequence an upgrade follows (backup → build → migrate → restart → deploy the edge…), each with its command |
| `## Detect` | `| Changed | Means | Check | Production step |`: per path pattern (models, migrations, settings, container files, dependency manifests, versioned config, scheduled jobs, edge/worker code, seed or init scripts), what it means, what to check, the production step it needs |
| `## Verify` | The commands that prove migrations and settings are consistent (one head, models ⇄ migrations, the settings example ⇄ the settings) |
| `## Generate` | How to create a migration (the exact command), and what to tidy in a generated one |
| `## Branch checks` | How a branch's first migration must follow the base's last one (a parent revision, the next number) |

A project with no database and no deploy still has this file: `## Detect` then lists dependency and
config changes, and the other sections say `None.`

## tour.md — the guided tour's project side *(tour pack)*

| Section | Holds |
|---|---|
| `## Surfaces` | `| Surface | Host address | Signs in with | Shows changes in |`: each app a tour window can open (a key of `tour/surfaces.json`), its address **on the host** (the tour browser runs there), the account kind, and the source folders whose changes it shows. Plus pages with no account (a mail catcher, a public site) |
| `## Accounts` | Per account kind (`<surface> <role>`): how to create a throwaway one, set its password from a script, enable / reset it, disable it. Fake identifiers only. Where the roles are defined |
| `## Runner` | The launch command (`node .claude/<prefix>-shared/tour/open.mjs`, or the container form, e.g. `docker compose run --rm -T --name <prefix>-tour toolbox node …`), the stop command (`docker stop <prefix>-tour`, or TaskStop of the background task; never a kill that skips the script's exit, which closes its windows), where Playwright resolves (`--playwright <dir>` / `TOUR_PLAYWRIGHT` when it isn't the repo root) and how to install it once. Demo part scripts (`playbooks/<name>/part-<N>.mjs`) run the same way, with `DEMO_*` / `TOUR_*` environment variables passed through |
| `## Build` | What must be built or restarted before a tour shows a change (a front-end bundle, a dev server to start instead) |
| `## Gotchas` | The project's own (a cookie for the UI language, a slow first build) |

## tour/surfaces.json — sign-in recipes *(tour pack)*

Read by `open.mjs`. One key per surface of `tour.md` §Surfaces:

```json
{
  "app": {
    "base": "http://localhost:8000",
    "signin": {
      "path": "/login",
      "fields": { "input[name=\"email\"]": "$login", "input[name=\"password\"]": "$password" },
      "submit": "button[type=\"submit\"]",
      "leaves": "/login",
      "error": ".alert-error"
    }
  },
  "site": { "base": "http://localhost:4321" }
}
```

Take the selectors from the sign-in form's source, not a guess. A sign-in that a form can't do
(SSO, a one-time code, a magic link) gets `"module": "signin.mjs"` instead of `"signin"`, with
`tour/signin.mjs` exporting `async function signIn({ page, origin, login, password, surface })` that
uses a dev-only path the app offers (a test token endpoint, a seeded session). Never a real identity
provider.
