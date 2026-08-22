import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  complexityIndex,
  complexityRadius,
  type ComplexityInfo,
} from "./complexity";
import {
  computePositions,
  spreadToFill,
  worldPlaneFrame,
  type LayoutMode,
  type NodePos,
} from "./layout";
import type { GraphEdge, GraphNode, GraphPayload } from "./types";
import { canvasInk, isLightBg, type CanvasInk } from "./theme";

type Props = {
  graph: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusIds?: Set<string> | null;
  layoutMode: LayoutMode;
  sphereScale: number;
  avoidOverlap: boolean;
  backgroundColor?: string;
};

const LAYER_Z: Record<string, number> = {
  datalake: -2.5,
  datasets: -1.5,
  datastore: -0.5,
  datasources: 0.5,
  analytics: 1.5,
  reports: 2.5,
  unknown: 3.5,
};

/** 4:3 layer planes (width × height). Nodes are mapped inside with a margin. */
const PLANE = worldPlaneFrame(12);
const PLANE_MARGIN = 0.08;
const PLANE_CONTENT = {
  minX: PLANE.minX + PLANE.width * PLANE_MARGIN,
  minY: PLANE.minY + PLANE.height * PLANE_MARGIN,
  width: PLANE.width * (1 - 2 * PLANE_MARGIN),
  height: PLANE.height * (1 - 2 * PLANE_MARGIN),
};

function layerZ(layer: string): number {
  return LAYER_Z[layer] ?? LAYER_Z.unknown;
}

type Pos3 = { x: number; y: number; z: number };

function NodeSphere({
  node,
  pos,
  radius,
  selected,
  dimmed,
  onSelect,
  showLabel,
  ink,
  light,
}: {
  node: GraphNode;
  pos: Pos3;
  radius: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  showLabel: boolean;
  ink: CanvasInk;
  light: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const r = selected ? radius * 1.25 : hovered ? radius * 1.1 : radius;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[r, 24, 24]} />
        <meshStandardMaterial
          color={node.color}
          emissive={selected ? ink.selectedStroke : node.color}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.18 : 0.04}
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={dimmed ? 0.12 : node.missing ? 0.55 : 0.95}
        />
      </mesh>
      {showLabel ? (
        <Html
          center
          distanceFactor={10}
          style={{
            pointerEvents: "none",
            color: selected ? ink.labelSelected : ink.label,
            fontSize: "11px",
            fontWeight: selected ? 600 : 400,
            whiteSpace: "nowrap",
            textShadow: light ? "0 1px 2px #fff8" : "0 1px 3px #000c",
            opacity: dimmed ? 0.2 : 1,
            transform: "translateY(14px)",
          }}
        >
          {node.label.split("\n")[0]}
        </Html>
      ) : null}
    </group>
  );
}

function EdgeLines({
  edges,
  positions,
  focusIds,
  ink,
}: {
  edges: GraphEdge[];
  positions: Map<string, Pos3>;
  focusIds?: Set<string> | null;
  ink: CanvasInk;
}) {
  const { focused, other } = useMemo(() => {
    const f: [number, number, number][] = [];
    const o: [number, number, number][] = [];
    for (const e of edges) {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) continue;
      const seg: [number, number, number][] = [
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
      ];
      const inFocus =
        !focusIds || (focusIds.has(e.source) && focusIds.has(e.target));
      if (inFocus) f.push(...seg);
      else o.push(...seg);
    }
    return { focused: f, other: o };
  }, [edges, positions, focusIds]);

  return (
    <>
      {other.length >= 2 ? (
        <Line points={other} segments color={ink.edgeInferred} lineWidth={0.6} transparent opacity={0.2} />
      ) : null}
      {focused.length >= 2 ? (
        <Line points={focused} segments color={ink.edge} lineWidth={1.2} transparent opacity={0.75} />
      ) : null}
    </>
  );
}

function LayerPlanes({ layers }: { layers: GraphPayload["layers"] }) {
  return (
    <>
      {layers.map((layer) => {
        const z = layerZ(layer.id);
        return (
          <mesh key={layer.id} position={[0, 0, z]}>
            <planeGeometry args={[PLANE.width, PLANE.height]} />
            <meshBasicMaterial
              color={layer.color}
              transparent
              opacity={0.045}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Scene({
  graph,
  selectedId,
  onSelect,
  focusIds,
  layoutMode,
  sphereScale,
  avoidOverlap,
  complexity,
  backgroundColor = "#0f1115",
}: Props & { complexity: Map<string, ComplexityInfo> }) {
  const ink = useMemo(() => canvasInk(backgroundColor), [backgroundColor]);
  const light = isLightBg(backgroundColor);

  const positions2d = useMemo(() => {
    const layout = computePositions(graph, layoutMode, {
      nodeRadius: (n) => complexityRadius(complexity.get(n.id), sphereScale),
      fontSize: 0.06,
      avoidOverlap,
    });
    // Map layout into the 4:3 plane content so nodes stay on the slabs.
    return spreadToFill(layout, PLANE_CONTENT, { x: true, y: true });
  }, [graph, layoutMode, sphereScale, avoidOverlap, complexity]);

  const positions3d = useMemo(() => {
    const m = new Map<string, Pos3>();
    for (const n of graph.nodes) {
      const p: NodePos = positions2d.get(n.id) ?? { x: n.x, y: n.y };
      m.set(n.id, {
        x: p.x,
        y: p.y,
        z: layerZ(n.layer),
      });
    }
    return m;
  }, [graph.nodes, positions2d]);

  return (
    <>
      <color attach="background" args={[backgroundColor]} />
      <ambientLight intensity={light ? 0.85 : 0.55} />
      <directionalLight position={[6, 10, 4]} intensity={light ? 0.9 : 1.1} />
      <directionalLight position={[-4, -2, -6]} intensity={light ? 0.25 : 0.35} />
      <fog attach="fog" args={[backgroundColor, ink.fogNear, ink.fogFar]} />

      <LayerPlanes layers={graph.layers} />
      <EdgeLines edges={graph.edges} positions={positions3d} focusIds={focusIds} ink={ink} />

      {graph.nodes.map((node) => {
        const pos = positions3d.get(node.id);
        if (!pos) return null;
        const info = complexity.get(node.id);
        const selected = selectedId === node.id;
        const dimmed = !!focusIds && !focusIds.has(node.id);
        const showLabel = selected || (!!focusIds && focusIds.has(node.id) && focusIds.size <= 24);
        return (
          <NodeSphere
            key={node.id}
            node={node}
            pos={pos}
            radius={complexityRadius(info, sphereScale)}
            selected={selected}
            dimmed={dimmed}
            onSelect={onSelect}
            showLabel={showLabel}
            ink={ink}
            light={light}
          />
        );
      })}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={40}
      />
    </>
  );
}

export function GraphCanvas3D(props: Props) {
  const complexity = useMemo(() => complexityIndex(props.graph), [props.graph]);
  const bg = props.backgroundColor ?? "#0f1115";
  const ink = canvasInk(bg);

  return (
    <div className="graph-canvas-3d" style={{ background: bg }}>
      <Canvas
        camera={{ position: [0, -14, 8], fov: 45, near: 0.1, far: 120 }}
        dpr={[1, 1.75]}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Scene {...props} complexity={complexity} />
      </Canvas>
      <div className="canvas-3d-hint" style={{ color: ink.hint }}>
        Drag to orbit · scroll zoom · click node · size ∝ complexity
      </div>
    </div>
  );
}
