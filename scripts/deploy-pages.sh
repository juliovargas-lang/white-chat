#!/usr/bin/env bash
# Publishes web/ to the gh-pages branch (GitHub Pages), without touching main.
# Needs GITHUB_TOKEN (fine-grained: Contents RW on this repo), read from ~/.white-chat-deploy.env if present.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-$HOME/.white-chat-deploy.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

index=$(mktemp)
trap 'rm -f "$index"' EXIT
rm -f "$index"
GIT_INDEX_FILE="$index" git --work-tree=web add -A .
tree=$(GIT_INDEX_FILE="$index" git write-tree)
commit=$(git commit-tree "$tree" -m "deploy: web/ from $(git rev-parse --short HEAD)")

auth="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
git -c http.extraHeader="$auth" push --force origin "$commit:refs/heads/gh-pages"
echo "Deployed $commit to gh-pages"
