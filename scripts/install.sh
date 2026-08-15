#!/usr/bin/env bash
set -euo pipefail

# Install the Biomni (Anchored) preset into the DeepSeek Harness user root.
#
# Usage:
#   ./scripts/install.sh           install (refuses to overwrite)
#   ./scripts/install.sh --force   replace an existing installation

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TARGET="$DSH_HOME/.agent-presets/biomni"
FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

if [ -e "$TARGET" ]; then
  if [ "$FORCE" -eq 1 ]; then
    echo "removing existing preset at $TARGET"
    rm -rf "$TARGET"
  else
    echo "error: $TARGET already exists" >&2
    echo "use --force to replace it, or remove it manually first" >&2
    exit 1
  fi
fi

mkdir -p "$TARGET"
cd "$REPO_DIR"

cp preset.yml agent.cordis.yml "$TARGET/"
cp biomni-agent-tools.mjs biomni_bridge.py compaction-epoch.mjs custom-bash.mjs \
   dev-tool-search.mjs instruction-hint.mjs skill-search.mjs tool-bootstrap.mjs \
   "$TARGET/"
cp -R skills "$TARGET/"
chmod -R u+rwX "$TARGET"

if [ -f "$TARGET/agent.cordis.yml" ] && [ -f "$TARGET/preset.yml" ]; then
  echo "installed: $TARGET"
  echo "restart dsh web (or open a new session) and select Biomni (Anchored)"
else
  echo "error: install verification failed" >&2
  exit 1
fi
