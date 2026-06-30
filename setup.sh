#!/usr/bin/env bash
# Optional local workspace setup.
#
# Creates ./local and clones support repositories that are useful while working
# on Sovereign but are intentionally kept outside this monorepo.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$ROOT_DIR/local"

repos=(
  "sovereign-plugin-proposals git@github.com:sovereignfs/sovereign-plugin-proposals.git"
  "sovereign-infra git@github.com:sovereignfs/sovereign-infra.git"
)

mkdir -p "$LOCAL_DIR"

for entry in "${repos[@]}"; do
  name="${entry%% *}"
  url="${entry#* }"
  target="$LOCAL_DIR/$name"

  if [[ -d "$target/.git" ]]; then
    echo "✓ $name already exists at local/$name"
    continue
  fi

  if [[ -e "$target" ]]; then
    echo "Error: local/$name exists but is not a git checkout." >&2
    echo "Move it aside or remove it before re-running setup.sh." >&2
    exit 1
  fi

  echo "Cloning $url into local/$name..."
  git clone "$url" "$target"
done

echo "Local support repositories are ready in $LOCAL_DIR"
