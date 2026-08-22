#!/usr/bin/env python3
"""Validate graph reading against Project_PETRAS_Benchmark (legacy format).

Compares layer population against the manuscript snapshot (7/7 layers) and
prints current counts. Does not fail if the live benchmark grew beyond the
paper snapshot (152 entities / 42 DataLinks).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Paper snapshot (tab:casestudy-layer-stats)
PAPER_MIN_LAYERS = {
    "datalake": 1,
    "datasets": 1,
    "datalinks": 1,
    "datastore": 1,
    "datasources": 1,
    "analytics": 1,
    "reports": 1,
}

DEFAULT_BENCHMARK = Path(
    "/Users/gcastellazzi/Dropbox/PETRAS_exchange/Project_PETRAS_Benchmark"
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project",
        type=Path,
        default=DEFAULT_BENCHMARK,
        help="Path to legacy C2F4DT / PETRAS benchmark project",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional path to write exported graph.json",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "petras-core"))

    from petras.export_graph import export_graph
    from petras.graph import build_project_graph
    from petras.project import Project

    if not args.project.is_dir():
        print(f"Benchmark not found: {args.project}", file=sys.stderr)
        return 2

    proj = Project.open(args.project, translate_legacy=True)
    assert proj.is_legacy, "Expected legacy c2f4dt.json manifest"
    summary = proj.summary()
    counts = summary["layerCounts"]
    print("Project:", summary["name"])
    print("Layer counts (live benchmark):")
    for layer, n in counts.items():
        print(f"  {layer}: {n}")
    print(f"  total entities: {summary['totalEntities']}")

    missing = [layer for layer, need in PAPER_MIN_LAYERS.items() if counts.get(layer, 0) < need]
    if missing:
        print("FAIL: layers not populated:", ", ".join(missing), file=sys.stderr)
        return 1
    print("OK: all 7 layers populated (paper criterion)")

    graph, meta = build_project_graph(proj)
    ops = sorted(
        {
            str(attrs.get("operator", "")).strip()
            for _, _, attrs in graph.edges(data=True)
            if str(attrs.get("operator", "")).strip()
        }
    )
    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
    print(f"Distinct operators ({len(ops)}):")
    for op in ops[:40]:
        print(f"  - {op}")
    if len(ops) > 40:
        print(f"  … {len(ops) - 40} more")

    # Paper names vs live plugin command strings (same semantic roles).
    expected_ops = {
        "cloud.import": {"cloud.import", "import_cloud", "acquire_cloud.import"},
        "cloud.inspect": {"cloud.inspect", "inspect_cloud", "inspect_cloud.compare_fem", "inspect_cloud.group_rules"},
        "cloud.slice": {"cloud.slice", "slice_cloud"},
        "cloud2fem.mesh": {"cloud2fem.mesh", "cloud2fem_mesh"},
        "fem.model": {"fem.model", "finetools_engine.model"},
        "fem.material": {"fem.material", "finetools_engine.material", "diagnostics.material"},
        "fem.solve": {"fem.solve", "finetools_engine.solve"},
        "fem.job": {"fem.job", "finetools_engine.job"},
        "documents.attach": {"documents.attach"},
    }
    op_set = set(ops)
    found = [name for name, aliases in expected_ops.items() if op_set & aliases]
    missing = [name for name in expected_ops if name not in found]
    print(f"Benchmark operator roles found: {len(found)}/{len(expected_ops)}")
    for op in missing:
        print(f"  (missing from live graph) {op}")

    # Sample translated entity has no c2f4dt when translated
    sample_layer = next(iter(counts))
    from petras.layers import DIR_TO_LAYER

    layer = DIR_TO_LAYER[sample_layer]
    storage_ids = proj.list_entities(layer)
    if storage_ids:
        ent = proj.read_entity(layer, storage_ids[0])
        blob = json.dumps(ent)
        if "c2f4dt" in blob:
            print("FAIL: translated entity still contains c2f4dt", file=sys.stderr)
            return 1
        print("OK: legacy entity translation strips c2f4dt from in-memory JSON-LD")

    if args.out:
        export_graph(
            args.project,
            args.out,
            layout="flow",
            translate_legacy=True,
            hide_missing=False,
        )
        print(f"Wrote {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
