"""Build PETRAS connectivity graphs from project JSON-LD.

Ported and adapted from C2F4DTc ``concept_map.build_project_graph`` — no Qt/Matplotlib.
"""
from __future__ import annotations

from typing import Any

import networkx as nx

from .ids import canonical_from_storage_id, short_entity_id
from .layers import DIR_TO_LAYER, LAYER_ORDER, OntologyLayer
from .project import Project
from .styles import LAYER_COLORS, LAYER_LABELS


def _split_entity_refs(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        out: list[str] = []
        for item in value:
            out.extend(_split_entity_refs(item))
        return out
    text = str(value).strip()
    if not text:
        return []
    refs = [text]
    for sep in (",", ";", "|"):
        next_refs: list[str] = []
        for ref in refs:
            if sep in ref:
                next_refs.extend(part.strip() for part in ref.split(sep))
            else:
                next_refs.append(ref.strip())
        refs = next_refs
    return [ref for ref in refs if ref]


def _build_storage_lookup(node_meta: dict[str, dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for cid, meta in node_meta.items():
        storage = str(meta.get("storage", "")).strip()
        if storage:
            out[storage] = cid
        out.setdefault(str(cid).replace(":", "_").replace("/", "_"), str(cid))
    return out


def _normalize_entity_ref(
    ref: str,
    storage_lookup: dict[str, str],
    known_nodes: set[str],
) -> str:
    token = str(ref or "").strip()
    if not token:
        return ""
    if token in known_nodes:
        return token
    if token in storage_lookup:
        return storage_lookup[token]

    candidates: list[str] = [token]
    guessed = canonical_from_storage_id(token)
    if guessed:
        candidates.append(guessed)

    for cand in candidates:
        if cand in known_nodes:
            return cand
        mapped = storage_lookup.get(cand)
        if mapped:
            return mapped
        guessed = canonical_from_storage_id(cand)
        if guessed and guessed in known_nodes:
            return guessed

    for cand in candidates:
        if cand.startswith("urn:petras:") or cand.startswith("urn:c2f4dt:"):
            return cand
    return token


def _iter_datalink_edges(link_data: dict[str, Any]) -> list[tuple[str, str]]:
    src_values = _split_entity_refs(link_data.get("mapsFrom", link_data.get("maps_from", "")))
    dst_values = _split_entity_refs(link_data.get("mapsTo", link_data.get("maps_to", "")))
    if not src_values:
        params = link_data.get("parameters", {})
        if isinstance(params, dict):
            src_values.extend(_split_entity_refs(params.get("source")))
            src_values.extend(_split_entity_refs(params.get("source1")))
            src_values.extend(_split_entity_refs(params.get("source2")))
    out: list[tuple[str, str]] = []
    for src in src_values:
        for dst in dst_values:
            if src and dst:
                out.append((src, dst))
    return out


def _sort_datalink_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (
            0 if str(row.get("created_at", "")).strip() else 1,
            str(row.get("created_at", "")).strip(),
            int(row.get("order", 0)),
        ),
    )


def _is_agent_created_link(operator: str, plugin: str) -> bool:
    op = str(operator or "").strip().lower()
    plg = str(plugin or "").strip().lower()
    if plg != "assistant":
        return False
    return op in {"assistant.agent.created", "assistant.apply.created"}


def _iter_inferred_edges(data: dict[str, Any], target_id: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    scalar_keys = (
        ("sourceMeshDatasetId", "source mesh"),
        ("sourceDatasetId", "source dataset"),
        ("source_dataset", "source dataset"),
        ("sourceModelId", "source model"),
    )
    list_keys = (
        ("sourceDatasetIDs", "source dataset"),
        ("source_dataset_ids", "source dataset"),
        ("sourceDatalakeIDs", "source datalake"),
        ("source_datalake_ids", "source datalake"),
        ("inputs", "input"),
    )
    for key, relation in scalar_keys:
        for src in _split_entity_refs(data.get(key)):
            if src and src != target_id:
                out.append((src, relation))
    for key, relation in list_keys:
        for src in _split_entity_refs(data.get(key)):
            if src and src != target_id:
                out.append((src, relation))
    return out


def _iter_inferred_out_edges(data: dict[str, Any], source_id: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    # A report records what it cites in referencedEntities, and nothing was
    # turning that into edges: the DataReporting layer came out with every
    # entity isolated, so the default "hide unconnected" filter emptied it and
    # the map showed no reports at all.
    for key, relation in (("linkedEntities", "documents"), ("referencedEntities", "cites")):
        for dst in _split_entity_refs(data.get(key)):
            if dst and dst != source_id:
                out.append((dst, relation))
    return out


def build_project_graph(
    project: Project,
) -> tuple[nx.DiGraph, dict[str, dict[str, Any]]]:
    """Build a full DiGraph from all 7 ontology layers + DataLinks."""
    graph = nx.DiGraph()
    node_meta: dict[str, dict[str, Any]] = {}

    for layer_dir, layer in DIR_TO_LAYER.items():
        for storage_id in project.list_entities(layer):
            try:
                data = project.read_entity(layer, storage_id)
            except Exception:
                continue
            cid = str(data.get("@id", storage_id))
            node_meta[cid] = {
                "layer": layer_dir,
                "storage": storage_id,
                "data": data,
            }
            graph.add_node(cid)

    storage_lookup = _build_storage_lookup(node_meta)
    known_nodes = set(node_meta.keys())

    datalink_rows: list[dict[str, Any]] = []
    row_order = 0
    for link_storage in project.list_entities(OntologyLayer.DATALINK):
        try:
            ld = project.read_entity(OntologyLayer.DATALINK, link_storage)
        except Exception:
            continue
        for src_raw, dst_raw in _iter_datalink_edges(ld):
            src = _normalize_entity_ref(src_raw, storage_lookup, known_nodes)
            dst = _normalize_entity_ref(dst_raw, storage_lookup, known_nodes)
            if not src or not dst:
                continue
            datalink_rows.append(
                {
                    "src": src,
                    "dst": dst,
                    "operator": str(ld.get("operator", "")).strip(),
                    "plugin": str(ld.get("plugin", "")).strip(),
                    "datalink_id": str(ld.get("@id", link_storage)).strip(),
                    "created_at": str(ld.get("createdAt", "")).strip(),
                    "order": row_order,
                }
            )
            row_order += 1

    for seq, row in enumerate(_sort_datalink_rows(datalink_rows), start=1):
        src = str(row.get("src", "")).strip()
        dst = str(row.get("dst", "")).strip()
        if not src or not dst:
            continue
        op = str(row.get("operator", "")).strip()
        plugin = str(row.get("plugin", "")).strip()
        edge_kind = "assistant_agent" if _is_agent_created_link(op, plugin) else "datalink"
        if src not in node_meta:
            node_meta[src] = {"layer": "unknown", "storage": "", "data": {}}
            graph.add_node(src)
        if dst not in node_meta:
            node_meta[dst] = {"layer": "unknown", "storage": "", "data": {}}
            graph.add_node(dst)
        if graph.has_edge(src, dst):
            attrs = graph.edges[(src, dst)]
            ops = attrs.get("operators", [])
            if not isinstance(ops, list):
                ops = []
            if op and op not in ops:
                ops.append(op)
            attrs["operators"] = ops
            attrs["operator"] = op or str(attrs.get("operator", "")).strip()
            attrs["plugin"] = plugin or str(attrs.get("plugin", "")).strip()
            attrs["edge_count"] = int(attrs.get("edge_count", 1) or 1) + 1
            first_seq = attrs.get("sequence_first")
            if not isinstance(first_seq, int) or first_seq <= 0:
                first_seq = seq
            attrs["sequence_first"] = min(first_seq, seq)
            attrs["sequence_last"] = seq
            if edge_kind == "assistant_agent":
                attrs["edge_kind"] = edge_kind
            continue

        graph.add_edge(
            src,
            dst,
            operator=op,
            plugin=plugin,
            edge_kind=edge_kind,
            datalink_id=str(row.get("datalink_id", "")),
            operators=[op] if op else [],
            edge_count=1,
            sequence_first=seq,
            sequence_last=seq,
        )

    for cid, meta in list(node_meta.items()):
        data = meta.get("data")
        if not isinstance(data, dict):
            continue
        for src_raw, relation in _iter_inferred_edges(data, cid):
            src = _normalize_entity_ref(src_raw, storage_lookup, known_nodes)
            if not src:
                continue
            if src not in node_meta:
                node_meta[src] = {"layer": "unknown", "storage": "", "data": {}}
                graph.add_node(src)
            if graph.has_edge(src, cid):
                continue
            graph.add_edge(src, cid, operator=relation, plugin="inferred", edge_kind="inferred")
        for dst_raw, relation in _iter_inferred_out_edges(data, cid):
            dst = _normalize_entity_ref(dst_raw, storage_lookup, known_nodes)
            if not dst:
                continue
            if dst not in node_meta:
                node_meta[dst] = {"layer": "unknown", "storage": "", "data": {}}
                graph.add_node(dst)
            if graph.has_edge(cid, dst):
                continue
            graph.add_edge(cid, dst, operator=relation, plugin="inferred", edge_kind="inferred")

    return graph, node_meta


def provenance_subgraph(
    graph: nx.DiGraph,
    entity_id: str,
    *,
    max_hops: int = 8,
) -> nx.DiGraph:
    """Return the undirected neighbourhood of *entity_id* (ancestors + descendants)."""
    if entity_id not in graph:
        return nx.DiGraph()
    keep: set[str] = {entity_id}
    # Ancestors
    frontier = {entity_id}
    for _ in range(max_hops):
        nxt: set[str] = set()
        for node in frontier:
            nxt.update(graph.predecessors(node))
        nxt -= keep
        if not nxt:
            break
        keep |= nxt
        frontier = nxt
    # Descendants
    frontier = {entity_id}
    for _ in range(max_hops):
        nxt = set()
        for node in frontier:
            nxt.update(graph.successors(node))
        nxt -= keep
        if not nxt:
            break
        keep |= nxt
        frontier = nxt
    return graph.subgraph(keep).copy()


def entity_display_label(cid: str, node_meta: dict[str, dict[str, Any]]) -> str:
    meta = node_meta.get(cid, {})
    data = meta.get("data") if isinstance(meta.get("data"), dict) else {}
    for key in ("label", "name", "title", "description"):
        value = data.get(key) if isinstance(data, dict) else None
        if isinstance(value, str) and value.strip():
            text = value.strip()
            return text if len(text) <= 48 else text[:45] + "…"
    etype = str(data.get("@type", "")).strip() if isinstance(data, dict) else ""
    if etype:
        return f"{etype}\n{short_entity_id(cid)}"
    layer = str(meta.get("layer", "")).strip()
    if not data and not layer:
        return f"(missing)\n{short_entity_id(cid)}"
    return short_entity_id(cid)


def is_missing_node(cid: str, node_meta: dict[str, dict[str, Any]]) -> bool:
    meta = node_meta.get(cid, {})
    data = meta.get("data")
    if not isinstance(data, dict):
        data = {}
    return not data and not str(meta.get("layer", "")).strip()


def serialize_graph(
    graph: nx.DiGraph,
    node_meta: dict[str, dict[str, Any]],
    positions: dict[str, tuple[float, float]],
    *,
    layout: str = "flow",
) -> dict[str, Any]:
    """Serialize graph + layout to the JSON contract consumed by the viewer."""
    nodes = []
    for nid in graph.nodes():
        cid = str(nid)
        meta = node_meta.get(cid, {})
        layer = str(meta.get("layer", "unknown") or "unknown")
        data = meta.get("data") if isinstance(meta.get("data"), dict) else {}
        x, y = positions.get(cid, (0.0, 0.0))
        degree = int(graph.in_degree(cid) + graph.out_degree(cid))
        size = 12.0 + min(24.0, degree * 2.0)
        nodes.append(
            {
                "id": cid,
                "label": entity_display_label(cid, node_meta),
                "layer": layer,
                "type": str(data.get("@type", "") if isinstance(data, dict) else ""),
                "x": float(x),
                "y": float(y),
                "size": size,
                "color": LAYER_COLORS.get(layer, LAYER_COLORS["unknown"]),
                "missing": is_missing_node(cid, node_meta),
                "data": {
                    k: v
                    for k, v in (data or {}).items()
                    if k in {"@id", "@type", "label", "name", "description", "operator", "plugin", "createdAt"}
                },
            }
        )

    edges = []
    for u, v, attrs in graph.edges(data=True):
        edges.append(
            {
                "source": str(u),
                "target": str(v),
                "operator": str(attrs.get("operator", "")),
                "plugin": str(attrs.get("plugin", "")),
                "datalinkId": str(attrs.get("datalink_id", "")),
                "edgeKind": str(attrs.get("edge_kind", "datalink")),
                "sequence": attrs.get("sequence_last"),
            }
        )

    layers = [
        {
            "id": layer_dir,
            "label": LAYER_LABELS.get(layer_dir, layer_dir),
            "color": LAYER_COLORS.get(layer_dir, LAYER_COLORS["unknown"]),
            "group": "core" if layer_dir in ("datalake", "datasets", "datalinks", "datastore") else "service",
        }
        for layer_dir in LAYER_ORDER
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "layout": layout,
        "layers": layers,
        "stats": {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
        },
    }
