# Remote Release Flow

Date: `2026-06-13`

This document defines the standard Pyrosa remote repository release
methodology. It applies to every `pyrosa-*` application repository unless a
later application-specific ADR explicitly overrides it.

This is a remote repository release standard. It defines how a source revision
is approved, tagged and published to GitHub. It does not define or imply any
runtime deploy, service restart, migration, container reconciliation or
production smoke check.

## Scope

This document covers:

- source validation before release;
- commits pushed to the canonical remote;
- annotated release tags;
- publication of release tags to GitHub;
- GitHub Releases published from release tags;
- release notes metadata.

This document does not cover:

- runtime deployment;
- database migrations;
- service restarts;
- container or systemd reconciliation;
- production smoke checks.

## Remote Roles

| Ref | Role | Git Behavior |
| --- | --- | --- |
| active release branch | integration branch selected by the application | receives reviewed and validated changes |
| `vYYMM.DDHHmm` tag | immutable release marker | points to the exact approved commit |
| GitHub Release | public release record | is published from an existing release tag |
| stabilization branch | optional temporary lane | receives fixes before a release tag when needed |

Every release tag must point to a commit that already exists in the canonical
remote. The active release branch is app-specific: for example `main`, `next`
or a stabilization branch chosen for the release.

## Tag Format

Release tags use:

```text
vYYMM.DDHHmm
```

Example:

```text
v2606.220844
```

Meaning:

- `YY`: two-digit year
- `MM`: two-digit month
- `DD`: two-digit day
- `HH`: two-digit hour
- `mm`: two-digit minute

Use UTC unless a later ADR chooses a different product release timezone. This
keeps Pyrosa tags consistent across applications and avoids host-local timezone
ambiguity.

## Recommended Flow

1. Start from the intended release branch.
2. Run the relevant source validation for the changed area.
3. Commit locally with a clear message.
4. Push the commit to GitHub.
5. Confirm the worktree is clean.
6. Confirm local `HEAD` matches the remote commit to be released.
7. Create an annotated release tag using `vYYMM.DDHHmm`.
8. Push the tag to GitHub.
9. Publish a GitHub Release from that existing tag.
10. Record the release URL in release notes or the repository's release log.

## Commands

Generate the current UTC tag:

```bash
date -u +v%y%m.%d%H%M
```

Confirm local `HEAD` matches the remote branch before tagging:

```bash
release_branch="$(git branch --show-current)"
git fetch origin "$release_branch" --tags
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$release_branch")"
```

Create and publish an annotated tag:

```bash
tag="$(date -u +v%y%m.%d%H%M)"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && {
  echo "Tag already exists: $tag" >&2
  exit 1
}
git tag -a "$tag" -m "Release $tag"
git push origin "$tag"
```

List release tags:

```bash
git tag --list 'v*' --sort=-creatordate | head
```

Publish the GitHub Release:

```bash
tag="v2606.220844"
```

Use the actual approved tag instead of the example. Then publish the release
from GitHub:

1. Open the repository's **Releases** page.
2. Choose **Draft a new release**.
3. Select the existing tag.
4. Set the title to `Release <tag>`.
5. Add concise release notes.
6. Publish the release.

If the GitHub CLI is available, the same operation may be done with:

```bash
gh release create "$tag" --title "Release $tag" --notes-file RELEASE_NOTES.md
```

## Policy

- Tags are immutable release markers.
- If a release needs a fix, create a new tag.
- Do not retag a different commit with an existing tag name.
- Do not create release tags from uncommitted or unpublished local state.
- Release tags must point to commits present in the canonical remote.
- GitHub Releases must be created from existing release tags.
- Runtime deploy documentation may consume these tags, but deploy steps remain
  out of scope for this document.
