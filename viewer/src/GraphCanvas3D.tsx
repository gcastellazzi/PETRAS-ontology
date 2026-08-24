import { Canvas, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
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

export type View3DPresetId =
  | "isometric"
  | "front"
  | "side"
  | "top"
  | "layers"
  | "back";

export type View3DPreset = {
  id: View3DPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
};

/** Predefined camera setups for the layer stack (Z = ontology layer). */
export const VIEW_3D_PRESETS: View3DPreset[] = [
  {
    id: "isometric",
    label: "Isometric",
    position: [0, -14, 8],
    target: [0, 0, 0],
  },
  {
    id: "front",
    label: "Front",
    position: [0, -18, 0.5],
    target: [0, 0, 0],
  },
  {
    id: "side",
    label: "Side",
    position: [18, 0, 1],
    target: [0, 0, 0],
  },
  {
    id: "top",
    label: "Top",
    position: [0, 0.01, 20],
    target: [0, 0, 0],
  },
  {
    id: "layers",
    label: "Layer stack",
    position: [12, -6, 2],
    target: [0, 0, 0],
  },
  {
    id: "back",
    label: "Back",
    position: [0, 16, 7],
    target: [0, 0, 0],
  },
];

export type LayerLabelSide = "back" | "front";

/** Displacement of a layer name from its anchoring corner, in world units. */
export type LayerLabelOffset = { x: number; y: number; z: number };

/**
 * Where each side starts from. Both are measured inward from the plane's left
 * corner, so x always runs into the plane and y always runs away from the
 * anchored edge. The front needs a larger x than the back because the near
 * corner projects further left under the isometric camera and would otherwise
 * sit outside the frustum.
 */
export const LAYER_LABEL_DEFAULTS: Record<LayerLabelSide, LayerLabelOffset> = {
  back: { x: 0.35, y: 0.45, z: 0.35 },
  front: { x: 4.2, y: 1.6, z: 0.35 },
};

type Props = {
  graph: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusIds?: Set<string> | null;
  layoutMode: LayoutMode;
  sphereScale: number;
  fontScale?: number;
  avoidOverlap: boolean;
  backgroundColor?: string;
  viewPreset?: View3DPresetId;
  showLayerLabels?: boolean;
  /** Which edge of each layer plane carries its name. */
  layerLabelSide?: LayerLabelSide;
  layerLabelOffset?: LayerLabelOffset;
  layerOpacity?: number;
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
  fontScale,
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
  fontScale: number;
  ink: CanvasInk;
  light: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const r = selected ? radius * 1.25 : hovered ? radius * 1.1 : radius;
  const labelPx = Math.round(11 * fontScale);

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
            fontSize: `${labelPx}px`,
            fontWeight: selected ? 600 : 400,
            whiteSpace: "nowrap",
            textShadow: light ? "0 1px 2px #fff8" : "0 1px 3px #000c",
            opacity: dimmed ? 0.2 : 1,
            transform: `translateY(${Math.round(14 * fontScale)}px)`,
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

function LayerPlanes({
  layers,
  opacity,
}: {
  layers: GraphPayload["layers"];
  opacity: number;
}) {
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
              opacity={opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

function LayerNameLabels({
  layers,
  visible,
  light,
  fontScale,
  side,
  offset,
}: {
  layers: GraphPayload["layers"];
  visible: boolean;
  light: boolean;
  fontScale: number;
  side: LayerLabelSide;
  offset: LayerLabelOffset;
}) {
  if (!visible) return null;
  // Anchored to the left corner of the chosen edge — the far edge reads as the
  // back of the stack, the near edge as its front — and displaced from there
  // by the offsets the reader controls. The z term lifts each name clear of
  // its own plane, so it reads as a label on the layer rather than a mark
  // printed into it.
  const front = side === "front";
  const anchorY = front ? PLANE.minY : PLANE.minY + PLANE.height;
  const x = PLANE.minX + offset.x;
  const y = front ? anchorY + offset.y : anchorY - offset.y;
  const labelPx = Math.round(13 * fontScale);
  return (
    <>
      {layers.map((layer) => (
        <Html
          key={`label-${layer.id}`}
          position={[x, y, layerZ(layer.id) + offset.z]}
          style={{
            pointerEvents: "none",
            color: layer.color,
            fontSize: `${labelPx}px`,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            textShadow: light ? "0 1px 2px #fff9" : "0 1px 4px #000d",
            padding: "2px 6px",
            borderLeft: `3px solid ${layer.color}`,
            background: light ? "rgba(255,255,255,0.55)" : "rgba(15,17,21,0.55)",
            borderRadius: "2px",
          }}
        >
          {layer.label}
        </Html>
      ))}
    </>
  );
}

function CameraPreset({
  presetId,
  controlsRef,
}: {
  presetId: View3DPresetId;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const preset = VIEW_3D_PRESETS.find((p) => p.id === presetId) ?? VIEW_3D_PRESETS[0];
    // Re-apply when the user picks the same preset again via a bump key from parent.
    camera.position.set(...preset.position);
    camera.near = 0.1;
    camera.far = 120;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...preset.target);
      controls.update();
    }
    applied.current = presetId;
  }, [presetId, camera, controlsRef]);

  return null;
}

function Scene({
  graph,
  selectedId,
  onSelect,
  focusIds,
  layoutMode,
  sphereScale,
  fontScale = 1,
  avoidOverlap,
  complexity,
  backgroundColor = "#0f1115",
  viewPreset = "isometric",
  showLayerLabels = true,
  layerLabelSide = "back",
  layerLabelOffset,
  layerOpacity = 0.045,
  viewNonce = 0,
}: Props & { complexity: Map<string, ComplexityInfo>; viewNonce?: number }) {
  const ink = useMemo(() => canvasInk(backgroundColor), [backgroundColor]);
  const light = isLightBg(backgroundColor);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const positions2d = useMemo(() => {
    const layout = computePositions(graph, layoutMode, {
      nodeRadius: (n) => complexityRadius(complexity.get(n.id), sphereScale),
      fontSize: 0.06 * fontScale,
      avoidOverlap,
    });
    return spreadToFill(layout, PLANE_CONTENT, { x: true, y: true });
  }, [graph, layoutMode, sphereScale, fontScale, avoidOverlap, complexity]);

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

      <LayerPlanes layers={graph.layers} opacity={layerOpacity} />
      <LayerNameLabels
        layers={graph.layers}
        visible={showLayerLabels}
        light={light}
        fontScale={fontScale}
        side={layerLabelSide}
        offset={layerLabelOffset ?? LAYER_LABEL_DEFAULTS[layerLabelSide]}
      />
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
            fontScale={fontScale}
            ink={ink}
            light={light}
          />
        );
      })}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={40}
      />
      <CameraPreset
        key={`${viewPreset}-${viewNonce}`}
        presetId={viewPreset}
        controlsRef={controlsRef}
      />
    </>
  );
}

export function GraphCanvas3D(
  props: Props & { viewNonce?: number },
) {
  const complexity = useMemo(() => complexityIndex(props.graph), [props.graph]);
  const bg = props.backgroundColor ?? "#0f1115";
  const preset =
    VIEW_3D_PRESETS.find((p) => p.id === (props.viewPreset ?? "isometric")) ??
    VIEW_3D_PRESETS[0];

  return (
    <div className="graph-canvas-3d" style={{ background: bg }}>
      <Canvas
        camera={{ position: preset.position, fov: 45, near: 0.1, far: 120 }}
        dpr={[1, 1.75]}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Scene {...props} complexity={complexity} />
      </Canvas>
      {props.showLayerLabels ? (
        <div className="canvas-3d-layer-legend" aria-hidden>
          {props.graph.layers.map((layer) => (
            <span key={layer.id} style={{ color: layer.color }}>
              {layer.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
