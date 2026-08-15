#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a local Biomni engine for the Biomni (Anchored) DSH preset.
#
# This script installs the Python package and the launcher. It deliberately
# does NOT download the ~11 GB data lake and does NOT touch API secrets.
#
# Usage:
#   BIOMNI_HOME=$HOME/Biomni ./scripts/setup-biomni.sh
#   PYTHON_BIN=python3.11 ./scripts/setup-biomni.sh
#
# Environment:
#   BIOMNI_HOME   Biomni root (default: $HOME/Biomni)
#   PYTHON_BIN    Python used to create the venv (default: python3)
#   BIOMNI_VERSION pip version (default: biomni==0.0.8)

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIOMNI_HOME="${BIOMNI_HOME:-$HOME/Biomni}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BIOMNI_VERSION="${BIOMNI_VERSION:-biomni==0.0.8}"
VENV="$BIOMNI_HOME/.venv"
VENV_PYTHON="$VENV/bin/python"

echo "==> Biomni root: $BIOMNI_HOME"
mkdir -p "$BIOMNI_HOME"

if [ -x "$VENV_PYTHON" ]; then
  echo "==> Using existing venv: $VENV"
else
  echo "==> Creating venv with $PYTHON_BIN"
  "$PYTHON_BIN" -m venv "$VENV"
fi

echo "==> Installing pip and Biomni"
"$VENV_PYTHON" -m pip install --upgrade pip
if "$VENV_PYTHON" -m pip install "$BIOMNI_VERSION"; then
  echo "==> Installed $BIOMNI_VERSION"
else
  echo "==> PyPI install failed; trying the upstream GitHub source"
  "$VENV_PYTHON" -m pip install "git+https://github.com/snap-stanford/Biomni.git@main"
fi

echo "==> Installing the portable launcher"
cp "$REPO_DIR/scripts/run_biomni.py" "$BIOMNI_HOME/run_biomni.py"

if [ -f "$BIOMNI_HOME/.env" ]; then
  echo "==> Keeping existing .env"
else
  echo "==> Creating .env from env.example (edit it before running tasks)"
  cp "$REPO_DIR/env.example" "$BIOMNI_HOME/.env"
  chmod 600 "$BIOMNI_HOME/.env"
fi

echo
echo "Biomni engine bootstrap complete."
echo
echo "Next steps:"
echo "  1. Edit $BIOMNI_HOME/.env and set BIOMNI_CUSTOM_API_KEY"
echo "  2. Smoke test:"
echo "     $VENV_PYTHON $BIOMNI_HOME/run_biomni.py \"reply with exactly READY\""
echo "  3. Optional data lake (~11 GB, one time):"
echo "     $VENV_PYTHON $BIOMNI_HOME/run_biomni.py --download-datalake \"list data lake files\""
echo "  4. Optional Gradio service:"
echo "     cd $BIOMNI_HOME && $VENV_PYTHON run_biomni.py --gradio"
