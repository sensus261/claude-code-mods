# {{PR}} notes: an issue's local session files, on its {{PR}}

`/{{prefix}}:start-working-on-issue`{{#if qa}} and `/{{prefix}}:run-playbook`{{/if}} leave local, untracked files at
the repo root: `ISSUE-<num>-HANDOFF.md`{{#if qa}}, `ISSUE-<num>-TEST-PLAYBOOK.md`, `ISSUE-<num>-QA-RESULTS.md`{{/if}}
and any other `ISSUE-<num>-*.md` the user keeps. They stay **out of the repo** (session scratch and
dev-specific data would land on `{{base}}` at merge) and travel with the {{PR}} instead: **one {{PR}}
comment per file** (collapsible), **linked from the {{PR}} description**.

Why comments and not the description or a commit: the description stays a readable summary; every
comment has its own size limit (three files in the description would overflow it); a comment is
edited in place when the file changes, so the {{PR}} always carries the latest; nothing is added to
history.

Used by `/{{prefix}}:open-pr` (right after it creates the {{PR}}), `/{{prefix}}:start-working-on-issue`
(Stage 9, {{PR}} already open), {{#if qa}}`/{{prefix}}:run-playbook` (Stage 8, {{PR}} already open) {{/if}}and
`/{{prefix}}:ship` ({{PR}} reused). Re-running it is the refresh.

## 1. Find

- `$PR`: the {{PR}} number the caller gives. `$NUM`: the issue number from the branch
  (`^issue-(\d+)-`), else the caller's.
- `ls ISSUE-$NUM-*.md` at the repo root. None → say "no local session files for #<NUM>" and end
  (not an error, no question).

## 2. Check before anything leaves the machine

Posting publishes: the host may cache or index it even if deleted later. For each file, with
`grep -nE` on the host (POSIX classes: macOS `grep -E` has no `\s`/`\d`):

- **Secrets:**
  `(token|secret|password|passwd|api[_-]?key|bearer)[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}`,
  `(sk|rk|pk)_(live|test)_`, `whsec_`, `gh[pousr]_[A-Za-z0-9]{20,}`, `glpat-`, `xox[abpr]-`,
  `AKIA[0-9A-Z]{16}`, `eyJ[A-Za-z0-9_-]{10,}`, `-----BEGIN`, `/#[A-Za-z0-9_-]{20,}` (an invite
  link's fragment), any 32+ character run of `[A-Za-z0-9_-]` that is not a path or hash the file
  labels as one, plus the project's own patterns in `project.md` §Sensitive data.
- **Personal data:** an email address not at `example.*`, `*.invalid` or `*.test`
  (`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+`, then drop the allowed domains); a phone number (the pattern
  in `project.md` §Sensitive data, else `\+?[0-9][0-9 ().-]{8,}[0-9]` and judge each hit); the
  name of a real client, owner or person (read the file for it: no regex finds a name).
- **Size:** more than 60,000 characters → split at `## ` headings into parts ("part 1/2" …), each
  under the limit.

Show every hit as `file:line · what it looks like`, **never the matched value**. Hits → ask
(**AskUserQuestion**) per file: **Fix the file first** (stop here), **Post anyway**, **Skip this
file**. No hits → say "no secrets or personal data found" in one line.

## 3. Ask (GATE)

One **AskUserQuestion**, multi-select, one option per file, labelled *update* when its comment
already exists (§4 lookup) and *new* otherwise:

> Publish these local files on {{PR}} #<PR> as collapsible comments, linked from its description?

Nothing is posted without this answer. None selected → end.

## 4. Post or update (idempotent)

Marker, first line of the comment: `<!-- {{prefix}}:pr-note <FILE> -->` (split files:
`<!-- {{prefix}}:pr-note <FILE> part N/M -->`). Body written to `{{tmp}}/pr-note-<FILE>`:

```markdown
<!-- {{prefix}}:pr-note ISSUE-91-HANDOFF.md -->
<details><summary><b>ISSUE-91-HANDOFF.md</b> · local file, updated 2026-11-01 at 647440c</summary>

<the file's content, unchanged>

</details>
```

The blank lines inside `<details>` are required, or the markdown does not render. The date is
today's, the short SHA is `HEAD`'s.

Then `host.md` §Upsert a marked comment with `MARKER="<!-- {{prefix}}:pr-note <FILE> "` (an exact
match on the first line) and `BODY={{tmp}}/pr-note-<FILE>`; keep the comment URL it prints.

A file that now needs fewer parts than before → edit each leftover part's body to its marker plus
`_superseded_`. Never delete a comment.

## 5. Link from the {{PR}} description

Keep one block in the description, between the markers, and touch nothing else of it:

```markdown
<!-- {{prefix}}:pr-notes -->
## Session notes
Local files of the session, published here as comments (not in the repo):
- [ISSUE-91-HANDOFF.md](<comment url>)
{{#if qa}}
- [ISSUE-91-TEST-PLAYBOOK.md](<comment url>)
{{/if}}
<!-- /{{prefix}}:pr-notes -->
```

Read the description (`host.md` §Edit the {{PR}} description) → block present: replace it; absent:
insert it **before the final attribution line** (`🤖 Generated with …`), or append it when there is
none. Write the whole description to `{{tmp}}/pr-body.md`, then write it back with the same recipe.
Links for files that were skipped keep their existing entry.

## 6. Report

```
## {{PR}} notes — {{PR}} #<PR>

| File | Result | Comment |
|---|---|---|
| ISSUE-91-HANDOFF.md | 🆕 posted / ♻️ updated / ⏭ skipped | <url> |
```

One line after it: the files stay local and untracked; run the same step again after they change
(the comments are updated in place).
