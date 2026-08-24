#!/usr/bin/env python3
"""Build a PETRAS project one operation at a time, and watch the graph grow.

Every entity below is written through the ontology API; nothing is hand-authored
as RDF. After each step the script prints the layer counts and the number of
provenance links, so the knowledge graph can be seen accumulating rather than
appearing finished.

Run it::

    python scripts/walkthrough.py --out /tmp/walkthrough
    petras ask --all --project /tmp/walkthrough
    petras validate /tmp/walkthrough
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "petras-core"))

from petras.layers import OntologyLayer  # noqa: E402
from petras.project import Project  # noqa: E402

EPOCH = datetime(2026, 4, 12, 8, 0, tzinfo=timezone.utc)
_counter = {"n": 0}


def urn(kind: str = "") -> str:
    _counter["n"] += 1
    tag = f"{kind}:" if kind else ""
    return f"urn:petras:{tag}{_counter['n']:012x}"


def stamp(minutes: int) -> str:
    return (EPOCH + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


def entity(proj: Project, layer: OntologyLayer, rdf_type: str, label: str,
           minutes: int, **fields) -> str:
    ref = urn(fields.pop("kind", ""))
    proj.write_entity(layer, ref, {
        "@id": ref, "@type": rdf_type, "label": label,
        "createdAt": stamp(minutes), **fields,
    })
    return ref


def link(proj: Project, src: str, dst: str, operator: str, plugin: str,
         minutes: int, **params) -> str:
    ref = urn()
    proj.write_entity(OntologyLayer.DATALINK, ref, {
        "@id": ref, "@type": "DataLink", "label": operator,
        "createdAt": stamp(minutes),
        "mapsFrom": src, "mapsTo": dst,
        "operator": operator, "plugin": plugin, "parameters": params,
    })
    return ref


def report(proj: Project, step: str) -> None:
    counts = proj.layer_counts()
    total = sum(counts.values())
    links = counts.get("datalinks", 0)
    populated = sum(1 for v in counts.values() if v)
    print(f"  {step:<44} {total:>3} entities  {links:>2} links  {populated}/7 layers")


def build(out: Path) -> Project:
    proj = Project.create(out, name="Walkthrough", description="Built command by command")
    print(f"\nBuilding {out}\n")
    report(proj, "empty project")

    # L1 — what came off the instrument, unaltered.
    scan = entity(proj, OntologyLayer.DATALAKE, "SurveyData",
                  "TLS survey, north elevation", 0, format="e57")
    report(proj, "acquisition imported")

    # L2 — the survey acquires geometric meaning.
    cloud = entity(proj, OntologyLayer.DATASET, "DataSet",
                   "Registered point cloud", 5, geometryType="pointcloud", version=1)
    link(proj, scan, cloud, "cloud.import", "acquire", 5, format="e57")
    report(proj, "cloud.import")

    mesh = entity(proj, OntologyLayer.DATASET, "DataSet",
                  "Voxel mesh, 0.25 m", 12, geometryType="voxel", version=1)
    link(proj, cloud, mesh, "cloud2fem.mesh", "cloud2fem", 12, voxelSize=0.25)
    report(proj, "cloud2fem.mesh")

    # L5 — the document a material assignment has to rest on.
    sheet = entity(proj, OntologyLayer.DATASOURCES, "DataSources",
                   "Masonry datasheet", 18, format="pdf")
    link(proj, sheet, mesh, "fem.material", "materials", 18, E_MPa=1500)
    report(proj, "fem.material (evidence anchored)")

    # L4 — an immutable computational fact.
    result = entity(proj, OntologyLayer.DATASTORE, "DataStore",
                    "Linear static result", 25, kind="femresult", analysisType="linear_static")
    link(proj, mesh, result, "fem.solve", "solver", 25, loadCase="self_weight")
    report(proj, "fem.solve")

    # A monitoring stream, anchored to the same geometry as everything else.
    sensor = entity(proj, OntologyLayer.DATALAKE, "IoTStream",
                    "Accelerometer, crown level", 27, nSamples=48, channels=["DX", "DY"])
    link(proj, sensor, mesh, "iot.import", "iot", 27, channels=2)
    report(proj, "iot.import (monitoring anchored)")

    # An external event, dated, that later analyses and reports can be reached from.
    quake = entity(proj, OntologyLayer.DATALAKE, "DataEvent",
                   "Seismic event", 28, eventType="earthquake")
    link(proj, quake, sensor, "event.bind", "events", 28, magnitude=4.1)
    report(proj, "event.bind")

    # A second run from the same mesh: two hypotheses sharing one history.
    result_b = entity(proj, OntologyLayer.DATASTORE, "DataStore",
                      "Linear static result, code values", 26,
                      kind="femresult", analysisType="linear_static")
    link(proj, mesh, result_b, "fem.solve", "solver", 26, loadCase="seismic")
    report(proj, "fem.solve (alternative hypothesis)")

    # L6 — interpretation over the layers below.
    index = entity(proj, OntologyLayer.DATAANALYTICS, "ProjectIndex",
                   "Project index snapshot", 30)
    link(proj, mesh, index, "indexer.build", "indexer", 30, scope="all_layers")
    report(proj, "indexer.build")

    # L7 — the synthesis, citing what it rests on.
    doc = entity(proj, OntologyLayer.DATAREPORTING, "DataReporting",
                 "Assessment report", 36, template="technical",
                 linkedEntities=[result, sheet])
    link(proj, result, doc, "report.compose", "reporting", 36, section="verification")
    report(proj, "report.compose")

    print("\nEvery entity above was written through the ontology API.")
    print("Nothing was authored as RDF by hand.\n")
    print("Next:")
    print(f"  petras ask --all --project {out}")
    print(f"  petras validate {out}")
    print(f"  petras export-graph {out} -o graph.json\n")
    return proj


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=Path("/tmp/petras-walkthrough"))
    ap.add_argument("--clean", action="store_true", help="Remove the target first")
    args = ap.parse_args()

    if args.clean and args.out.exists():
        shutil.rmtree(args.out)
    build(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
