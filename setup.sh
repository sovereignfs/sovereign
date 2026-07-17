#!/usr/bin/env bash
# Optional local workspace setup.
#
# Two independent steps, both optional and both kept OUT of this monorepo's git
# history:
#
#   1. ./local — clones support repositories (proposals, infra) that are useful
#      while working on Sovereign but intentionally live outside this repo.
#
#   2. plugins/<name>.local — clones plugin repositories you want to develop
#      against this local platform checkout, following the project's ".local"
#      suffix convention (see docs/plugin-development.md → "Developing a
#      sovereign plugin inside the platform monorepo"). Which repos get cloned is
#      read from a personal, GIT-IGNORED config file at the repo root:
#
#          sovereign.plugins.local
#
#      This file is never committed (it is listed in .gitignore) — it is your own
#      list, not a declaration shared with the codebase. Nothing in the repo
#      references specific plugins. Format:
#
#        - One entry per line.
#        - Blank lines and "#" comments (whole-line or trailing) are ignored.
#        - Each entry is a git clone URL, optionally preceded by an explicit
#          target directory name:
#
#            <git-url>          →  cloned to plugins/<repo-name>.local
#            <name> <git-url>   →  cloned to plugins/<name>.local
#
#      Example sovereign.plugins.local:
#
#        # Plugins I'm actively developing
#        git@github.com:me/sovereign-tasks.git      # → plugins/sovereign-tasks.local
#        notes git@github.com:me/plugin-notes.git   # → plugins/notes.local
#
#      If the file does not exist, this step is skipped with a one-line note.
#      Cloned ".local" plugins are git-ignored here (the .gitignore plugins
#      allowlist keeps only the platform plugins) and are composed into the
#      runtime on the next `pnpm dev` / `pnpm generate`. After cloning new
#      plugins, run `pnpm install` once so pnpm links their workspace deps.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$ROOT_DIR/local"
PLUGINS_DIR="$ROOT_DIR/plugins"
PLUGIN_CONFIG="$ROOT_DIR/sovereign.plugins.local"

# Clone <url> into <target> unless it is already a git checkout. Errors (rather
# than clobbering) if the path exists but is not a git repo.
clone_repo() {
  local url="$1" target="$2" label="$3"

  if [[ -d "$target/.git" ]]; then
    echo "✓ $label already exists"
    return 0
  fi
  if [[ -e "$target" ]]; then
    echo "Error: $target exists but is not a git checkout." >&2
    echo "Move it aside or remove it before re-running setup.sh." >&2
    exit 1
  fi

  echo "Cloning $url → $label..."
  git clone "$url" "$target"
}

# 1. Local support repositories -------------------------------------------------
repos=(
  "sovereign-plugin-proposals git@github.com:sovereignfs/sovereign-plugin-proposals.git"
  "sovereign-infra git@github.com:sovereignfs/sovereign-infra.git"
  "sovereign-desktop git@github.com:sovereignfs/sovereign-desktop.git"
  "sovereign-plugin-template git@github.com:sovereignfs/sovereign-plugin-template.git"
)

mkdir -p "$LOCAL_DIR"

for entry in "${repos[@]}"; do
  name="${entry%% *}"
  url="${entry#* }"
  clone_repo "$url" "$LOCAL_DIR/$name" "local/$name"
done

echo "Local support repositories are ready in $LOCAL_DIR"

# 2. Local plugin repositories (optional; git-ignored config) -------------------
if [[ ! -f "$PLUGIN_CONFIG" ]]; then
  echo "No sovereign.plugins.local found — skipping optional plugin clones (see setup.sh header to enable)."
  exit 0
fi

echo "Reading plugin list from sovereign.plugins.local..."
mkdir -p "$PLUGINS_DIR"

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}" # strip whole-line and trailing "#" comments
  [[ "$line" =~ ^[[:space:]]*$ ]] && continue

  # Two tokens = "name url"; one token = "url" (name derived from the repo).
  read -r first rest <<<"$line"
  if [[ -n "$rest" ]]; then
    plugin_name="$first"
    plugin_url="$rest"
  else
    plugin_url="$first"
    plugin_name="${plugin_url##*/}" # basename of the URL path
    plugin_name="${plugin_name%.git}"
  fi

  clone_repo "$plugin_url" "$PLUGINS_DIR/${plugin_name}.local" "plugins/${plugin_name}.local"
done <"$PLUGIN_CONFIG"

echo "Local plugins are ready in $PLUGINS_DIR (run 'pnpm install', then 'pnpm dev' to compose them)."
