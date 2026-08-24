import type { GraphPayload } from "./types";

/*
 * The layer legend, floating over the canvas instead of occupying a column.
 * Core and service are kept apart because the distinction is ontological, not
 * cosmetic: the four core layers carry the computation.
 */

type Props = {
  graph: GraphPayload;
  onClose: () => void;
  activeLayer: string | null;
  onLayerClick: (layer: string | null) => void;
};

export function LegendOverlay({ graph, onClose, activeLayer, onLayerClick }: Props) {
  const count = (id: string) =>
    graph.project?.layerCounts?.[id] ?? graph.nodes.filter((n) => n.layer === id).length;

  const group = (g: "core" | "service", title: string) => {
    const rows = graph.layers.filter((l) => l.group === g);
    if (!rows.length) return null;
    return (
      <div className="legend-group">
        <h4>{title}</h4>
        {rows.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`legend-row ${activeLayer === l.id ? "active" : ""}`}
            onClick={() => onLayerClick(activeLayer === l.id ? null : l.id)}
            title={`Highlight ${l.label}`}
          >
            <span className="swatch" style={{ background: l.color }} />
            <span className="legend-label">{l.label}</span>
            <span className="count">{count(l.id)}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="overlay-card legend-overlay">
      <header className="overlay-head">
        <h3>Ontology layers</h3>
        <button type="button" className="overlay-close" onClick={onClose} title="Hide legend">
          ✕
        </button>
      </header>
      {group("core", "Core")}
      {group("service", "Service")}
      <p className="legend-foot">
        {graph.stats.nodeCount} nodes · {graph.stats.edgeCount} edges
      </p>
    </div>
  );
}
