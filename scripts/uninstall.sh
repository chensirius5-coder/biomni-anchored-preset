#!/usr/bin/env bash
set -euo pipefail

# Remove the Biomni (Anchored) preset from the DeepSeek Harness user root.

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TARGET="$DSH_HOME/.agent-presets/biomni"

if [ -d "$TARGET" ]; then
  rm -rf "$TARGET"
  echo "removed: $TARGET"
else
  echo "not installed: $TARGET"
fi
