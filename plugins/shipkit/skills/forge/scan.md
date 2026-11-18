# Scan: what to read, and what it tells you

Read-only. Nothing here writes, installs, starts a service or calls the network except the git host's
read-only CLI (`gh` / `glab`), and only for the default branch and labels. Prefer reading files over
running tools. Note each fact with where it came from: the profile cites it.

## 1. Repo and host

```bash
git rev-parse --show-toplevel
git remote get-url origin
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null   # origin/main → base "main"
git log --format=%s -60                                          # commit style, scopes
git tag --sort=-creatordate | head -5                            # tag format
```

- **Host:** `github.com` in the remote → `github`. A GitLab host (`gitlab.` in the name, or
  `glab auth status` lists it) → `gitlab`. Anything else → ask.
- **Base:** the remote HEAD; else `gh repo view --json defaultBranchRef` / `glab repo view -F json`;
  else ask (`main`, `master`, `develop`).
- **Host CLI ready:** `gh auth status` / `glab auth status`. Not signed in → say so in the summary
  (the commands need it), don't fix it.

## 2. Stack and how things run

| Look at | Tells you |
|---|---|
| `package.json` (+ which lockfile: npm, pnpm, yarn, bun), `pyproject.toml` / `requirements*.txt` / `uv.lock` / `poetry.lock`, `composer.json`, `Gemfile`, `go.mod`, `Cargo.toml`, `pom.xml` / `build.gradle*`, `*.csproj` | languages, package managers, frameworks (from the dependencies), workspaces / monorepo packages |
| `docker-compose*.yml` / `compose*.yaml` (services, ports, profiles, volumes), `Dockerfile*`, `.devcontainer/` | whether things run in containers, the service to run tools in (a `toolbox` / `app` / `php` / `web` service), the dev ports, the database and mail catcher |
| `Makefile`, `justfile`, `Taskfile.yml`, `package.json` scripts, `bin/`, `scripts/` | the commands people actually use: prefer them over raw tool calls |
| `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, `CONTRIBUTING.md`, README "Development" | the stated way to run things, and the rules (→ hard rules) |

Decide `project.md` §Run from it: host, or a container prefix. When CLAUDE.md says something like
"Docker only", it wins.

## 3. Gate: lint, format, types, tests, CI

| Tool configs | Commands |
|---|---|
| `.eslintrc*` / `eslint.config.*`, `.prettierrc*`, `biome.json`, `tsconfig.json` | `eslint`, `prettier --check`, `biome check`, `tsc --noEmit` |
| `ruff.toml` / `[tool.ruff]`, `[tool.black]`, `mypy.ini` / `[tool.mypy]`, `pyrightconfig.json` | `ruff check`, `ruff format --check`, `mypy`, `pyright` |
| `phpstan.neon*`, `psalm.xml`, `.php-cs-fixer*`, `pint.json`, `phpcs.xml*` | `phpstan analyse`, `psalm`, `php-cs-fixer fix --dry-run`, `pint --test`, `phpcs` |
| `.rubocop.yml`, `.golangci.yml`, `clippy.toml`, `rustfmt.toml` | `rubocop`, `golangci-lint run`, `cargo clippy`, `cargo fmt --check` |
| `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `pytest.ini` / `[tool.pytest]` / `conftest.py`, `phpunit.xml*`, `pest`, `.rspec`, `*_test.go` | the test runners, their markers / projects / suites, where tests live |
| `.github/workflows/*.yml`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml` | **the authoritative commands**: copy what CI runs; jobs and steps for `local-gate.md` §CI |
| `.pre-commit-config.yaml`, `.husky/`, `.githooks/`, `lefthook.yml` | what already runs on commit |

Test naming: list a few source files and their tests to find the map (`src/x/y.ts` →
`src/x/y.test.ts`, `app/Foo.php` → `tests/Unit/FooTest.php`, `pkg/y.py` → `tests/test_y.py`).

## 4. Data, settings, upgrades

| Look for | Means |
|---|---|
| `alembic/`, `*/migrations/` (Django), `prisma/migrations/`, `drizzle/`, `database/migrations/` (Laravel), `db/migrate/` (Rails), `migrations/*.sql` (D1, goose, flyway), `src/Migrations/` (Doctrine) | the migration tool, how to generate one, how heads / numbering work |
| model files (SQLAlchemy / SQLModel, Django `models.py`, Prisma `schema.prisma`, Eloquent / Doctrine entities, ActiveRecord) | the models ⇄ migrations sync pair |
| `.env.example`, `.env.dist`, settings modules (`config.py`, `settings.py`, `config/*.php`, `application.yml`) | the settings ⇄ example ⇄ docs sync pair; the keys of real services (§6) |
| deploy files: `wrangler.toml` / `wrangler.jsonc`, `vercel.json`, `netlify.toml`, `fly.toml`, `serverless.yml`, `app.yaml`, `Procfile`, `terraform/`, `k8s/`, `helm/`, deploy scripts | the production upgrade steps; ☁️ steps |
| versioned config (YAML with a `version:` key), seed / init scripts, scheduled jobs (cron, Celery beat, Prefect deployments, Laravel scheduler, Sidekiq cron) | rows for `upgrade-steps.md` §Detect |

## 5. Docs

`docs/`, `doc/`, `adr/` / `docs/adr/` / `decisions/`, `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`,
`CHANGELOG.md`, `IMPLEMENTATION.md`, `CONTRIBUTING.md`, per-package READMEs. Read their headings
(not every line) to build the doc mapping and the audit map, and to find where locked decisions,
the roadmap and gotchas live.

## 6. Dev stack and real services *(qa and tour packs)*

| Look for | Gives |
|---|---|
| compose services with ports; Vite / Next / Astro / dev-server configs | the surfaces and their **host** addresses |
| a database service (postgres, mysql, mariadb, mongo, redis) | the read-only query helper (`docker compose exec -T <db> psql -U … -At`, …) |
| mailpit, mailhog, mailcatcher, smtp4dev | the mail catcher's address and API |
| queues and schedulers (celery, sidekiq, bull, horizon, prefect, temporal) | how to see jobs in flight; the "don't edit while a job runs" quirk |
| login routes and forms (`grep -rn "login\|signin\|sign-in" --include=*.{tsx,vue,svelte,html,twig,blade.php,erb,py,ts} <src>`), auth middleware, roles / permissions enums, user-creation commands (CLI, seeders, factories, admin scripts) | the surfaces' sign-in recipes, the account kinds and roles, how to make a throwaway account |
| `@playwright/test` / `playwright` in any `package.json` | where Playwright resolves (tour runner, browser scripts) |
| `.env.example` keys like `STRIPE_*`, `AWS_*`, `CLOUDFLARE_*`, `SENDGRID_*`, `TWILIO_*`, `OPENAI_*`, `*_API_KEY`, `*_TOKEN`, and a test-mode switch for sends | the ☁️ list, its keys (names only), the test mode |

A project with no UI (a library, a CLI, an API only) → recommend the qa pack without tour, or core
only.

## 7. An existing toolkit

| Found | Means |
|---|---|
| `.claude/*/shipkit.json` | shipkit already manages this project: a rescan |
| `.claude/commands/<x>:<name>.md` or `.claude/commands/<name>.md` where `<name>` is a template command (`ship`, `code-review`, `start-pre-merge-review`, `changelog-branch`, …) | a hand-copied toolkit (legacy): its prefix is `<x>`, or none |
| `.claude/review-shared/` or another folder those commands cite | the legacy shared folder: its routing tables, gate, checklists hold project knowledge to carry into the profile |
| other `.claude/commands/*.md`, `.claude/skills/`, `.claude/agents/` | the user's own tools: never touched |

## 8. The summary to show

At most 20 lines: host and base, stack, how things run, the gate commands found (and from where),
migrations, docs, dev stack surfaces (when found), real services, an existing toolkit, and anything
that could not be determined (asked in the interview).
