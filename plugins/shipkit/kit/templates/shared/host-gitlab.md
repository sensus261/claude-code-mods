# Git host: GitLab (`glab`)

Every `/{{prefix}}:*` command talks to the git host only through the recipes below, by name
(`host.md` §Find the PR). Run them on the host shell. In `glab api` paths, `:fullpath` is
filled in from the current repo (self-hosted GitLab: the authenticated host of the remote).
Here a **PR** is a GitLab merge request (MR, numbered `!N`); the CI results are its
**pipeline**. `glab api` has no `--jq`: pipe to `jq`.

Posting (an MR, an issue, a note, a release) is outward-facing: only after the user's yes.

## Identity

```bash
glab auth status                                    # signed in, and to which host?
glab api user | jq -r .username                     # $ME
glab repo view -F json | jq -r '.path_with_namespace + " " + .default_branch'
```

## Find the PR

For the current branch (none → empty array):

```bash
HEAD="$(git branch --show-current)"
glab mr list --source-branch "$HEAD" -F json | jq '[.[] | {number: .iid, url: .web_url, state, title, body: .description}] | .[:1]'
```

A number or URL the user gave: `glab mr view "$PR" -F json | jq '{number: .iid, url: .web_url, state, title, body: .description, headRefName: .source_branch, baseRefName: .target_branch}'`.

## Create the PR

```bash
glab mr create --source-branch "$HEAD" --target-branch "$BASE" --title "$TITLE" \
  --description-file {{tmp}}/pr-body.md --push=false --yes
```

Push first yourself (only on the user's yes). Prints the MR URL. Draft: add `--draft`.

## Edit the PR description

```bash
glab mr view "$PR" -F json | jq -r .description > {{tmp}}/pr-body-current.md   # read
glab mr update "$PR" --description-file {{tmp}}/pr-body.md                    # write
```

## PR comments

The conversation (notes; system notes such as "added 2 commits" dropped):

```bash
glab api "projects/:fullpath/merge_requests/$PR/notes?sort=asc" --paginate \
  | jq '.[] | select(.system | not) | {id, user: .author.username, created_at, body}'
```

A note's link: `<MR url>#note_<id>`.

## Upsert a marked comment

A note this toolkit owns starts with a marker line (`<!-- {{prefix}}:… -->`). Find the newest
one with that marker, then edit it in place or create it:

```bash
ID="$(glab api "projects/:fullpath/merge_requests/$PR/notes?sort=asc" --paginate \
  | jq -r --arg m "$MARKER" '.[] | select(.body | startswith($m)) | .id' | tail -1)"
if [ -n "$ID" ]; then
  glab api -X PUT "projects/:fullpath/merge_requests/$PR/notes/$ID" -F body=@"$BODY" >/dev/null
else
  ID="$(glab api "projects/:fullpath/merge_requests/$PR/notes" -F body=@"$BODY" | jq -r .id)"
fi
echo "<MR url>#note_$ID"
```

Restrict to your own notes when the marker could be someone else's: add
`and .author.username == "<$ME>"` to the `select`.

## Review threads and verdicts

```bash
glab api "projects/:fullpath/merge_requests/$PR/discussions" --paginate \
  | jq '.[] | select(.notes[0].resolvable) | {resolved: (.notes | all(.resolved)),
        path: .notes[0].position.new_path, line: .notes[0].position.new_line,
        notes: [.notes[] | {user: .author.username, created_at, body}]}'        # inline threads
glab api "projects/:fullpath/merge_requests/$PR/approvals" \
  | jq '{approved, approved_by: [.approved_by[].user.username]}'                 # verdicts
```

GitLab has no "changes requested" state: an unresolved thread is the reviewer's ask. A thread
on a line the MR no longer changes has `position` pointing at an old diff (treat it as outdated).

## Issues

```bash
glab issue view "$N" -F json | jq '{number: .iid, title, body: .description, url: .web_url, state, labels, author: .author.username, createdAt: .created_at}'
glab api "projects/:fullpath/issues/$N/notes?sort=asc" --paginate | jq '.[] | select(.system | not) | {user: .author.username, created_at, body}'   # comments
glab label list -F json | jq -r '.[].name'                                         # labels (never invent one)
glab issue create --title "$TITLE" --description-file "$FILE" --label "$L1,$L2" --yes   # prints the URL
glab api "projects/:fullpath/issues/$N/notes" -F body=@"$FILE" >/dev/null           # comment
```

Closing keyword in an MR description: `Closes #<n>`. Linked issue from a description:
`(?i)\b(closes|fixes|resolves)\s+#(\d+)`, else a bare `#N`.

## Checks

```bash
glab ci status --branch "$HEAD" -F json | jq '{id, status, web_url}'                # latest pipeline
glab ci status --branch "$HEAD" --wait                                              # wait for a run in progress
glab api "projects/:fullpath/pipelines/$PIPE/jobs?per_page=100" \
  | jq '.[] | {id, name, stage, status, web_url, allow_failure}'                    # jobs; failed = status "failed"
glab ci trace "$JOB_ID"                                                             # a job's log
glab ci retry "$JOB_ID"                                                             # only on the user's yes
```

No `.gitlab-ci.yml` / no pipeline for the branch → the caller falls back to the local gate.

## Releases and tags

```bash
glab release list | head
glab release create "$TAG" --name "$TAG" --notes-file "$NOTES"    # after pushing the tag
```

## Dependency alerts (optional)

GitLab's dependency scanning findings live in the project's vulnerability report (Ultimate
only). Use the local audit; mention the report's URL when the project has it.
