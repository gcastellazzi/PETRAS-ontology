import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { GraphEdge, GraphNode, GraphPayload } from "./types";

type Props = {
  graph: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusIds?: Set<string> | null;
};

function useViewBox(nodes: GraphNode[]) {
  return useMemo(() => {
    if (!nodes.length) return { minX: -1.2, minY: -1.2, width: 2.4, height: 2.4 };
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const pad = 0.35;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return {
      minX,
      minY,
      width: Math.max(0.5, maxX - minX),
      height: Math.max(0.5, maxY - minY),
    };
  }, [nodes]);
}

export function GraphCanvas({ graph, selectedId, onSelect, focusIds }: Props) {
  const vb = useViewBox(graph.nodes);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes]);

  const onWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.35, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if ((e.target as Element).closest(".node")) return;
      drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onPointerMove = useCallback((e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) * 0.004;
    const dy = (e.clientY - drag.current.y) * 0.004;
    setPan({ x: drag.current.panX + dx, y: drag.current.panY - dy });
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const cx = vb.minX + vb.width / 2 + pan.x;
  const cy = vb.minY + vb.height / 2 + pan.y;
  const viewBox = `${cx - (vb.width / 2) / zoom} ${cy - (vb.height / 2) / zoom} ${vb.width / zoom} ${vb.height / zoom}`;

  return (
    <svg
      className="graph-canvas"
      viewBox={viewBox}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa0a6" />
        </marker>
      </defs>
      {graph.edges.map((edge, i) => (
        <EdgeLine key={`${edge.source}-${edge.target}-${i}`} edge={edge} nodeMap={nodeMap} dimmed={!!focusIds && !(focusIds.has(edge.source) && focusIds.has(edge.target))} />
      ))}
      {graph.nodes.map((node) => {
        const dimmed = !!focusIds && !focusIds.has(node.id);
        const selected = selectedId === node.id;
        const r = 0.035 + Math.min(0.04, (node.size || 12) / 600);
        return (
          <g
            key={node.id}
            className="node"
            transform={`translate(${node.x}, ${node.y})`}
            opacity={dimmed ? 0.18 : 1}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.id);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              r={r}
              fill={node.color}
              stroke={selected ? "#ffffff" : node.missing ? "#e06c75" : "#1e2127"}
              strokeWidth={selected ? 0.018 : 0.008}
            />
            <text
              y={r + 0.06}
              textAnchor="middle"
              fontSize={0.055}
              fill="#d4d7de"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {node.label.split("\n").map((line, idx) => (
                <tspan key={idx} x={0} dy={idx === 0 ? 0 : 0.06}>
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
}: {
  edge: GraphEdge;
  nodeMap: Map<string, GraphNode>;
  dimmed: boolean;
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
        stroke={edge.edgeKind === "inferred" ? "#7f848e" : "#9aa0a6"}
        strokeWidth={0.01}
        strokeDasharray={edge.edgeKind === "inferred" ? "0.03 0.02" : undefined}
        markerEnd="url(#arrow)"
      />
      {edge.operator ? (
        <text x={mx} y={my - 0.02} textAnchor="middle" fontSize={0.04} fill="#abb2bf">
          {edge.operator}
        </text>
      ) : null}
    </g>
  );
}
