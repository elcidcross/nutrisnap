---
description: Commit any pending changes, push, bump version, push tags (Vercel auto-deploys).
---

Ship the current change end-to-end. Arguments: $ARGUMENTS (optional — `patch` (default), `minor`, or `major`).

1. `git status` — if there are uncommitted changes, stage the relevant files (don't use `git add -A`) and create a commit. Generate the message from the diff: one short subject line, then 1–3 sentences explaining why. End with the standard `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer. If the tree is already clean, skip the commit.
2. `git push` to origin.
3. `npm version <bump>` on the host (NOT via `scripts/dev`) — `<bump>` is the first word of `$ARGUMENTS`, or `patch` if empty. This creates a tagged commit.
4. `git push --follow-tags` to publish the tag. Vercel auto-deploys from `main`.

Report the new version and tag at the end.
