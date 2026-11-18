---
description: 🏷️ RELEASE — Summarize commits since the last tag, propose a semver version, and publish a git tag + release on the git host
argument-hint: "[version]"
---

## Task

Cut a release from `{{base}}`: gather everything since the last tag, draft release notes,
propose a version, and after the user confirms, tag, push and publish.

Conventions come from `{{shared}}/project.md` §Releases: the tag format (default `vX.Y.Z`),
lightweight or annotated (default lightweight: `git tag <v>`), whether a version file is bumped
(default: not by this command; mention it if it lags the tag), where the notes live (default:
only in the host's release). No emoji in the release body. Git host calls go through
`{{shared}}/host.md`.

## 0. Preflight (abort with a clear message; never auto-fix)

- Current branch is `{{base}}`; `git status --porcelain` is empty.
- `git fetch origin {{base}} --tags`.
- Behind `origin/{{base}}` → tell the user to pull. Ahead → note it; Step 6 pushes `{{base}}`
  first.

## 1. Range

```bash
LAST_TAG=$(git for-each-ref --sort=-creatordate --format='%(refname:short)' refs/tags | head -1)
```

- No tag yet (first release): whole history in scope; say how many commits
  (`git log --oneline | wc -l`) before continuing.
- Else `git log "$LAST_TAG"..HEAD --oneline`; empty → "Nothing to release since $LAST_TAG."

## 2. Discover

Like the BRANCH fallback in `{{shared}}/digest-discovery.md`, with `$LAST_TAG` (or the root
commit) as the base:

```bash
git diff "$LAST_TAG"...HEAD --name-status
git diff "$LAST_TAG"...HEAD --stat
```

Same skip list, except: include doc changes as `[DOCS]` bullets (stat + hunks are enough).
Large ranges: key sections only.

## 3. Draft the notes

Area tags from `{{shared}}/routing-tables.md`. Bullets:

```
- **[AREA]** <Past-tense verb> `<symbol or path>` — <what, why, key detail>
```

Past tense, specific, contextual, grouped per area in `---` blocks, most impactful first.
Larger releases may use `### [AREA]` headers. Add an **Upgrade notes** section (the ordered
steps of `{{shared}}/upgrade-steps.md` §Production upgrade that apply, new settings) whenever the
range contains anything `upgrade-steps.md` §Detect lists; reuse `/{{prefix}}:check-migrations-branch`
logic with `$LAST_TAG` as base.

```markdown
## <Title — dominant theme since $LAST_TAG>

---

- **[AREA]** ...
---

## Upgrade notes
1. ...

**Total: X changes across Y areas**
```

Write it to `{{tmp}}/release-notes.md`.

## 4. Propose a version

- `!:` or `BREAKING CHANGE` in the range → major. Any `feat` → minor. Else → patch.
- Pre-1.0 (`v0.x`): breaking → minor, everything else → patch.
- No tags yet → propose the version in the project's version file (`project.md` §Releases), or
  `v0.1.0`.
- An explicit `[version]` argument replaces the proposal (still confirmed below).

## 5. Confirm (GATE)

Show the full notes. **AskUserQuestion**: *"Which version should this release be tagged
as?"* First option the proposal (Recommended), then the next patch/minor when different;
Other for custom. This single answer authorizes Step 6.

## 6. Publish

```bash
git push origin {{base}}             # only if local {{base}} was ahead
git tag <version>                    # or the annotated form project.md §Releases asks for
git push origin <version>
```

Then `host.md` §Releases and tags with `TAG=<version>` and `NOTES={{tmp}}/release-notes.md`.

## Output

```
**Tagged <version>** — X commits since <LAST_TAG>, Y changes across Z areas
<release URL>
```
