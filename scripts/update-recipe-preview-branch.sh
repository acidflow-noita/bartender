#!/usr/bin/env bash
set -euo pipefail

source_revision=$(git rev-parse HEAD)
git add -- src/data/recipe-card-inputs.json src/data/recipe-card-media.json src/data/recipe-media-release.json src/data/reaction-share-ids.json
if git diff --cached --quiet; then exit 0; fi
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'Update prebuilt recipe previews'
branch_ref="refs/heads/$GITHUB_REF_NAME"
for attempt in 1 2 3; do
  git fetch --no-tags origin "$branch_ref"
  if ! git merge-base --is-ancestor "$source_revision" FETCH_HEAD; then
    echo 'A newer branch history superseded this cook.'
    exit 0
  fi
  git rebase FETCH_HEAD
  status=0
  node scripts/check-recipe-previews.mjs --expect-current || status=$?
  if [ "$status" = 3 ]; then
    echo 'A newer push changed the preview inputs. Its run will update the recipe links.'
    exit 0
  fi
  if [ "$status" != 0 ]; then exit "$status"; fi
  if git push origin "HEAD:$branch_ref"; then exit 0; fi
done
exit 1
