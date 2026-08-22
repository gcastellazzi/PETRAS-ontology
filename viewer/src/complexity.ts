import type { GraphEdge, GraphNode, GraphPayload } from "./types";

/** Degree and data-driven complexity for sizing nodes in 2D/3D. */
export type ComplexityInfo = {
  degree: number;
  dataFields: number;
  /** Absolute score used for radius (higher = more complex). */
  score: number;
  /** 0..1 relative to the densest node in the graph. */
  norm: number;
};

export function degreeMap(edges: GraphEdge[]): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  }
  return deg;
}

function dataFieldCount(node: GraphNode): number {
  const data = node.data || {};
  return Object.keys(data).filter((k) => k !== "@id" && data[k] != null && data[k] !== "").length;
}

/** Raw complexity before graph-wide normalisation. */
export function rawComplexity(node: GraphNode, degree: number): number {
  const fromSize = Math.max(0, (node.size || 12) - 12) / 2; // recovers approx degree from export
  const deg = Math.max(degree, fromSize);
  const fields = dataFieldCount(node);
  // Degree dominates; extra JSON-LD fields add a small bump.
  return deg + fields * 0.35 + (node.type ? 0.25 : 0);
}

export function complexityIndex(graph: GraphPayload): Map<string, ComplexityInfo> {
  const deg = degreeMap(graph.edges);
  const raw = new Map<string, number>();
  let max = 1;
  for (const n of graph.nodes) {
    const d = deg.get(n.id) || 0;
    const score = rawComplexity(n, d);
    raw.set(n.id, score);
    if (score > max) max = score;
  }
  const out = new Map<string, ComplexityInfo>();
  for (const n of graph.nodes) {
    const score = raw.get(n.id) || 0;
    const d = deg.get(n.id) || 0;
    out.set(n.id, {
      degree: d,
      dataFields: dataFieldCount(n),
      score,
      norm: score / max,
    });
  }
  return out;
}

/** Sphere radius in graph units — volume grows with complexity. */
export function complexityRadius(
  info: ComplexityInfo | undefined,
  sphereScale: number,
): number {
  const norm = info?.norm ?? 0;
  // Mild floor so isolated nodes stay visible; cube-root-ish growth so hubs dominate volume.
  const base = 0.045 + Math.pow(norm, 0.55) * 0.14;
  return base * sphereScale;
}
