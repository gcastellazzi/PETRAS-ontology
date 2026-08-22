# PETRAS Ontology — Graph Viewer

Standalone web tooling for the **PETRAS** ontology
(*Provenance-Enabled digital Twin ontology for Restoration and Structural Analysis*).

This repository is **independent of the C2F4DTc desktop application**. It implements
the PETRAS project file format and visualises **connectivity / provenance graphs**
with the same seven-layer colour semantics used in the reference desktop maps.

## Features (v1)

- Canonical PETRAS project layout (`petras.json`, `urn:petras:…`, `entity.jsonld`)
- Empty-shell demo project covering all **7 layers** (core + service)
- Project concept map and per-entity provenance neighbourhood
- Static React viewer suitable for GitHub Pages
- Optional read-only import of legacy C2F4DT projects (`--legacy`)

## Quick start

```bash
# Python tooling
python3 -m venv .venv
source .venv/bin/activate
pip install -e "./petras-core[dev]"

# Demo project + graph JSON
petras generate-demo --out demos/cathedral-shell
petras export-graph demos/cathedral-shell \
  -o viewer/public/demos/cathedral-shell/graph.json

# Viewer
cd viewer && npm install && npm run dev
```

Or regenerate everything with:

```bash
bash scripts/build_demo_graphs.sh
```

## Repository layout

```
ontology/          # petras.ttl + context.jsonld (w3id.org/petras)
petras-core/       # Python I/O + graph + layout (no C2F4DT dependency)
viewer/            # React + Vite graph viewer
demos/             # cathedral-shell empty project
docs/              # project format + layer guide
scripts/           # demo generation helpers
```

## Naming rule

Every identifier that historically used `c2f4dt` / `c2f:` is written as `petras`
in this repository. See [docs/project-format.md](docs/project-format.md).

## License

Ontology and documentation: [CC BY 4.0](LICENSE).
