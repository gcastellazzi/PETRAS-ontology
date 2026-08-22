import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphPayload } from "./types";
import "./App.css";

const DEMO_URL = "./demos/cathedral-shell/graph.json";

function provenanceIds(graph: GraphPayload, centerId: string, hops = 8): Set<string> {
  const keep = new Set<string>([centerId]);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!preds.has(e.target)) preds.set(e.target, []);
    if (!succs.has(e.source)) succs.set(e.source, []);
    preds.get(e.target)!.push(e.source);
    succs.get(e.source)!.push(e.target);
  }
  let frontier = [centerId];
  for (let i = 0; i < hops; i++) {
    const next: string[] = [];
    for (const n of frontier) for (const p of preds.get(n) || []) if (!keep.has(p)) { keep.add(p); next.push(p); }
    frontier = next;
    if (!frontier.length) break;
  }
  frontier = [centerId];
  for (let i = 0; i < hops; i++) {
    const next: string[] = [];
    for (const n of frontier) for (const s of succs.get(n) || []) if (!keep.has(s)) { keep.add(s); next.push(s); }
    frontier = next;
    if (!frontier.length) break;
  }
  return keep;
}

export default function App() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"project" | "provenance">("project");
  const [hideMissing, setHideMissing] = useState(false);

  useEffect(() => {
    fetch(DEMO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${DEMO_URL}`);
        return r.json();
      })
      .then((data: GraphPayload) => setGraph(data))
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!graph) return null;
    if (!hideMissing) return graph;
    const nodes = graph.nodes.filter((n) => !n.missing);
    const ids = new Set(nodes.map((n) => n.id));
    return {
      ...graph,
      nodes,
      edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
      stats: {
        nodeCount: nodes.length,
        edgeCount: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).length,
      },
    };
  }, [graph, hideMissing]);

  const focusIds = useMemo(() => {
    if (!filtered || mode !== "provenance" || !selectedId) return null;
    return provenanceIds(filtered, selectedId);
  }, [filtered, mode, selectedId]);

  const selected = filtered?.nodes.find((n) => n.id === selectedId) || null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PETRAS Graph Viewer</h1>
          <p className="subtitle">
            Seven-layer provenance maps for structural digital twins
          </p>
        </div>
        <div className="controls">
          <label>
            View{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value as "project" | "provenance")}>
              <option value="project">Project map</option>
              <option value="provenance">Provenance (selected)</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={hideMissing} onChange={(e) => setHideMissing(e.target.checked)} />
            Hide missing
          </label>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar left">
          <h2>Ontology layers</h2>
          {filtered ? (
            <>
              <div className="layer-group">
                <h3>Core</h3>
                {filtered.layers.filter((l) => l.group === "core").map((l) => (
                  <div key={l.id} className="legend-row">
                    <span className="swatch" style={{ background: l.color }} />
                    <span>{l.label}</span>
                    <span className="count">{filtered.project?.layerCounts?.[l.id] ?? filtered.nodes.filter((n) => n.layer === l.id).length}</span>
                  </div>
                ))}
              </div>
              <div className="layer-group">
                <h3>Service</h3>
                {filtered.layers.filter((l) => l.group === "service").map((l) => (
                  <div key={l.id} className="legend-row">
                    <span className="swatch" style={{ background: l.color }} />
                    <span>{l.label}</span>
                    <span className="count">{filtered.project?.layerCounts?.[l.id] ?? filtered.nodes.filter((n) => n.layer === l.id).length}</span>
                  </div>
                ))}
              </div>
              <p className="stats">
                {filtered.stats.nodeCount} nodes · {filtered.stats.edgeCount} edges
                {filtered.layout ? ` · layout ${filtered.layout}` : ""}
              </p>
            </>
          ) : (
            <p>{error || "Loading…"}</p>
          )}
        </aside>

        <section className="canvas-wrap">
          {filtered ? (
            <GraphCanvas
              graph={filtered}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) setMode("provenance");
              }}
              focusIds={focusIds}
            />
          ) : (
            <div className="empty">{error || "Loading demo graph…"}</div>
          )}
        </section>

        <aside className="sidebar right">
          <h2>Entity</h2>
          {selected ? (
            <div className="entity-detail">
              <div className="badge" style={{ background: selected.color }}>{selected.layer}</div>
              <h3>{selected.label}</h3>
              <dl>
                <dt>@id</dt>
                <dd><code>{selected.id}</code></dd>
                <dt>@type</dt>
                <dd>{selected.type || "—"}</dd>
              </dl>
              <pre>{JSON.stringify(selected.data || {}, null, 2)}</pre>
            </div>
          ) : (
            <p className="hint">Click a node to inspect metadata and highlight its provenance neighbourhood.</p>
          )}
          <div className="about">
            <h2>About PETRAS</h2>
            <p>
              Provenance-Enabled digital Twin ontology for Restoration and Structural Analysis.
              This viewer shows connectivity maps only — no geometry payloads.
            </p>
            <p className="demo-name">{graph?.project?.name || "Cathedral Shell"}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
