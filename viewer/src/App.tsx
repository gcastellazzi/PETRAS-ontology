import { useEffect, useMemo, useState } from "react";
import { complexityIndex } from "./complexity";
import { forDisplay } from "./displayGraph";
import { GraphCanvas } from "./GraphCanvas";
import { GraphCanvas3D } from "./GraphCanvas3D";
import type { LayoutCommand, LayoutCommandKind, LayoutMode } from "./layout";
import { BG_PRESETS } from "./theme";
import type { GraphPayload } from "./types";
import "./App.css";

type DimMode = "2d" | "3d";

type DemoInfo = {
  id: string;
  label: string;
  description: string;
  url: string;
};

const DEMOS: DemoInfo[] = [
  {
    id: "cathedral-shell",
    label: "Cathedral Shell",
    description: "Synthetic empty-shell demo (all 7 layers, small)",
    url: "./demos/cathedral-shell/graph.json",
  },
  {
    id: "benchmark-shell",
    label: "Benchmark Shell",
    description: "Structure from Project_PETRAS_Benchmark (no binaries)",
    url: "./demos/benchmark-shell/graph.json",
  },
];

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
    for (const n of frontier) {
      for (const p of preds.get(n) || []) {
        if (!keep.has(p)) {
          keep.add(p);
          next.push(p);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  frontier = [centerId];
  for (let i = 0; i < hops; i++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const s of succs.get(n) || []) {
        if (!keep.has(s)) {
          keep.add(s);
          next.push(s);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return keep;
}

export default function App() {
  const [demoId, setDemoId] = useState(DEMOS[0].id);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"project" | "provenance">("project");
  const [hideMissing, setHideMissing] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("flow");
  const [dimMode, setDimMode] = useState<DimMode>("2d");
  const [sphereScale, setSphereScale] = useState(1);
  const [fontScale, setFontScale] = useState(1);
  const [avoidOverlap, setAvoidOverlap] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState(BG_PRESETS[0].color);
  const [layoutCommand, setLayoutCommand] = useState<LayoutCommand | null>(null);

  const issueLayoutCommand = (kind: LayoutCommandKind) => {
    setLayoutCommand({ kind, id: Date.now() });
  };

  const activeDemo = DEMOS.find((d) => d.id === demoId) ?? DEMOS[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelectedId(null);
    setMode("project");

    fetch(activeDemo.url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${activeDemo.url}`);
        return r.json();
      })
      .then((data: GraphPayload) => {
        if (!cancelled) {
          setGraph(data);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDemo.url]);

  const filtered = useMemo(() => {
    if (!graph) return null;
    return forDisplay(graph, { hideMissing, hideIsolated });
  }, [graph, hideMissing, hideIsolated]);

  useEffect(() => {
    if (!selectedId || !filtered) return;
    if (!filtered.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  const focusIds = useMemo(() => {
    if (!filtered || !selectedId || mode !== "provenance") return null;
    return provenanceIds(filtered, selectedId);
  }, [filtered, mode, selectedId]);

  const selected = filtered?.nodes.find((n) => n.id === selectedId) || null;
  const complexity = useMemo(
    () => (filtered ? complexityIndex(filtered) : null),
    [filtered],
  );
  const selectedComplexity = selectedId ? complexity?.get(selectedId) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PETRAS Graph Viewer</h1>
          <p className="subtitle">
            Provenance maps for structural digital twins — DataLinks shown as edges
          </p>
        </div>
        <div className="controls">
          <label>
            Demo{" "}
            <select value={demoId} onChange={(e) => setDemoId(e.target.value)}>
              {DEMOS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Layout{" "}
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            >
              <option value="flow">Flow (provenance depth)</option>
              <option value="columns">Columns (one per layer)</option>
            </select>
          </label>
          <label>
            Space{" "}
            <select
              value={dimMode}
              onChange={(e) => setDimMode(e.target.value as DimMode)}
            >
              <option value="2d">2D map</option>
              <option value="3d">3D layers</option>
            </select>
          </label>
          <label>
            View{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "project" | "provenance")}
            >
              <option value="project">Project map</option>
              <option value="provenance">Provenance (selected)</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={avoidOverlap}
              onChange={(e) => setAvoidOverlap(e.target.checked)}
            />
            Avoid overlap
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hideMissing}
              onChange={(e) => setHideMissing(e.target.checked)}
            />
            Hide missing
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hideIsolated}
              onChange={(e) => setHideIsolated(e.target.checked)}
            />
            Hide unconnected
          </label>
        </div>
      </header>

      <div className="toolbar">
        <label className="slider">
          <span>Spheres</span>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.05}
            value={sphereScale}
            onChange={(e) => setSphereScale(Number(e.target.value))}
          />
          <span className="slider-val">{sphereScale.toFixed(2)}×</span>
        </label>
        {dimMode === "2d" ? (
          <label className="slider">
            <span>Text</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
            />
            <span className="slider-val">{fontScale.toFixed(2)}×</span>
          </label>
        ) : null}
        <label className="bg-control">
          <span>Background</span>
          <select
            value={
              BG_PRESETS.some((p) => p.color === backgroundColor)
                ? backgroundColor
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value !== "custom") setBackgroundColor(e.target.value);
            }}
          >
            {BG_PRESETS.map((p) => (
              <option key={p.id} value={p.color}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          <input
            type="color"
            className="bg-swatch"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            title="Pick background colour"
          />
        </label>
        {dimMode === "2d" ? (
          <div className="layout-actions">
            <button type="button" onClick={() => issueLayoutCommand("fill")} title="Reposition nodes to fill the 4:3 view (no zoom)">
              Fill view
            </button>
            <button type="button" onClick={() => issueLayoutCommand("spread-x")} title="Reposition horizontally only (no zoom)">
              Fit ↔
            </button>
            <button type="button" onClick={() => issueLayoutCommand("spread-y")} title="Reposition vertically only (no zoom)">
              Fit ↕
            </button>
            <button type="button" onClick={() => issueLayoutCommand("reset")} title="Reset positions, pan and zoom (4:3 frame)">
              Reset layout
            </button>
          </div>
        ) : null}
        <p className="toolbar-hint">
          {activeDemo.description}
          {dimMode === "3d"
            ? " · Orbit · scroll zoom · sphere size ∝ complexity"
            : " · Drag nodes · pan · scroll zoom · Fit moves nodes only (4:3)"}
        </p>
      </div>

      <div className="main">
        <aside className="sidebar left">
          <h2>Ontology layers</h2>
          {filtered ? (
            <>
              <div className="layer-group">
                <h3>Core</h3>
                {filtered.layers
                  .filter((l) => l.group === "core")
                  .map((l) => (
                    <div key={l.id} className="legend-row">
                      <span className="swatch" style={{ background: l.color }} />
                      <span>{l.label}</span>
                      <span className="count">
                        {filtered.project?.layerCounts?.[l.id] ??
                          filtered.nodes.filter((n) => n.layer === l.id).length}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="layer-group">
                <h3>Service</h3>
                {filtered.layers
                  .filter((l) => l.group === "service")
                  .map((l) => (
                    <div key={l.id} className="legend-row">
                      <span className="swatch" style={{ background: l.color }} />
                      <span>{l.label}</span>
                      <span className="count">
                        {filtered.project?.layerCounts?.[l.id] ??
                          filtered.nodes.filter((n) => n.layer === l.id).length}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="stats">
                {filtered.stats.nodeCount} nodes · {filtered.stats.edgeCount} edges
                {" · "}
                {layoutMode === "columns" ? "columns" : "flow"}
              </p>
            </>
          ) : (
            <p>{error || (loading ? "Loading…" : "No graph")}</p>
          )}
        </aside>

        <section className="canvas-wrap" style={{ background: backgroundColor }}>
          {filtered ? (
            dimMode === "3d" ? (
              <GraphCanvas3D
                key={`${demoId}-3d`}
                graph={filtered}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id) setMode("provenance");
                }}
                focusIds={focusIds}
                layoutMode={layoutMode}
                sphereScale={sphereScale}
                avoidOverlap={avoidOverlap}
                backgroundColor={backgroundColor}
              />
            ) : (
              <GraphCanvas
                key={`${demoId}-2d`}
                graph={filtered}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id) setMode("provenance");
                }}
                focusIds={focusIds}
                layoutMode={layoutMode}
                sphereScale={sphereScale}
                fontScale={fontScale}
                avoidOverlap={avoidOverlap}
                backgroundColor={backgroundColor}
                layoutCommand={layoutCommand}
                onLayoutCommandHandled={(id) => {
                  setLayoutCommand((cmd) => (cmd?.id === id ? null : cmd));
                }}
              />
            )
          ) : (
            <div className="empty">{error || (loading ? "Loading demo graph…" : "No graph")}</div>
          )}
        </section>

        <aside className="sidebar right">
          <h2>Entity</h2>
          {selected ? (
            <div className="entity-detail">
              <div className="badge" style={{ background: selected.color }}>
                {selected.layer}
              </div>
              <h3>{selected.label}</h3>
              <dl>
                <dt>@id</dt>
                <dd>
                  <code>{selected.id}</code>
                </dd>
                <dt>@type</dt>
                <dd>{selected.type || "—"}</dd>
                <dt>Complexity</dt>
                <dd>
                  {selectedComplexity
                    ? `degree ${selectedComplexity.degree} · score ${selectedComplexity.score.toFixed(1)} · ${(selectedComplexity.norm * 100).toFixed(0)}% of max`
                    : "—"}
                </dd>
              </dl>
              <pre>{JSON.stringify(selected.data || {}, null, 2)}</pre>
            </div>
          ) : (
            <p className="hint">
              Click a node to select it and highlight its provenance neighbourhood.
              Drag a node to move it.
            </p>
          )}
          <div className="about">
            <h2>About PETRAS</h2>
            <p>
              Provenance-Enabled digital Twin ontology for Restoration and Structural Analysis.
              This viewer shows connectivity maps only — no geometry payloads.
            </p>
            <p className="demo-name">
              {graph?.project?.name || activeDemo.label}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
