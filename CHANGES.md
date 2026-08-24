# Changes — executable evaluation instruments

This round turned the manuscript's two evaluation instruments from printed listings
into commands a reviewer can run. Everything else in the repository is unchanged.

**Why.** The paper states that each competency question "was translated into a SPARQL
query … and executed against the benchmark instance data", and that all benchmark
entities "validate against the SHACL shapes". Before this round the repository
contained neither SHACL nor SPARQL: the supplement printed them, and nobody could
execute them. The repository's job is not to show the ontology — the paper does that —
but to make those claims checkable.

---

## Added

| File | What it is |
|---|---|
| `ontology/shapes.ttl` | Six SHACL node shapes: the metadata contract, DataLink, DataSet, two lineage shapes, reporting. |
| `queries/cq01.rq` … `cq10.rq` | The ten competency questions as SPARQL. Each file opens with the question it answers. |
| `petras-core/petras/rdf.py` | Loads a project's JSON-LD into an rdflib graph; runs pySHACL and the queries. |
| `scripts/walkthrough.py` | Builds a project one operation at a time, printing the graph as it grows. |
| `.github/workflows/pages.yml` | Builds and deploys the viewer to GitHub Pages. |

## Two new commands

```bash
petras validate demos/cathedral-shell      # SHACL conformance; non-zero exit if it fails
petras ask                                 # list the ten competency questions
petras ask CQ4 --project demos/cathedral-shell
petras ask --all --project demos/cathedral-shell
```

`petras ask` **exits non-zero if any question returns no rows**. An unanswered
competency question is a failure of the demonstration, not a query that happens to
match nothing.

## Changed

- **`ontology/context.jsonld`** — added `"@vocab": "https://w3id.org/petras/ontology#"`.
  See *Defects found*, first item.
- **`petras-core/petras/__main__.py`** — `cmd_validate` and `cmd_ask`, following the
  existing `cmd_*` + `set_defaults(func=…)` pattern. Five commands became seven.
- **`petras-core/pyproject.toml`** — optional extra `rdf = ["rdflib>=7.0", "pyshacl>=0.26"]`,
  so the core install stays at two light dependencies. Install with
  `pip install -e "./petras-core[rdf]"`.
- **`.github/workflows/ci.yml`** — two steps run `petras validate` and `petras ask --all`
  on every push. The badge now reports that the paper's shapes still validate and its
  competency questions still answer, rather than only that the tests pass.
- **`scripts/build_demo_graphs.sh`** — see *Defects found*, fourth item.
- **`README.md`** — opens with a table mapping each claim in the paper to the command
  that verifies it.

## Design notes

**Layer membership is asserted, not inferred.** `project_graph()` adds
`<entity> petras:inLayer petras:DataSet` from the directory that holds the entity. In
PETRAS the layer *is* structural, so this records a fact rather than deriving one, and
it lets a query select by layer without an OWL reasoner over the subclass hierarchy.

**Lineage is traversed through DataLinks, not through source fields.** A derivation
edge from `X` to `Y` exists when a DataLink has `mapsFrom X` and `mapsTo Y`, written in
SPARQL as `^petras:mapsFrom/petras:mapsTo` and made transitive with `+`. Only these are
typed as IRIs in the context, and they are what the paper argues reconstructs the chain.

**The context is resolved locally.** Entities declare
`@context: https://w3id.org/petras/context.jsonld`; fetching that at validation time
would make the result depend on the network, so the local `ontology/context.jsonld` is
substituted before parsing. What a reviewer validates is what this repository ships.

---

## Defects found — because the instruments now execute

**1. Twelve of fifteen entity types had no IRI.** `FEMResultSet`, `FEMModel`,
`SensorRecord`, `TemporalEvent`, `ProjectReport`, `MaterialDefinition` and others were
absent from the JSON-LD context, so they lost their type on conversion to RDF. Fixed by
one line — `@vocab` — which also means future subtypes get an IRI without touching the
context, consistent with the extensibility argument the paper now makes.

**2. The supplement's SHACL shapes are not executable.** They target
`petras:hasEvent`, `basedOnDataSet`, `basedOnEvent`, `hasRecommendation`,
`decisionTime`, `indexSchemaVersion`, `hasStatistics`, `usesModel`, `prov:used` and
`geometryURI` — none of which the context emits. `sourceDatalakeIDs` is wrong outright:
the context produces `petras:sourceDatalake`. A shape targeting a predicate that is
never emitted constrains nothing. The shapes here were written against what the
ontology actually emits.

> **Open:** the supplement and `ontology/shapes.ttl` now disagree. A reviewer comparing
> them will notice. Either align the supplement or state the divergence.

**3. The benchmark shell does not fully validate.** `urn:petras:datalink:36c4cae013a8`
has no `createdAt`, producing two violations. The paper says "All 152 entities validate
against the SHACL shapes"; that is not currently true of this entity. Separately, 153
entities carry no label — reported as warnings, not violations, since a missing name is
a documentation defect rather than a structural one.

**4. `scripts/build_demo_graphs.sh` was broken in two ways.** It invoked a bare
`python`, which does not exist on a stock macOS shell, so the first command in the
README failed. And the generator mints fresh URNs and appends without clearing, so a
second run took the demo from 49 entities to 98. It now detects the interpreter
(active venv → repo venv → `python3`) and clears the layers first, reusing
`clear_destination_layers` from `extract_structure.py`. Verified idempotent.

> **Note:** demo URNs are random per generation, so regenerating rewrites every entity
> file and produces a very large diff. The committed demo was left untouched here, and
> all verification below ran against it.

---

## Verification

| Check | Result |
|---|---|
| `pytest petras-core/tests -q` | 9 passed |
| `petras validate demos/cathedral-shell` | conforms, 0 violations |
| `petras ask --all --project demos/cathedral-shell` | 10 questions, none empty |
| `python scripts/walkthrough.py --clean` | 19 entities, 9 links, 7/7 layers; validates; all 10 answered |
| `bash scripts/build_demo_graphs.sh` (twice) | 49 entities both times |
| `cd viewer && npm run build` | OK |

---

## Manuscript edits made in the same round

In `AUT_CON/manuscript.tex`, marked with the `\add{}` colour:

- Evaluation section: a sentence stating that the shapes and the queries are published
  as executable artifacts, not listings only.
- Data availability: the ontology serialization, the ten queries and the demonstration
  project are openly available, with the viewer.

Both carry a **`REPOSITORY URL` placeholder** — this repository has no git remote yet,
so the address is unknown. Replace before submission.

## Still to do

1. Replace the two `REPOSITORY URL` placeholders in the manuscript.
2. Create the public repository and enable Pages (Settings → Pages → source
   *GitHub Actions*); the workflow is ready but inert until then.
3. Decide what to do about defect 2: align the supplement's shapes, or declare the
   divergence.
4. Fix or remove the untimestamped DataLink behind defect 3, so the paper's validation
   claim holds on the shipped benchmark shell.
