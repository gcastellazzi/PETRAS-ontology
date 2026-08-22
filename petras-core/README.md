# petras-core

Standalone Python library for PETRAS project I/O and connectivity graphs.
Zero dependency on the C2F4DTc desktop application.

```bash
pip install -e ".[dev]"
petras generate-demo --out ../demos/cathedral-shell
petras export-graph ../demos/cathedral-shell -o ../viewer/public/demos/cathedral-shell/graph.json
pytest
```
