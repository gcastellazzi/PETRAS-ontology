"""Export a PETRAS project connectivity graph to JSON."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .graph import build_project_graph, provenance_subgraph, serialize_graph
from .layout import compute_layout
from .project import Project


def export_graph(
    project_path: Path,
    out_path: Path,
    *,
    layout: str = "flow",
    entity_id: str | None = None,
    translate_legacy: bool = False,
    hide_missing: bool = False,
) -> dict:
    project = Project.open(project_path, translate_legacy=translate_legacy)
    graph, node_meta = build_project_graph(project)
    if entity_id:
        graph = provenance_subgraph(graph, entity_id)
        node_meta = {k: v for k, v in node_meta.items() if k in graph}
    if hide_missing:
        keep = [
            n
            for n in graph.nodes()
            if not (
                not (node_meta.get(str(n), {}).get("data") or {})
                and not str(node_meta.get(str(n), {}).get("layer", "")).strip()
            )
        ]
        graph = graph.subgraph(keep).copy()
        node_meta = {k: v for k, v in node_meta.items() if k in graph}

    positions = compute_layout(graph, node_meta, layout=layout)
    payload = serialize_graph(graph, node_meta, positions, layout=layout)
    payload["project"] = project.summary()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export PETRAS project graph to JSON")
    parser.add_argument("project", type=Path, help="Path to PETRAS project directory")
    parser.add_argument("--out", "-o", type=Path, required=True, help="Output graph.json")
    parser.add_argument("--layout", default="flow", help="Layout: flow|layered|spring|isometric|circular")
    parser.add_argument("--entity", default=None, help="Optional entity URN for provenance subgraph")
    parser.add_argument("--legacy", action="store_true", help="Translate legacy C2F4DT identifiers")
    parser.add_argument("--hide-missing", action="store_true", help="Drop missing/referenced-only nodes")
    args = parser.parse_args(argv)
    payload = export_graph(
        args.project,
        args.out,
        layout=args.layout,
        entity_id=args.entity,
        translate_legacy=args.legacy,
        hide_missing=args.hide_missing,
    )
    print(
        f"Wrote {args.out} "
        f"({payload['stats']['nodeCount']} nodes, {payload['stats']['edgeCount']} edges)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
