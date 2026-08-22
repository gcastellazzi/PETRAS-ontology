import type { GraphLayer, GraphNode, GraphPayload } from "./types";

export type LayoutMode = "flow" | "columns";

export type NodePos = { x: number; y: number };

export type LayoutCommandKind = "fill" | "spread-x" | "spread-y" | "reset";

export type LayoutCommand = { kind: LayoutCommandKind; id: number };

export type ViewFrame = { minX: number; minY: number; width: number; height: number };

const LAYER_ORDER = [
  "datalake",
  "datasets",
  "datastore",
  "datasources",
  "analytics",
  "reports",
  "unknown",
];

/** Approximate SVG label size in graph units (matches GraphCanvas text). */
export function measureLabel(
  node: GraphNode,
  fontSize: number,
): { halfW: number; height: number; lineCount: number } {
  const lines = String(node.label || "").split("\n");
  const maxChars = Math.max(1, ...lines.map((l) => l.length));
  // ~0.55em average glyph width for the UI sans font
  const halfW = (maxChars * fontSize * 0.55) / 2;
  const lineCount = Math.max(1, lines.length);
  const height = lineCount * fontSize * 1.12;
  return { halfW, height, lineCount };
}

export type NodeBox = { minX: number; maxX: number; minY: number; maxY: number };

/** Axis-aligned bounds of sphere + label under the node. */
export function nodeBox(
  pos: NodePos,
  node: GraphNode,
  radius: number,
  fontSize: number,
): NodeBox {
  const label = measureLabel(node, fontSize);
  const gap = fontSize * 1.15; // space between circle bottom and first baseline
  const halfW = Math.max(radius, label.halfW) + fontSize * 0.15;
  return {
    minX: pos.x - halfW,
    maxX: pos.x + halfW,
    minY: pos.y - radius,
    maxY: pos.y + radius + gap + label.height,
  };
}

/**
 * Iteratively separate overlapping node+label boxes (AABB).
 * Fixed nodes (user-dragged) stay put when possible.
 */
export function resolveOverlaps(
  positions: Map<string, NodePos>,
  nodes: GraphNode[],
  opts: {
    nodeRadius: (n: GraphNode) => number;
    fontSize: number;
    fixed?: Set<string>;
    iterations?: number;
  },
): Map<string, NodePos> {
  const out = new Map<string, NodePos>();
  for (const [id, p] of positions) out.set(id, { x: p.x, y: p.y });
  const fixed = opts.fixed ?? new Set();
  const iterations = opts.iterations ?? 100;
  const ids = nodes.map((n) => n.id);
  const radii = nodes.map((n) => opts.nodeRadius(n));

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const pa = out.get(a);
      if (!pa) continue;
      const boxA = nodeBox(pa, nodes[i], radii[i], opts.fontSize);
      for (let j = i + 1; j < ids.length; j++) {
        const b = ids[j];
        const pb = out.get(b);
        if (!pb) continue;
        const boxB = nodeBox(pb, nodes[j], radii[j], opts.fontSize);

        const overlapX = Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX);
        const overlapY = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (fixed.has(a) && fixed.has(b)) continue;

        // Separate along the shallow penetration axis.
        let dx = 0;
        let dy = 0;
        if (overlapX < overlapY) {
          const dir = (pa.x + pb.x) * 0.5 <= (boxA.minX + boxA.maxX) * 0.5 ? -1 : 1;
          // Push so A moves left of B or vice versa based on centres
          dx = (pa.x <= pb.x ? -overlapX : overlapX) * 0.5;
          if (Math.abs(dx) < 1e-12) dx = dir * overlapX * 0.5;
        } else {
          dy = (pa.y <= pb.y ? -overlapY : overlapY) * 0.5;
          if (Math.abs(dy) < 1e-12) dy = -overlapY * 0.5;
        }

        if (fixed.has(a)) {
          out.set(b, { x: pb.x - dx * 2, y: pb.y - dy * 2 });
        } else if (fixed.has(b)) {
          out.set(a, { x: pa.x + dx * 2, y: pa.y + dy * 2 });
        } else {
          out.set(a, { x: pa.x + dx, y: pa.y + dy });
          out.set(b, { x: pb.x - dx, y: pb.y - dy });
        }
        // Refresh boxA for subsequent pairs in this pass (cheap approx: mutate local)
        boxA.minX += dx;
        boxA.maxX += dx;
        boxA.minY += dy;
        boxA.maxY += dy;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Bounding box of node centres (optional padding). */
export function positionsBounds(
  positions: Map<string, NodePos>,
  pad = 0,
): ViewFrame | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(1e-6, maxX - minX + 2 * pad),
    height: Math.max(1e-6, maxY - minY + 2 * pad),
  };
}

/**
 * Affine-map node centres into a target frame on chosen axes.
 * Independent X/Y scales — does not change the camera/viewBox.
 */
export function spreadToFill(
  positions: Map<string, NodePos>,
  target: ViewFrame,
  axes: { x?: boolean; y?: boolean } = { x: true, y: true },
): Map<string, NodePos> {
  const src = positionsBounds(positions, 0);
  if (!src) return new Map(positions);

  const doX = axes.x !== false;
  const doY = axes.y !== false;
  const srcCX = src.minX + src.width / 2;
  const srcCY = src.minY + src.height / 2;
  const dstCX = target.minX + target.width / 2;
  const dstCY = target.minY + target.height / 2;

  const scaleX =
    doX && src.width > 1e-9 ? target.width / Math.max(src.width, 1e-9) : 1;
  const scaleY =
    doY && src.height > 1e-9 ? target.height / Math.max(src.height, 1e-9) : 1;

  const out = new Map<string, NodePos>();
  for (const [id, p] of positions) {
    out.set(id, {
      x: doX ? dstCX + (p.x - srcCX) * scaleX : p.x,
      y: doY ? dstCY + (p.y - srcCY) * scaleY : p.y,
    });
  }
  return out;
}

/**
 * Spread centres so that sphere+label boxes fit inside `frame` on the
 * requested axes (inset by the largest label/sphere extents).
 */
export function spreadNodesToFill(
  positions: Map<string, NodePos>,
  nodes: GraphNode[],
  opts: {
    nodeRadius: (n: GraphNode) => number;
    fontSize: number;
    frame: ViewFrame;
    axes?: { x?: boolean; y?: boolean };
  },
): Map<string, NodePos> {
  const axes = opts.axes ?? { x: true, y: true };
  let maxHalfW = 0;
  let maxAbove = 0;
  let maxBelow = 0;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const r = opts.nodeRadius(n);
    const label = measureLabel(n, opts.fontSize);
    const gap = opts.fontSize * 1.15;
    const halfW = Math.max(r, label.halfW) + opts.fontSize * 0.15;
    maxHalfW = Math.max(maxHalfW, halfW);
    maxAbove = Math.max(maxAbove, r);
    maxBelow = Math.max(maxBelow, r + gap + label.height);
  }

  const inset: ViewFrame = {
    minX: opts.frame.minX + maxHalfW,
    minY: opts.frame.minY + maxAbove,
    width: Math.max(1e-6, opts.frame.width - 2 * maxHalfW),
    height: Math.max(1e-6, opts.frame.height - maxAbove - maxBelow),
  };
  return spreadToFill(positions, inset, axes);
}

/** Expand distances from centroid by a factor on chosen axes. */
export function spreadByFactor(
  positions: Map<string, NodePos>,
  factor: number,
  axes: { x?: boolean; y?: boolean } = { x: true, y: true },
): Map<string, NodePos> {
  const src = positionsBounds(positions, 0);
  if (!src) return new Map(positions);
  const cx = src.minX + src.width / 2;
  const cy = src.minY + src.height / 2;
  const doX = axes.x !== false;
  const doY = axes.y !== false;
  const out = new Map<string, NodePos>();
  for (const [id, p] of positions) {
    out.set(id, {
      x: doX ? cx + (p.x - cx) * factor : p.x,
      y: doY ? cy + (p.y - cy) * factor : p.y,
    });
  }
  return out;
}

/** Fixed view aspect: width ÷ height = 4/3 (base × altezza). */
export const VIEW_ASPECT = 4 / 3;

/** Canonical 4:3 graph frame used by the 2D canvas (no content-based zoom). */
export function canonicalViewFrame(height = 2.4): ViewFrame {
  const width = height * VIEW_ASPECT;
  return {
    minX: -width / 2,
    minY: -height / 2,
    width,
    height,
  };
}

/** @deprecated Prefer canonicalViewFrame — kept for callers that pass a custom ratio. */
export function frameForAspect(aspect: number, size = 2.2): ViewFrame {
  const a = Math.max(0.35, Math.min(3.5, aspect || 1));
  if (a >= 1) {
    return { minX: -size / 2, minY: -size / (2 * a), width: size, height: size / a };
  }
  return { minX: (-size * a) / 2, minY: -size / 2, width: size * a, height: size };
}

/** 4:3 world rectangle for 3D layer planes (Three.js units). */
export function worldPlaneFrame(height = 12): ViewFrame {
  const width = height * VIEW_ASPECT;
  return {
    minX: -width / 2,
    minY: -height / 2,
    width,
    height,
  };
}

/** Use coordinates already present in the exported graph (flow / Sugiyama). */
export function positionsFromPayload(nodes: GraphNode[]): Map<string, NodePos> {
  const out = new Map<string, NodePos>();
  for (const n of nodes) out.set(n.id, { x: n.x, y: n.y });
  return out;
}

/**
 * One vertical column per ontology layer (left → right).
 * Nodes within a column are spaced evenly on Y.
 */
export function columnLayout(
  nodes: GraphNode[],
  layers: GraphLayer[],
): Map<string, NodePos> {
  const order = layers.length
    ? [...layers.map((l) => l.id), "unknown"]
    : LAYER_ORDER;

  const buckets = new Map<string, GraphNode[]>();
  for (const key of order) buckets.set(key, []);
  for (const n of nodes) {
    const layer = order.includes(n.layer) ? n.layer : "unknown";
    if (!buckets.has(layer)) buckets.set(layer, []);
    buckets.get(layer)!.push(n);
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const t = (a.type || "").localeCompare(b.type || "");
      if (t) return t;
      return a.label.localeCompare(b.label);
    });
  }

  const active = order.filter((k) => (buckets.get(k)?.length ?? 0) > 0);
  const nCols = Math.max(1, active.length);
  const out = new Map<string, NodePos>();

  active.forEach((layer, colIdx) => {
    const members = buckets.get(layer) || [];
    const x = nCols === 1 ? 0 : -1 + (2 * colIdx) / (nCols - 1);
    const count = members.length;
    members.forEach((node, rowIdx) => {
      const y = count < 2 ? 0 : 1 - (2 * rowIdx) / (count - 1);
      out.set(node.id, { x, y });
    });
  });
  return out;
}

export function computePositions(
  graph: GraphPayload,
  mode: LayoutMode,
  opts: {
    nodeRadius: (n: GraphNode) => number;
    fontSize: number;
    avoidOverlap: boolean;
    fixed?: Set<string>;
  },
): Map<string, NodePos> {
  let pos =
    mode === "columns"
      ? columnLayout(graph.nodes, graph.layers)
      : positionsFromPayload(graph.nodes);

  if (opts.avoidOverlap) {
    pos = resolveOverlaps(pos, graph.nodes, {
      nodeRadius: opts.nodeRadius,
      fontSize: opts.fontSize,
      fixed: opts.fixed,
      iterations: mode === "columns" ? 60 : 120,
    });
  }
  return pos;
}

export function nodeBaseRadius(node: GraphNode, sphereScale: number): number {
  const approxNorm = Math.min(1, Math.max(0, ((node.size || 12) - 12) / 24));
  const base = 0.035 + Math.pow(approxNorm, 0.55) * 0.09;
  return base * sphereScale;
}
