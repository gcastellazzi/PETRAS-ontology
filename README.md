# PETRAS Ontology — Graph Viewer

Standalone web tooling for the **PETRAS** ontology
(*Provenance-Enabled digital Twin ontology for Restoration and Structural Analysis*).

This repository is **independent of the C2F4DTc desktop application**. It implements
the PETRAS project file format and visualises **connectivity / provenance graphs**
with the same seven-layer colour semantics used in the reference desktop maps.

## Features (v1)

- Canonical PETRAS project layout (`petras.json`, `urn:petras:…`, `entity.jsonld`)
- Empty-shell demo project covering all **7 layers** (core + service)
- `petras extract-structure` — copy project tree without binaries / bulk arrays
- Project concept map and per-entity provenance neighbourhood
- Static React viewer suitable for GitHub Pages
- SHACL shapes and the ten competency-question queries, executable (`validate`, `ask`)
- Optional read-only import of legacy C2F4DT projects (`--legacy`)

## What the paper claims, and how to check it here

Every row is a claim made in the manuscript and the command that verifies it.
Nothing below needs an account, a server, or the desktop application.

| Claim in the paper | Command | Expected |
|---|---|---|
| The ontology is serialized in JSON-LD and validated with SHACL | `petras validate demos/cathedral-shell` | `conforms: True`, 0 violations |
| Each competency question is answered by SPARQL over the populated ontology | `petras ask --all --project demos/cathedral-shell` | 10 questions, none empty |
| One competency question, in isolation | `petras ask CQ4` | the cloud-to-mesh correspondences |
| Entities are produced by operators, not authored by hand | `python scripts/walkthrough.py --clean` | the graph growing, step by step |
| All seven layers are populated through ordinary use | `petras summary demos/cathedral-shell` | 7/7 layers |
| The structure of a real project, without its payloads | `petras summary demos/benchmark-shell` | the benchmark census |

The queries live in [`queries/`](queries/), one file per competency question, each
opening with the question it answers. The shapes are in
[`ontology/shapes.ttl`](ontology/shapes.ttl). Both are read by `petras-core`; neither
is generated, so what you run is what the paper describes.

`petras ask` exits non-zero if any question returns no rows: an unanswered
competency question is a failure of the demonstration, not a query that happens
to match nothing. The same two commands run in CI on every push.

## Quick start

```bash
# Python tooling
python3 -m venv .venv
source .venv/bin/activate
pip install -e "./petras-core[rdf]"

# Demo project + graph JSON
petras generate-demo --out demos/cathedral-shell
petras export-graph demos/cathedral-shell \
  -o viewer/public/demos/cathedral-shell/graph.json
petras export-cq demos/cathedral-shell \
  -o viewer/public/demos/cathedral-shell/cq-answers.json

# Structure-only shell from a real project (no NPZ/PDF; large JSON arrays stubbed)
petras extract-structure /path/to/Project_PETRAS_Benchmark \
  demos/benchmark-shell --clean

# Viewer (graph + CQ1–CQ10 answer panel, same results as `petras ask`)
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
demos/             # demo-project (cathedral-shell/) + benchmark-shell
docs/              # project format + layer guide
queries/           # cq01..cq10.rq — the competency questions as SPARQL
scripts/           # demo generation, structure extract, guided walkthrough
```

## Naming rule

Every identifier that historically used `c2f4dt` / `c2f:` is written as `petras`
in this repository. See [docs/project-format.md](docs/project-format.md).

## License

Ontology and documentation: [CC BY 4.0](LICENSE).
