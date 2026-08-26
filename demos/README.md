# Demo projects

| Demo | Description |
|------|-------------|
| `cathedral-shell/` | **Demo Project** — synthetic empty-shell PETRAS demonstrator (canonical format). All 7 layers with metadata + DataLinks only. Used by the static viewer. |
| `benchmark-shell/` | Structure extracted from `Project_PETRAS_Benchmark` (JSON-LD only, bulk arrays stripped, no NPZ/PDF). Regenerated with `petras extract-structure`. |
| `benchmark-graph/` | Pre-exported `graph.json` from the live benchmark (optional). |

## Extract structure from any project

```bash
source .venv/bin/activate
petras extract-structure /path/to/Project_PETRAS_Benchmark demos/benchmark-shell --clean

# Also write empty placeholders for skipped binaries:
petras extract-structure /path/to/project /tmp/shell --placeholders
```

Or:

```bash
python scripts/extract_structure.py SOURCE DEST --clean
```

Regenerate the cathedral demo:

```bash
source .venv/bin/activate
bash scripts/build_demo_graphs.sh
```
