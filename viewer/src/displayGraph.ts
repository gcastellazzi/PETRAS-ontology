import type { GraphNode, GraphPayload } from "./types";

/** DataLinks are provenance edges, not a display layer. */
export function isDatalinkNode(node: GraphNode): boolean {
  return node.layer === "datalinks" || node.type === "DataLink";
}

/** Nodes that could not be assigned to a PETRAS ontology layer. */
export function isUnknownNode(node: GraphNode): boolean {
  return node.layer === "unknown" || !node.layer;
}

/**
 * Graph ready for 2D/3D rendering: drop DataLink entity nodes and the
 * datalinks legend entry. Connectivity edges (mapsFrom→mapsTo) stay.
 */
export function forDisplay(
  graph: GraphPayload,
  opts: {
    hideMissing?: boolean;
    hideIsolated?: boolean;
    hideUnknown?: boolean;
  } = {},
): GraphPayload {
  const hideMissing = !!opts.hideMissing;
  const hideIsolated = !!opts.hideIsolated;
  const hideUnknown = !!opts.hideUnknown;

  let nodes = graph.nodes.filter(
    (n) =>
      !isDatalinkNode(n) &&
      (!hideMissing || !n.missing) &&
      (!hideUnknown || !isUnknownNode(n)),
  );
  let ids = new Set(nodes.map((n) => n.id));
  let edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  if (hideIsolated) {
    const linked = new Set<string>();
    for (const e of edges) {
      linked.add(e.source);
      linked.add(e.target);
    }
    nodes = nodes.filter((n) => linked.has(n.id));
    ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }

  const layers = graph.layers.filter(
    (l) => l.id !== "datalinks" && (!hideUnknown || l.id !== "unknown"),
  );
  const layerCounts = { ...(graph.project?.layerCounts || {}) };
  delete layerCounts.datalinks;
  for (const layer of layers) {
    layerCounts[layer.id] = nodes.filter((n) => n.layer === layer.id).length;
  }

  return {
    ...graph,
    nodes,
    edges,
    layers,
    stats: { nodeCount: nodes.length, edgeCount: edges.length },
    project: graph.project
      ? { ...graph.project, layerCounts }
      : { layerCounts },
  };
}
