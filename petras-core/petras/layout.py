"""Graph layout algorithms for PETRAS concept maps.

Ported from C2F4DTc ``concept_map`` (flow / layered / isometric / spring).
"""
from __future__ import annotations

import math
from typing import Any

import networkx as nx

from .layers import LAYER_ORDER


def compute_layout(
    graph: nx.DiGraph,
    node_meta: dict[str, dict[str, Any]],
    layout: str = "flow",
) -> dict[str, tuple[float, float]]:
    """Return ``{node_id: (x, y)}`` for the requested layout name."""
    name = str(layout or "flow").strip().lower()
    if name in {"flow", "flow (few crossings)", "sugiyama"}:
        return _flow_positions(graph)
    if name in {"layered", "layer"}:
        return _layered_positions(graph, node_meta)
    if name in {"isometric", "isometric layers"}:
        pos, _ = _isometric_positions(graph, node_meta)
        return pos
    if name in {"spring", "force"}:
        if graph.number_of_nodes() == 0:
            return {}
        raw = nx.spring_layout(graph, seed=42)
        return {str(k): (float(v[0]), float(v[1])) for k, v in raw.items()}
    if name in {"circular", "circle"}:
        if graph.number_of_nodes() == 0:
            return {}
        raw = nx.circular_layout(graph)
        return {str(k): (float(v[0]), float(v[1])) for k, v in raw.items()}
    return _flow_positions(graph)


def _layer_index(cid: str, node_meta: dict[str, dict[str, Any]]) -> int:
    layer = str(node_meta.get(cid, {}).get("layer", "") or "unknown")
    return LAYER_ORDER.index(layer) if layer in LAYER_ORDER else len(LAYER_ORDER)


def _ordered_layer_buckets(
    graph: nx.DiGraph,
    node_meta: dict[str, dict[str, Any]],
    *,
    sweeps: int = 8,
) -> list[list[str]]:
    buckets: dict[int, list[str]] = {}
    for node_id in graph.nodes:
        buckets.setdefault(_layer_index(str(node_id), node_meta), []).append(str(node_id))
    for depth in buckets:
        buckets[depth].sort()
    depths = sorted(buckets)
    if len(depths) < 2:
        return [buckets[d] for d in depths]

    connected: dict[int, list[str]] = {}
    isolated: dict[int, list[str]] = {}
    for depth in depths:
        connected[depth] = [n for n in buckets[depth] if graph.degree(n) > 0]
        isolated[depth] = [n for n in buckets[depth] if graph.degree(n) == 0]

    order: dict[str, float] = {}

    def _renormalise(depth: int) -> None:
        members = connected[depth]
        last = max(1, len(members) - 1)
        for idx, node_id in enumerate(members):
            order[node_id] = idx / last

    for depth in depths:
        _renormalise(depth)

    for sweep in range(max(1, int(sweeps))):
        forward = sweep % 2 == 0
        sequence = depths[1:] if forward else list(reversed(depths[:-1]))
        for depth in sequence:
            members = connected[depth]
            if len(members) < 2:
                continue
            scores: dict[str, float] = {}
            for node_id in members:
                adjacent = [
                    str(n)
                    for n in (
                        graph.predecessors(node_id) if forward else graph.successors(node_id)
                    )
                ]
                if not adjacent:
                    adjacent = [
                        str(n)
                        for n in (
                            graph.successors(node_id) if forward else graph.predecessors(node_id)
                        )
                    ]
                known = [order[n] for n in adjacent if n in order]
                scores[node_id] = (
                    sum(known) / len(known) if known else order.get(node_id, 0.0)
                )
            members.sort(key=lambda n: (scores[n], n))
            _renormalise(depth)

    return [connected[d] + isolated[d] for d in depths]


def _provenance_depths(graph: nx.DiGraph) -> dict[str, int]:
    depth: dict[str, int] = {str(n): 0 for n in graph.nodes}
    edges = [(str(u), str(v)) for u, v in graph.edges if str(u) != str(v)]
    for _ in range(min(len(depth), 200)):
        changed = False
        for src, dst in edges:
            candidate = depth[src] + 1
            if candidate > depth[dst]:
                depth[dst] = candidate
                changed = True
        if not changed:
            break
    return depth


def _sidebar_grid_positions(
    nodes: list[str],
    *,
    x_min: float,
    x_max: float,
) -> dict[str, tuple[float, float]]:
    if not nodes:
        return {}
    count = len(nodes)
    n_cols = max(1, min(6, int(math.ceil(math.sqrt(count / 2.0)))))
    n_rows = int(math.ceil(count / n_cols))
    out: dict[str, tuple[float, float]] = {}
    for idx, node_id in enumerate(nodes):
        col, row = idx % n_cols, idx // n_cols
        x = (
            x_min + (x_max - x_min) * (col / (n_cols - 1))
            if n_cols > 1
            else 0.5 * (x_min + x_max)
        )
        y = 1.0 if n_rows < 2 else 1.0 - 2.0 * (row / (n_rows - 1))
        out[node_id] = (x, y)
    return out


def _flow_positions(graph: nx.DiGraph, *, sweeps: int = 12) -> dict[str, tuple[float, float]]:
    isolated = sorted(str(n) for n in graph.nodes if graph.degree(n) == 0)
    connected_nodes = [n for n in graph.nodes if graph.degree(n) > 0]
    if not connected_nodes:
        return _sidebar_grid_positions(isolated, x_min=-1.0, x_max=1.0)

    connected_graph = graph.subgraph(connected_nodes).copy()
    depth = _provenance_depths(connected_graph)
    if not depth:
        return _sidebar_grid_positions(isolated, x_min=-1.0, x_max=1.0)

    real_edges = [
        (str(u), str(v)) for u, v in connected_graph.edges if str(u) != str(v)
    ]
    columns: dict[int, list[str]] = {}
    for node_id, d in depth.items():
        columns.setdefault(d, []).append(node_id)

    adjacency: dict[str, set[str]] = {n: set() for n in depth}
    dummy_seq = 0
    for src, dst in real_edges:
        d0, d1 = depth[src], depth[dst]
        step = 1 if d1 >= d0 else -1
        if abs(d1 - d0) <= 1:
            adjacency[src].add(dst)
            adjacency[dst].add(src)
            continue
        previous = src
        for level in range(d0 + step, d1, step):
            dummy_seq += 1
            dummy = f"__bend__{dummy_seq}"
            columns.setdefault(level, []).append(dummy)
            adjacency[dummy] = set()
            adjacency[previous].add(dummy)
            adjacency[dummy].add(previous)
            previous = dummy
        adjacency[previous].add(dst)
        adjacency[dst].add(previous)

    depths_sorted = sorted(columns)
    for d in depths_sorted:
        columns[d].sort()

    order: dict[str, float] = {}

    def _renormalise(level: int) -> None:
        members = columns[level]
        last = max(1, len(members) - 1)
        for idx, node_id in enumerate(members):
            order[node_id] = idx / last

    for d in depths_sorted:
        _renormalise(d)

    for sweep in range(max(1, int(sweeps))):
        sequence = depths_sorted if sweep % 2 == 0 else list(reversed(depths_sorted))
        for level in sequence:
            members = columns[level]
            if len(members) < 2:
                continue
            scores: dict[str, float] = {}
            for node_id in members:
                known = [
                    order[n]
                    for n in adjacency.get(node_id, ())
                    if n in order and depth.get(n, level) != level
                ]
                scores[node_id] = (
                    sum(known) / len(known) if known else order.get(node_id, 0.0)
                )
            members.sort(key=lambda n: (scores[n], n))
            _renormalise(level)

    n_cols = max(1, len(depths_sorted))
    flow_x_min = -0.45 if isolated else -1.0
    pos: dict[str, tuple[float, float]] = {}
    for col_idx, level in enumerate(depths_sorted):
        x = (
            flow_x_min + (1.0 - flow_x_min) * (col_idx / max(1, n_cols - 1))
            if n_cols > 1
            else flow_x_min
        )
        members = columns[level]
        count = len(members)
        for row_idx, node_id in enumerate(members):
            if node_id.startswith("__bend__"):
                continue
            y = 0.0 if count < 2 else 1.0 - 2.0 * (row_idx / (count - 1))
            pos[node_id] = (x, y)

    pos.update(_sidebar_grid_positions(isolated, x_min=-1.0, x_max=-0.62))
    return pos


def _layered_positions(
    graph: nx.DiGraph,
    node_meta: dict[str, dict[str, Any]],
) -> dict[str, tuple[float, float]]:
    columns = _ordered_layer_buckets(graph, node_meta)
    if not columns:
        return {}
    n_cols = len(columns)
    pos: dict[str, tuple[float, float]] = {}
    for col_idx, members in enumerate(columns):
        x = -1.0 + 2.0 * (col_idx / max(1, n_cols - 1)) if n_cols > 1 else 0.0
        count = len(members)
        for row_idx, node_id in enumerate(members):
            y = 0.0 if count < 2 else 1.0 - 2.0 * (row_idx / (count - 1))
            pos[node_id] = (x, y)
    return pos


def _isometric_positions(
    graph: nx.DiGraph,
    node_meta: dict[str, dict[str, Any]],
    *,
    tilt_deg: float = 17.0,
    plane_gap: float = 1.15,
) -> tuple[dict[str, tuple[float, float]], dict[str, float]]:
    columns = _ordered_layer_buckets(graph, node_meta)
    flow = _flow_positions(graph)
    if flow:
        columns = [
            sorted(members, key=lambda n: (-flow.get(n, (0.0, 0.0))[1], n))
            for members in columns
        ]
    tilt = math.radians(max(5.0, min(60.0, float(tilt_deg))))
    cos_t = math.cos(tilt)
    sin_t = math.sin(tilt)

    pos: dict[str, tuple[float, float]] = {}
    depth_of: dict[str, float] = {}
    n_planes = max(1, len(columns))

    for plane_idx, members in enumerate(columns):
        count = len(members)
        n_u = max(1, int(math.ceil(math.sqrt(max(1, count) * 2.5))))
        n_v = max(1, int(math.ceil(count / n_u)))
        for slot, node_id in enumerate(members):
            iu, iv = slot % n_u, slot // n_u
            u = 0.0 if n_u < 2 else (iu / (n_u - 1) - 0.5) * 2.8
            v = 0.0 if n_v < 2 else (iv / (n_v - 1) - 0.5) * 1.4
            w = plane_idx * plane_gap
            pos[node_id] = ((u - v) * cos_t, (u + v) * sin_t + w)
            depth_of[node_id] = 0.0 if n_planes < 2 else plane_idx / (n_planes - 1)
    return pos, depth_of
