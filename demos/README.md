# Demo projects

| Demo | Description |
|------|-------------|
| `cathedral-shell/` | Empty-shell PETRAS project (canonical format). All 7 layers populated with metadata + DataLinks only — no NPZ/PDF. Used by the static viewer. |
| `benchmark-graph/` | Graph JSON exported from the live `Project_PETRAS_Benchmark` (legacy C2F4DT on-disk format) via `petras export-graph --legacy`. Regenerated with `scripts/validate_benchmark.py --out …`. |

Regenerate the cathedral demo:

```bash
source .venv/bin/activate
bash scripts/build_demo_graphs.sh
```
