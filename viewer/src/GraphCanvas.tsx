import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  canonicalViewFrame,
  computePositions,
  nodeBaseRadius,
  resolveOverlaps,
  spreadNodesToFill,
  type LayoutCommand,
  type LayoutMode,
  type NodePos,
} from "./layout";
import { complexityIndex, complexityRadius } from "./complexity";
import type { GraphEdge, GraphNode, GraphPayload } from "./types";
import { canvasInk } from "./theme";

type Props = {
  graph: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusIds?: Set<string> | null;
  layoutMode: LayoutMode;
  sphereScale: number;
  fontScale: number;
  avoidOverlap: boolean;
  backgroundColor?: string;
  layoutCommand?: LayoutCommand | null;
  onLayoutCommandHandled?: (id: number) => void;
};

type DragMode =
  | { kind: "pan"; x: number; y: number; panX: number; panY: number }
  | {
      kind: "node";
      id: string;
      moved: boolean;
      grabSvgX: number;
      grabSvgY: number;
      originX: number;
      originY: number;
    };

/** Fixed 4:3 canvas frame (width × height). Fit/spread never change this. */
const VIEW_FRAME = canonicalViewFrame(2.4);

export function GraphCanvas({
  graph,
  selectedId,
  onSelect,
  focusIds,
  layoutMode,
  sphereScale,
  fontScale,
  avoidOverlap,
  backgroundColor = "#0f1115",
  layoutCommand = null,
  onLayoutCommandHandled,
}: Props) {
  const ink = useMemo(() => canvasInk(backgroundColor), [backgroundColor]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overrides, setOverrides] = useState<Map<string, NodePos>>(new Map());
  const [draggedIds, setDraggedIds] = useState<Set<string>>(new Set());
  const drag = useRef<DragMode | null>(null);
  const suppressClick = useRef(false);
  const layoutKey = useRef(`${layoutMode}`);
  const handledCmd = useRef<number | null>(null);
  const positionsRef = useRef<Map<string, NodePos>>(new Map());

  useEffect(() => {
    if (layoutKey.current !== layoutMode) {
      layoutKey.current = layoutMode;
      setOverrides(new Map());
      setDraggedIds(new Set());
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [layoutMode]);

  const complexity = useMemo(() => complexityIndex(graph), [graph]);
  const fontSize = 0.055 * fontScale;

  const nodeRadius = useCallback(
    (n: GraphNode) => {
      const info = complexity.get(n.id);
      if (info) return complexityRadius(info, sphereScale) * 0.55;
      return nodeBaseRadius(n, sphereScale);
    },
    [complexity, sphereScale],
  );

  const displayPositions = useMemo(() => {
    const base = computePositions(graph, layoutMode, {
      nodeRadius,
      fontSize,
      avoidOverlap,
      fixed: draggedIds,
    });
    const merged = new Map(base);
    for (const [id, p] of overrides) merged.set(id, p);
    if (avoidOverlap && (overrides.size > 0 || draggedIds.size > 0)) {
      return resolveOverlaps(merged, graph.nodes, {
        nodeRadius,
        fontSize,
        fixed: draggedIds,
        iterations: 80,
      });
    }
    return merged;
  }, [graph, layoutMode, nodeRadius, fontSize, avoidOverlap, overrides, draggedIds]);

  positionsRef.current = displayPositions;

  const vb = VIEW_FRAME;

  useEffect(() => {
    if (!layoutCommand || handledCmd.current === layoutCommand.id) return;
    handledCmd.current = layoutCommand.id;
    const current = new Map(positionsRef.current);

    if (layoutCommand.kind === "reset") {
      setOverrides(new Map());
      setDraggedIds(new Set());
      setPan({ x: 0, y: 0 });
      setZoom(1);
      onLayoutCommandHandled?.(layoutCommand.id);
      return;
    }

    const axes =
      layoutCommand.kind === "fill"
        ? { x: true, y: true }
        : layoutCommand.kind === "spread-x"
          ? { x: true, y: false }
          : { x: false, y: true };

    let next = spreadNodesToFill(current, graph.nodes, {
      nodeRadius,
      fontSize,
      frame: VIEW_FRAME,
      axes,
    });

    if (avoidOverlap) {
      next = resolveOverlaps(next, graph.nodes, {
        nodeRadius,
        fontSize,
        iterations: 100,
      });
      next = spreadNodesToFill(next, graph.nodes, {
        nodeRadius,
        fontSize,
        frame: VIEW_FRAME,
        axes,
      });
    }

    // Reposition nodes only — do not change pan/zoom.
    setOverrides(next);
    setDraggedIds(new Set(next.keys()));
    onLayoutCommandHandled?.(layoutCommand.id);
  }, [
    layoutCommand,
    avoidOverlap,
    graph.nodes,
    nodeRadius,
    fontSize,
    onLayoutCommandHandled,
  ]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode & NodePos>();
    for (const n of graph.nodes) {
      const p = displayPositions.get(n.id) ?? { x: n.x, y: n.y };
      m.set(n.id, { ...n, ...p });
    }
    return m;
  }, [graph.nodes, displayPositions]);

  const clientToSvg = useCallback((clientX: number, clientY: number): NodePos | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const sp = pt.matrixTransform(ctm.inverse());
    return { x: sp.x, y: sp.y };
  }, []);

  const onWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.35, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const onPointerDownBg = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if ((e.target as Element).closest(".node")) return;
      drag.current = { kind: "pan", x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onNodePointerDown = useCallback(
    (e: PointerEvent<SVGGElement>, id: string) => {
      e.stopPropagation();
      const svgPt = clientToSvg(e.clientX, e.clientY);
      const pos = displayPositions.get(id);
      if (!svgPt || !pos) return;
      drag.current = {
        kind: "node",
        id,
        moved: false,
        grabSvgX: svgPt.x - pos.x,
        grabSvgY: svgPt.y - pos.y,
        originX: pos.x,
        originY: pos.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [clientToSvg, displayPositions],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === "pan") {
        const scale = 0.004 / zoom;
        setPan({
          x: d.panX + (e.clientX - d.x) * scale,
          y: d.panY - (e.clientY - d.y) * scale,
        });
        return;
      }
      const svgPt = clientToSvg(e.clientX, e.clientY);
      if (!svgPt) return;
      const nx = svgPt.x - d.grabSvgX;
      const ny = svgPt.y - d.grabSvgY;
      if (Math.hypot(nx - d.originX, ny - d.originY) > 0.015) d.moved = true;
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(d.id, { x: nx, y: ny });
        return next;
      });
      setDraggedIds((prev) => {
        if (prev.has(d.id)) return prev;
        const next = new Set(prev);
        next.add(d.id);
        return next;
      });
    },
    [clientToSvg, zoom],
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "node") {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!d.moved) onSelect(d.id);
    }
  }, [onSelect]);

  const onSvgClick = useCallback(() => {
    if (suppressClick.current) return;
    onSelect(null);
  }, [onSelect]);

  const cx = vb.minX + vb.width / 2 + pan.x;
  const cy = vb.minY + vb.height / 2 + pan.y;
  const viewBox = `${cx - vb.width / 2 / zoom} ${cy - vb.height / 2 / zoom} ${vb.width / zoom} ${vb.height / zoom}`;
  const edgeFont = 0.04 * Math.min(1.4, fontScale);

  const headerY = useMemo(() => {
    let top = Infinity;
    for (const p of displayPositions.values()) top = Math.min(top, p.y);
    return Number.isFinite(top) ? top - 0.22 : vb.minY + 0.12;
  }, [displayPositions, vb.minY]);

  return (
    <svg
      ref={svgRef}
      className="graph-canvas"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: backgroundColor }}
      onWheel={onWheel}
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onSvgClick}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink.edge} />
        </marker>
        <filter id="selected-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="0.02" floodColor={ink.glow} floodOpacity="0.7" />
        </filter>
      </defs>

      {layoutMode === "columns" &&
        graph.layers.map((layer) => {
          const xs = graph.nodes
            .filter((n) => n.layer === layer.id)
            .map((n) => displayPositions.get(n.id)?.x)
            .filter((x): x is number => typeof x === "number");
          if (!xs.length) return null;
          const x = xs.reduce((a, b) => a + b, 0) / xs.length;
          return (
            <text
              key={`col-${layer.id}`}
              x={x}
              y={headerY}
              textAnchor="middle"
              fontSize={0.07 * Math.min(1.2, fontScale)}
              fill={layer.color}
              opacity={0.9}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {layer.label}
            </text>
          );
        })}

      {graph.edges.map((edge, i) => (
        <EdgeLine
          key={`${edge.source}-${edge.target}-${i}`}
          edge={edge}
          nodeMap={nodeMap}
          dimmed={!!focusIds && !(focusIds.has(edge.source) && focusIds.has(edge.target))}
          fontSize={edgeFont}
          ink={ink}
        />
      ))}

      {graph.nodes.map((node) => {
        const pos = displayPositions.get(node.id) ?? { x: node.x, y: node.y };
        const inFocus = !focusIds || focusIds.has(node.id);
        const dimmed = !!focusIds && !inFocus;
        const selected = selectedId === node.id;
        const r = nodeRadius(node);
        return (
          <g
            key={node.id}
            className="node"
            transform={`translate(${pos.x}, ${pos.y})`}
            opacity={dimmed ? 0.12 : 1}
            onPointerDown={(e) => onNodePointerDown(e, node.id)}
            style={{ cursor: "grab" }}
          >
            <circle
              r={selected ? r * 1.15 : r}
              fill={node.color}
              stroke={
                selected
                  ? ink.selectedStroke
                  : node.missing
                    ? "#e06c75"
                    : ink.nodeStroke
              }
              strokeWidth={selected ? 0.028 : 0.008}
              filter={selected ? "url(#selected-glow)" : undefined}
            />
            <text
              y={(selected ? r * 1.15 : r) + fontSize * 1.15}
              textAnchor="middle"
              fontSize={fontSize}
              fill={selected ? ink.labelSelected : ink.label}
              fontWeight={selected ? 600 : 400}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {node.label.split("\n").map((line, idx) => (
                <tspan key={idx} x={0} dy={idx === 0 ? 0 : fontSize * 1.1}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EdgeLine({
  edge,
  nodeMap,
  dimmed,
  fontSize,
  ink,
}: {
  edge: GraphEdge;
  nodeMap: Map<string, GraphNode & NodePos>;
  dimmed: boolean;
  fontSize: number;
  ink: ReturnType<typeof canvasInk>;
}) {
  const a = nodeMap.get(edge.source);
  const b = nodeMap.get(edge.target);
  if (!a || !b) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return (
    <g opacity={dimmed ? 0.12 : 0.85}>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={edge.edgeKind === "inferred" ? ink.edgeInferred : ink.edge}
        strokeWidth={0.01}
        strokeDasharray={edge.edgeKind === "inferred" ? "0.03 0.02" : undefined}
        markerEnd="url(#arrow)"
      />
      {edge.operator ? (
        <text x={mx} y={my - 0.02} textAnchor="middle" fontSize={fontSize} fill={ink.edgeLabel}>
          {edge.operator}
        </text>
      ) : null}
    </g>
  );
}
