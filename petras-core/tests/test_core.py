"""Unit tests for petras-core."""
from __future__ import annotations

import json
from pathlib import Path

from petras.demo import generate_demo_project
from petras.export_graph import export_graph
from petras.graph import build_project_graph, provenance_subgraph
from petras.ids import new_urn, translate_urn_to_petras
from petras.layers import OntologyLayer
from petras.layout import compute_layout
from petras.legacy_import import translate_entity
from petras.project import Project


def test_new_urn_prefix() -> None:
    urn = new_urn()
    assert urn.startswith("urn:petras:")
    assert "c2f4dt" not in urn


def test_translate_urn() -> None:
    assert translate_urn_to_petras("urn:c2f4dt:abc123def456") == "urn:petras:abc123def456"


def test_demo_project_covers_seven_layers(tmp_path: Path) -> None:
    proj = generate_demo_project(tmp_path / "demo")
    counts = proj.layer_counts()
    assert all(counts[d] > 0 for d in counts)
    assert counts["datalinks"] >= 15
    # No c2f4dt strings in written files
    for path in (tmp_path / "demo").rglob("*.jsonld"):
        text = path.read_text(encoding="utf-8")
        assert "c2f4dt" not in text
        assert "urn:petras:" in text
    assert (tmp_path / "demo" / "petras.json").is_file()


def test_build_and_export_graph(tmp_path: Path) -> None:
    proj = generate_demo_project(tmp_path / "demo")
    graph, meta = build_project_graph(proj)
    assert graph.number_of_nodes() >= 20
    assert graph.number_of_edges() >= 15
    positions = compute_layout(graph, meta, layout="flow")
    assert len(positions) == graph.number_of_nodes()
    out = tmp_path / "graph.json"
    payload = export_graph(proj.root, out, layout="flow")
    assert payload["stats"]["nodeCount"] == graph.number_of_nodes()
    assert out.is_file()


def test_provenance_subgraph(tmp_path: Path) -> None:
    proj = generate_demo_project(tmp_path / "demo")
    graph, meta = build_project_graph(proj)
    # Pick a FEMResultSet if present
    target = None
    for cid, m in meta.items():
        data = m.get("data") or {}
        if data.get("@type") == "FEMResultSet":
            target = cid
            break
    assert target
    sub = provenance_subgraph(graph, target)
    assert target in sub
    assert sub.number_of_nodes() >= 2


def test_legacy_entity_translation() -> None:
    raw = {
        "@context": "https://c2f4dt.org/context.jsonld",
        "@id": "urn:c2f4dt:aabbccddeeff",
        "@type": "DataSet",
        "sourceDatalakeIDs": ["urn:c2f4dt:112233445566"],
    }
    out = translate_entity(raw)
    assert out["@id"] == "urn:petras:aabbccddeeff"
    assert out["sourceDatalakeIDs"] == ["urn:petras:112233445566"]
    assert "c2f4dt" not in json.dumps(out)


def test_open_petras_project(tmp_path: Path) -> None:
    Project.create(tmp_path / "empty", name="Empty")
    opened = Project.open(tmp_path / "empty")
    assert opened.config["ontology"] == "PETRAS"
    assert opened.list_entities(OntologyLayer.DATALAKE) == []
