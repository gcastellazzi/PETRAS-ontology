#!/usr/bin/env bash
# Regenerate demo graphs for the static viewer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/petras-core"
python -m pip install -e . -q
python "$ROOT/scripts/generate_demo_project.py" --out "$ROOT/demos/cathedral-shell"
mkdir -p "$ROOT/viewer/public/demos/cathedral-shell"
python -m petras export-graph "$ROOT/demos/cathedral-shell" \
  --out "$ROOT/viewer/public/demos/cathedral-shell/graph.json" \
  --layout flow
echo "Done."
