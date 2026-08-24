import type { GraphLayer, GraphNode, GraphPayload } from "./types";

export type LayoutMode = "flow" | "columns";

export type NodePos = { x: number; y: number };

export type LayoutCommandKind = "fill" | "spread-x" | "spread-y" | "untangle" | "reset";

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

/*
 * Label widths are measured with the browser's own text engine rather than
 * estimated at a fixed em-per-glyph. The layout has to reason about the box the
 * reader actually sees: "Full comprehensive report" and "iot.import" differ by
 * far more than their character counts suggest, and a wrong width is what lets
 * two labels sit on top of each other after the spheres have been separated.
 */
const LABEL_FONT = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
/** Measured once at a large size and scaled: text advance is linear in px. */
const MEASURE_PX = 100;
let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

function referenceWidth(text: string): number {
  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;

  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
      if (measureCtx) measureCtx.font = `${MEASURE_PX}px ${LABEL_FONT}`;
    } catch {
      measureCtx = null;
    }
  }

  // Without a canvas (tests, SSR) fall back to the old em-per-glyph estimate.
  const width = measureCtx
    ? measureCtx.measureText(text).width
    : text.length * MEASURE_PX * 0.55;
  widthCache.set(text, width);
  return width;
}

/** SVG label size in graph units, matching what GraphCanvas renders. */
export function measureLabel(
  node: GraphNode,
  fontSize: number,
): { halfW: number; height: number; lineCount: number } {
  const lines = String(node.label || "").split("\n");
  const widest = Math.max(0, ...lines.map((l) => referenceWidth(l)));
  const halfW = (widest / MEASURE_PX) * fontSize * 0.5;
  const lineCount = Math.max(1, lines.length);
  const height = lineCount * fontSize * 1.12;
  return { halfW, height, lineCount };
}

export type NodeBox = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Axis-aligned bounds of sphere + label under the node. `padding` is a gutter
 * added on every side: separating boxes to exactly touching still reads as
 * crowded, so callers that want visible breathing room ask for some.
 */
export function nodeBox(
  pos: NodePos,
  node: GraphNode,
  radius: number,
  fontSize: number,
  padding = 0,
): NodeBox {
  const label = measureLabel(node, fontSize);
  const gap = fontSize * 1.15; // space between circle bottom and first baseline
  const halfW = Math.max(radius, label.halfW) + fontSize * 0.15 + padding;
  return {
    minX: pos.x - halfW,
    maxX: pos.x + halfW,
    minY: pos.y - radius - padding,
    maxY: pos.y + radius + gap + label.height + padding,
  };
}

/** Union of every node's box — the room the drawing actually needs. */
export function contentBounds(
  positions: Map<string, NodePos>,
  nodes: GraphNode[],
  opts: { nodeRadius: (n: GraphNode) => number; fontSize: number; padding?: number },
): ViewFrame | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const b = nodeBox(p, n, opts.nodeRadius(n), opts.fontSize, opts.padding ?? 0);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, width: Math.max(1e-6, maxX - minX), height: Math.max(1e-6, maxY - minY) };
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
    padding?: number;
  },
): Map<string, NodePos> {
  // Positions are mutated in place so that every comparison in a pass sees
  // where its neighbours have just been pushed. Reading a stale copy makes the
  // second correction of a node overwrite the first, which is why a node with
  // several colliding neighbours used to keep one of the collisions.
  const out = new Map<string, NodePos>();
  for (const [id, p] of positions) out.set(id, { x: p.x, y: p.y });

  const fixed = opts.fixed ?? new Set<string>();
  const iterations = opts.iterations ?? 100;
  const padding = opts.padding ?? 0;
  const ids = nodes.map((n) => n.id);
  const radii = nodes.map((n) => opts.nodeRadius(n));
  // Push slightly past contact so boxes end strictly disjoint, not touching.
  const relax = 0.52;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const pa = out.get(a);
      if (!pa) continue;

      for (let j = i + 1; j < ids.length; j++) {
        const b = ids[j];
        const pb = out.get(b);
        if (!pb) continue;
        if (fixed.has(a) && fixed.has(b)) continue;

        const boxA = nodeBox(pa, nodes[i], radii[i], opts.fontSize, padding);
        const boxB = nodeBox(pb, nodes[j], radii[j], opts.fontSize, padding);

        const overlapX = Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX);
        const overlapY = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
        if (overlapX <= 0 || overlapY <= 0) continue;

        // Separate along the axis of shallower penetration: the smaller move.
        let dx = 0;
        let dy = 0;
        if (overlapX < overlapY) {
          // Coincident centres need an arbitrary but stable side to break the tie.
          const aIsLeft = pa.x < pb.x || (pa.x === pb.x && i % 2 === 0);
          dx = aIsLeft ? -overlapX * relax : overlapX * relax;
        } else {
          const aIsAbove = pa.y < pb.y || (pa.y === pb.y && i % 2 === 0);
          dy = aIsAbove ? -overlapY * relax : overlapY * relax;
        }

        if (fixed.has(a)) {
          pb.x -= dx * 2;
          pb.y -= dy * 2;
        } else if (fixed.has(b)) {
          pa.x += dx * 2;
          pa.y += dy * 2;
        } else {
          pa.x += dx;
          pa.y += dy;
          pb.x -= dx;
          pb.y -= dy;
        }
        moved = true;
      }
    }

    if (!moved) break;
  }

  return out;
}

/** True when any two node boxes intersect. */
export function hasOverlap(
  positions: Map<string, NodePos>,
  nodes: GraphNode[],
  opts: { nodeRadius: (n: GraphNode) => number; fontSize: number; padding?: number },
): boolean {
  const padding = opts.padding ?? 0;
  const boxes: NodeBox[] = [];
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (p) boxes.push(nodeBox(p, n, opts.nodeRadius(n), opts.fontSize, padding));
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY) return true;
    }
  }
  return false;
}

/**
 * Arrange nodes so that no two sphere+label boxes intersect — labels included,
 * which is the whole point: separating circles alone leaves the text colliding.
 *
 * The resolver can only push boxes apart, so it is given room to work in first:
 * the arrangement is scaled out from its centroid until the plane has enough
 * area for the boxes, then relaxed, then expanded again if anything still
 * touches. Nothing compresses the result afterwards — squeezing the drawing
 * back into a fixed frame is exactly what re-creates the overlaps. Framing is
 * the viewer's job, and it does it with zoom.
 */
export function layoutWithoutOverlap(
  positions: Map<string, NodePos>,
  nodes: GraphNode[],
  opts: {
    nodeRadius: (n: GraphNode) => number;
    fontSize: number;
    padding?: number;
    fixed?: Set<string>;
    /** Width ÷ height the working area should aim for, so the result fills the view. */
    aspect?: number;
  },
): Map<string, NodePos> {
  const padding = opts.padding ?? 0;
  const measure = { nodeRadius: opts.nodeRadius, fontSize: opts.fontSize, padding };

  // Area every box needs, with slack for the gaps an AABB packing leaves.
  let boxArea = 0;
  for (const n of nodes) {
    const b = nodeBox({ x: 0, y: 0 }, n, opts.nodeRadius(n), opts.fontSize, padding);
    boxArea += (b.maxX - b.minX) * (b.maxY - b.minY);
  }
  const needed = boxArea * 2.6;

  // Shape the working area like the view before relaxing. A tall, narrow
  // arrangement resolves into a tall, narrow drawing, which then has to be
  // zoomed far out to fit a 4:3 frame and comes out unreadably small; giving
  // the resolver a 4:3 plane to begin with keeps the result large on screen.
  // Labels are wide and short, so a box that overlaps a neighbour usually has
  // its shallower penetration on the vertical axis and gets pushed there: the
  // relaxation drifts taller than the area it started from. Aiming wider than
  // the view compensates, and the result lands near the view's own proportions.
  const aspect = (opts.aspect ?? 1) * 1.8;
  let out = new Map(positions);
  const start = contentBounds(out, nodes, measure);
  if (start) {
    const targetW = Math.sqrt(needed * aspect);
    const targetH = Math.sqrt(needed / aspect);
    const sx = Math.max(1, targetW / start.width);
    const sy = Math.max(1, targetH / start.height);
    if (sx > 1 || sy > 1) {
      const cx = start.minX + start.width / 2;
      const cy = start.minY + start.height / 2;
      const scaled = new Map<string, NodePos>();
      for (const [id, p] of out) {
        scaled.set(id, { x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy });
      }
      out = scaled;
    }
  }

  // Relax, and if boxes still touch give the resolver more plane and retry.
  // Expansion is what guarantees termination: an arrangement with enough room
  // always has a solution the pairwise pushes can reach.
  for (let round = 0; round < 12; round++) {
    out = resolveOverlaps(out, nodes, {
      nodeRadius: opts.nodeRadius,
      fontSize: opts.fontSize,
      fixed: opts.fixed,
      iterations: 500,
      padding,
    });
    if (!hasOverlap(out, nodes, measure)) break;
    out = spreadByFactor(out, 1.22);
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
