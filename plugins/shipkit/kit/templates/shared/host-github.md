# Git host: GitHub (`gh`)

Every `/{{prefix}}:*` command talks to the git host only through the recipes below, by name
(`host.md` §Find the PR). Run them on the host shell. `{owner}/{repo}` is filled in by `gh api`
itself. Here a **PR** is a GitHub pull request; the CI results are its **checks**.

Posting (a PR, an issue, a comment, a release) is outward-facing: only after the user's yes.

## Identity

```bash
gh auth status                                  # signed in?
gh api user --jq .login                         # $ME
gh repo view --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner + " " + .defaultBranchRef.name'
```

## Find the PR

For the current branch (none → empty output):

```bash
HEAD="$(git branch --show-current)"
gh pr list --head "$HEAD" --state open --json number,url,state,body,title --limit 1
```

A number or URL the user gave: `gh pr view "$PR" --json number,url,state,body,title,headRefName,baseRefName`.

## Create the PR

```bash
gh pr create --base "$BASE" --head "$HEAD" --title "$TITLE" --body-file {{tmp}}/pr-body.md
```

Prints the PR URL. Draft: add `--draft`.

## Edit the PR description

```bash
gh pr view "$PR" --json body -q .body > {{tmp}}/pr-body-current.md   # read
gh pr edit "$PR" --body-file {{tmp}}/pr-body.md                      # write
```

## PR comments

The conversation (not the inline review threads):

```bash
gh api "repos/{owner}/{repo}/issues/$PR/comments" --paginate \
  --jq '.[] | {id, user: .user.login, created_at, body, html_url}'
```

## Upsert a marked comment

A comment this toolkit owns starts with a marker line (`<!-- {{prefix}}:… -->`). Find the newest
one with that marker, then edit it in place or create it:

```bash
ID="$(gh api "repos/{owner}/{repo}/issues/$PR/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"$MARKER\")) | .id" | tail -1)"
if [ -n "$ID" ]; then
  gh api -X PATCH "repos/{owner}/{repo}/issues/comments/$ID" -F body=@"$BODY" --jq .html_url
else
  gh pr comment "$PR" --body-file "$BODY"            # prints the comment URL
fi
```

Restrict to your own comments when the marker could be someone else's: add
`and .user.login == \"$ME\"` to the `select`.

## Review threads and verdicts

```bash
gh api "repos/{owner}/{repo}/pulls/$PR/reviews" --paginate \
  --jq '.[] | {user: .user.login, state, submitted_at, body}'          # APPROVED / CHANGES_REQUESTED / COMMENTED
gh api graphql -F owner='{owner}' -F name='{repo}' -F n="$PR" -f query='
  query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){
    pullRequest(number:$n){reviewThreads(first:100){pageInfo{hasNextPage}
      nodes{isResolved isOutdated path line
        comments(first:20){nodes{author{login} createdAt body}}}}}}}'   # inline threads
gh api "repos/{owner}/{repo}/pulls/$PR/comments" --paginate \
  --jq '.[] | {user: .user.login, path, line, created_at, body, in_reply_to_id}'   # inline comments, flat
```

## Issues

```bash
gh issue view "$N" --json number,title,body,comments,url,state,labels,author,createdAt   # view, with comments
gh label list --limit 200                                                                 # labels (never invent one)
gh issue create --title "$TITLE" --body-file "$FILE" --label "$L1" --label "$L2"          # prints the URL
gh issue comment "$N" --body-file "$FILE"
```

Closing keyword in a PR description: `Closes #<n>`. Linked issue from a description:
`(?i)\b(closes|fixes|resolves)\s+#(\d+)`, else a bare `#N`.

## Checks

```bash
gh pr checks "$PR" --json name,state,bucket,link,workflow     # bucket: pass / fail / pending / skipping / cancel
gh pr checks "$PR" --watch --interval 30                      # wait for a run in progress
gh run list --branch "$HEAD" --limit 5 --json databaseId,status,conclusion,name,url
gh run view "$RUN" --log-failed                               # the failing steps' logs
gh run rerun "$RUN" --failed                                  # only on the user's yes
```

No checks configured → `gh pr checks` says so: the caller falls back to the local gate.

## Releases and tags

```bash
gh release list --limit 5
gh release create "$TAG" --title "$TAG" --notes-file "$NOTES" --verify-tag   # after pushing the tag
```

## Dependency alerts (optional)

```bash
gh api "repos/{owner}/{repo}/dependabot/alerts?state=open" --paginate \
  --jq '.[] | {pkg: .dependency.package.name, eco: .dependency.package.ecosystem, sev: .security_advisory.severity, id: .security_advisory.ghsa_id}'
```

403 / 404 → alerts are off or not visible to this token; use the local audit only.
