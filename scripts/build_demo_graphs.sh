#!/usr/bin/env bash
# Regenerate demo graphs for the static viewer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Prefer an activated venv, then the repo venv, then python3. A bare `python`
# does not exist on a stock macOS or Debian shell, and this script is the first
# thing a new reader runs.
if [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/python" ]]; then
  PY="$VIRTUAL_ENV/bin/python"
elif [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="$(command -v python3 || command -v python)"
fi
echo "Using $PY"

cd "$ROOT/petras-core"
"$PY" -m pip install -e . -q

# The generator mints fresh URNs and appends; without clearing the layers first,
# every run would add a second copy of the whole demo.
"$PY" - "$ROOT/demos/cathedral-shell" <<'PYCLEAN'
import sys
from pathlib import Path
from petras.extract_structure import clear_destination_layers
clear_destination_layers(Path(sys.argv[1]))
PYCLEAN

"$PY" "$ROOT/scripts/generate_demo_project.py" --out "$ROOT/demos/cathedral-shell"
mkdir -p "$ROOT/viewer/public/demos/cathedral-shell"
"$PY" -m petras export-graph "$ROOT/demos/cathedral-shell" \
  --out "$ROOT/viewer/public/demos/cathedral-shell/graph.json" \
  --layout flow
"$PY" -m petras export-cq "$ROOT/demos/cathedral-shell" \
  --out "$ROOT/viewer/public/demos/cathedral-shell/cq-answers.json" || true
echo "Done."
