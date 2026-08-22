export type GraphNode = {
  id: string;
  label: string;
  layer: string;
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
  missing?: boolean;
  data?: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  operator: string;
  plugin: string;
  datalinkId?: string;
  edgeKind?: string;
  sequence?: number | null;
};

export type GraphLayer = {
  id: string;
  label: string;
  color: string;
  group: "core" | "service" | string;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  layers: GraphLayer[];
  stats: { nodeCount: number; edgeCount: number };
  project?: {
    name?: string;
    description?: string;
    layerCounts?: Record<string, number>;
  };
};
