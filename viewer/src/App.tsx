import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompetencyPanel } from "./CompetencyPanel";
import { entitiesInQuestion, type CqAnswers } from "./cq";
import { complexityIndex } from "./complexity";
import { forDisplay } from "./displayGraph";
import { DocsDialog } from "./DocsDialog";
import { GraphCanvas } from "./GraphCanvas";
import {
  GraphCanvas3D,
  LAYER_LABEL_DEFAULTS,
  type LayerLabelOffset,
  type LayerLabelSide,
} from "./GraphCanvas3D";
import { GraphicsDrawer } from "./GraphicsDrawer";
import { LayerDocsShort } from "./docs";
import { LegendOverlay } from "./LegendOverlay";
import { PetrasLogo } from "./PetrasLogo";
import {
  buildSnapshotCanvas,
  cornerIsLight,
  buildSnapshotSvg,
  downloadSvg,
  printSvg,
  snapshotCanvasPng,
} from "./snapshot";
import type { LayoutCommand, LayoutCommandKind, LayoutMode } from "./layout";
import { THEME_CANVAS, type ThemeId } from "./theme";
import type { GraphPayload } from "./types";
import "./App.css";

type DimMode = "2d" | "3d";

/**
 * Below this on-screen label size the 2D map stops being readable, and the
 * layered 3D view — which spreads the same graph over seven planes — carries it
 * better. Calibrated on the two demos: the small project renders labels around
 * 8.5 px, the benchmark around 4.5 px.
 */
const LABEL_FLOOR_PX = 6.5;

type DemoInfo = {
  id: string;
  label: string;
  description: string;
  url: string;
  cqUrl: string;
};

const DEMOS: DemoInfo[] = [
  {
    id: "cathedral-shell",
    label: "Demo example",
    description: "Synthetic empty-shell demo (all 7 layers, small)",
    url: "./demos/cathedral-shell/graph.json",
    cqUrl: "./demos/cathedral-shell/cq-answers.json",
  },
  {
    id: "benchmark-shell",
    label: "Benchmark Shell",
    description: "Structure from Project_PETRAS_Benchmark (no binaries)",
    url: "./demos/benchmark-shell/graph.json",
    cqUrl: "./demos/benchmark-shell/cq-answers.json",
  },
];

const MENU_ITEMS: { id: string; label: string }[] = [
  { id: "about", label: "About / credits" },
  { id: "paper", label: "Paper" },
  { id: "details", label: "Details" },
  { id: "graphics", label: "Set graphics" },
  { id: "standards", label: "Standards" },
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
  // Missing, unconnected and unclassified entities are all hidden by default:
  // the map is about what the project actually produced, how it is linked, and
  // where it sits in the ontology. The three switches in Set graphics bring
  // them back when someone wants to audit the gaps instead.
  const [hideMissing, setHideMissing] = useState(true);
  const [hideIsolated, setHideIsolated] = useState(true);
  const [hideUnknown, setHideUnknown] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("flow");
  const [dimMode, setDimMode] = useState<DimMode>("2d");
  const [sphereScale, setSphereScale] = useState(1);
  const [fontScale, setFontScale] = useState(1);
  const [avoidOverlap, setAvoidOverlap] = useState(true);
  const [layerOpacity, setLayerOpacity] = useState(0.045);
  const [layerLabelSide, setLayerLabelSide] = useState<LayerLabelSide>("back");
  const [layerLabelOffset, setLayerLabelOffset] = useState<LayerLabelOffset>(
    LAYER_LABEL_DEFAULTS.back,
  );
  const [autoDimension, setAutoDimension] = useState(true);
  // Set when the reader asks for 2D explicitly: the automatic switch must not
  // drag them straight back into 3D on the very next frame.
  const [autoHeld, setAutoHeld] = useState(false);
  const [autoSwitched, setAutoSwitched] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [backgroundColor, setBackgroundColor] = useState(THEME_CANVAS.dark);
  const [layoutCommand, setLayoutCommand] = useState<LayoutCommand | null>(null);
  const [cqAnswers, setCqAnswers] = useState<CqAnswers | null>(null);
  const [cqLoading, setCqLoading] = useState(false);
  const [cqError, setCqError] = useState<string | null>(null);
  const [cqSelectedId, setCqSelectedId] = useState<string | null>(null);
  const [cqHighlight, setCqHighlight] = useState(true);
  const [cqFocusIds, setCqFocusIds] = useState<Set<string> | null>(null);

  // Chrome: overlays, menu, dialog, drawer.
  const [showLegend, setShowLegend] = useState(true);
  const [showCq, setShowCq] = useState(true);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docsPage, setDocsPage] = useState<string | null>(null);
  const [docsLayer, setDocsLayer] = useState<string | null>(null);
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const snapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapNote, setSnapNote] = useState<string | null>(null);

  // The theme owns the whole screen. Switching it also resets the canvas to
  // that theme's own background — sand chrome with a white plot area is the
  // combination the paper figures are snapshotted in — after which the
  // background picker is free to override the canvas, and only the canvas.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const applyTheme = (next: ThemeId) => {
    setTheme(next);
    setBackgroundColor(THEME_CANVAS[next]);
  };

  const handleLabelPixels = useCallback(
    (px: number) => {
      if (!autoDimension || autoHeld) return;
      if (px >= LABEL_FLOOR_PX) return;
      setDimMode((m) => (m === "2d" ? "3d" : m));
      setAutoSwitched(true);
    },
    [autoDimension, autoHeld],
  );

  const issueLayoutCommand = (kind: LayoutCommandKind) => {
    setLayoutCommand({ kind, id: Date.now() });
  };

  const activeDemo = DEMOS.find((d) => d.id === demoId) ?? DEMOS[0];

  const openMenuItem = (id: string) => {
    setMenuOpen(false);
    if (id === "graphics") {
      setGraphicsOpen(true);
      return;
    }
    setDocsLayer(null);
    setDocsPage(id);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelectedId(null);
    setMode("project");
    setActiveLayer(null);
    setAutoHeld(false);
    setAutoSwitched(false);

    fetch(activeDemo.url, { cache: "no-cache" })
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

  // Answers are precomputed by `petras export-cq`, so the page stays static.
  useEffect(() => {
    let cancelled = false;
    setCqLoading(true);
    setCqError(null);
    setCqAnswers(null);
    setCqSelectedId(null);
    setCqFocusIds(null);

    fetch(activeDemo.cqUrl, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${activeDemo.cqUrl}`);
        return r.json();
      })
      .then((data: CqAnswers) => {
        if (!cancelled) {
          setCqAnswers(data);
          setCqLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setCqError(e.message);
          setCqLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDemo.cqUrl]);

  const filtered = useMemo(() => {
    if (!graph) return null;
    return forDisplay(graph, { hideMissing, hideIsolated, hideUnknown });
  }, [graph, hideMissing, hideIsolated, hideUnknown]);

  useEffect(() => {
    if (!selectedId || !filtered) return;
    if (!filtered.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  // A selected competency question highlights exactly the entities its answer
  // names; this is what lets a reviewer see which objects answer it, rather
  // than read that it was answered.
  const cqEntityIds = useMemo(() => {
    if (!cqHighlight || !cqAnswers || !cqSelectedId || !filtered) return null;
    const question = cqAnswers.questions.find((q) => q.id === cqSelectedId);
    if (!question) return null;
    const ids = entitiesInQuestion(question, filtered.nodes.map((n) => n.id));
    return ids.size ? ids : null;
  }, [cqAnswers, cqSelectedId, cqHighlight, filtered]);

  const layerIds = useMemo(() => {
    if (!activeLayer || !filtered) return null;
    const ids = new Set(filtered.nodes.filter((n) => n.layer === activeLayer).map((n) => n.id));
    return ids.size ? ids : null;
  }, [activeLayer, filtered]);

  const focusIds = useMemo(() => {
    if (cqEntityIds) return cqEntityIds;
    if (cqFocusIds && cqFocusIds.size) return cqFocusIds;
    if (layerIds) return layerIds;
    if (!filtered || !selectedId || mode !== "provenance") return null;
    return provenanceIds(filtered, selectedId);
  }, [cqEntityIds, cqFocusIds, layerIds, filtered, mode, selectedId]);

  const selected = filtered?.nodes.find((n) => n.id === selectedId) || null;
  const complexity = useMemo(
    () => (filtered ? complexityIndex(filtered) : null),
    [filtered],
  );
  const selectedComplexity = selectedId ? complexity?.get(selectedId) : undefined;

  const projectName = graph?.project?.name || activeDemo.label;

  /** Figure export: vector when the view is vector, raster when it cannot be. */
  const takeSnapshot = useCallback(
    (kind: "pdf" | "svg" | "png") => {
      setSnapOpen(false);
      const stage = stageRef.current;
      if (!stage || !filtered) return;
      const stamp = `petras-${demoId}`;

      if (kind === "png") {
        const box = stage.querySelector(".graph-canvas-3d") as HTMLElement | null;
        if (!box) {
          setSnapNote("Could not read the 3D view.");
          return;
        }
        // The 3D scene paints its own background and fog, so a snapshot on
        // white means rendering on white: the view is switched for the two
        // frames it takes to redraw, captured, and put back. This also flips
        // the overlaid labels to dark ink on its own, through canvasInk.
        const previous = backgroundColor;
        setBackgroundColor("#ffffff");

        // The view must be put back whatever happens. A hidden or backgrounded
        // tab suspends requestAnimationFrame, so without this the background
        // would stay white and no snapshot would ever arrive.
        let settled = false;
        const finish = (note: string) => {
          if (settled) return;
          settled = true;
          setBackgroundColor(previous);
          setSnapNote(note);
        };

        // Poll rather than count frames, and poll on a timer rather than on
        // animation frames, which a hidden tab suspends outright.
        let waited = 0;
        const capture = () => {
          if (settled) return;
          const pending = box.querySelector("canvas") as HTMLCanvasElement | null;
          if (pending && !cornerIsLight(pending) && waited < 2000) {
            waited += 60;
            window.setTimeout(capture, 60);
            return;
          }
          const canvas = pending;
          const composed = canvas
            ? buildSnapshotCanvas({
                container: box,
                canvas,
                layers: filtered.layers,
                counts: (id) =>
                  filtered.project?.layerCounts?.[id] ??
                  filtered.nodes.filter((n) => n.layer === id).length,
                fromBackground: "#ffffff",
                title: projectName,
                subtitle: `${filtered.stats.nodeCount} entities · ${filtered.stats.edgeCount} DataLinks`,
              })
            : null;
          const ok = composed ? snapshotCanvasPng(composed, `${stamp}-3d.png`) : false;
          finish(ok ? "Saved a PNG of the 3D view, with labels and legend." : "Could not read the 3D view.");
        };

        window.setTimeout(capture, 60);
        window.setTimeout(() => finish("The 3D view has to be on screen to snapshot it."), 2600);
        return;
      }

      const svg = stage.querySelector("svg.graph-canvas") as SVGSVGElement | null;
      if (!svg) {
        setSnapNote("Switch to the 2D map for a vector snapshot.");
        return;
      }
      const markup = buildSnapshotSvg({
        source: svg,
        layers: filtered.layers,
        counts: (id) =>
          filtered.project?.layerCounts?.[id] ??
          filtered.nodes.filter((n) => n.layer === id).length,
        fromBackground: backgroundColor,
        title: projectName,
        subtitle: `${filtered.stats.nodeCount} entities · ${filtered.stats.edgeCount} DataLinks`,
      });

      if (kind === "svg") {
        downloadSvg(markup, `${stamp}.svg`);
        setSnapNote("Saved a vector SVG.");
      } else {
        printSvg(markup, stamp);
        setSnapNote("Opened the print dialog — choose “Save as PDF”.");
      }
    },
    [demoId, filtered, backgroundColor, projectName],
  );

  useEffect(() => {
    if (!snapNote) return;
    const t = setTimeout(() => setSnapNote(null), 4000);
    return () => clearTimeout(t);
  }, [snapNote]);

  useEffect(() => {
    if (!snapOpen) return;
    const onDown = (e: MouseEvent) => {
      if (snapRef.current && !snapRef.current.contains(e.target as Node)) setSnapOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [snapOpen]);


  const hint =
    dimMode === "3d"
      ? autoSwitched
        ? "Labels had shrunk past reading size — switched to the layered view · orbit · scroll to zoom"
        : "Orbit · scroll to zoom · sphere size ∝ complexity"
      : "Drag nodes · pan · scroll to zoom · Untangle removes every overlap";

  return (
    <div className="app">
      {/* ── top bar ─────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <PetrasLogo />
          <div className="brand-text">
            <h1>PETRAS</h1>
            <p className="subtitle">Provenance-enabled digital twin ontology</p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="toggle theme-toggle">
            <button
              type="button"
              className={theme === "dark" ? "on" : ""}
              onClick={() => applyTheme("dark")}
              title="Dark theme"
            >
              Dark
            </button>
            <button
              type="button"
              className={theme === "light" ? "on" : ""}
              onClick={() => applyTheme("light")}
              title="Light theme — sand chrome, white canvas, for figures"
            >
              Light
            </button>
          </div>
          <div className="menu" ref={snapRef}>
            <button
              type="button"
              className={`menu-button ${snapOpen ? "active" : ""}`}
              onClick={() => setSnapOpen((v) => !v)}
              title="Export the graph and its legend on white, for figures"
              aria-haspopup="menu"
              aria-expanded={snapOpen}
            >
              Snapshot
            </button>
            {snapOpen ? (
              <div className="menu-list" role="menu">
                {dimMode === "2d" ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => takeSnapshot("pdf")}>
                      PDF — vector, via print
                    </button>
                    <button type="button" role="menuitem" onClick={() => takeSnapshot("svg")}>
                      SVG — vector file
                    </button>
                  </>
                ) : (
                  <button type="button" role="menuitem" onClick={() => takeSnapshot("png")}>
                    PNG — the 3D view is raster
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <label className="project-picker">
            <span>Project</span>
            <select value={demoId} onChange={(e) => setDemoId(e.target.value)}>
              {DEMOS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <div className="menu" ref={menuRef}>
            <button
              type="button"
              className={`menu-button ${menuOpen ? "active" : ""}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="menu-glyph">☰</span> Menu
            </button>
            {menuOpen ? (
              <div className="menu-list" role="menu">
                {MENU_ITEMS.map((it) => (
                  <button key={it.id} type="button" role="menuitem" onClick={() => openMenuItem(it.id)}>
                    {it.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="main">
        {/* ── the view, with everything else floating over it ────── */}
        <section
          className="stage"
          ref={stageRef}
          style={{ background: backgroundColor }}
        >
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
                fontScale={fontScale}
                avoidOverlap={avoidOverlap}
                backgroundColor={backgroundColor}
                layerOpacity={layerOpacity}
                layerLabelSide={layerLabelSide}
                layerLabelOffset={layerLabelOffset}
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
                onLabelPixels={handleLabelPixels}
                layoutCommand={layoutCommand}
                onLayoutCommandHandled={(id) => {
                  setLayoutCommand((cmd) => (cmd?.id === id ? null : cmd));
                }}
              />
            )
          ) : (
            <div className="empty">{error || (loading ? "Loading project graph…" : "No graph")}</div>
          )}

          {/* top-left: the two view toggles, then the overlay stack */}
          <div className="ov ov-tl">
            <div className="toggle-row">
              <div className="toggle">
                <button
                  type="button"
                  className={dimMode === "2d" ? "on" : ""}
                  onClick={() => {
                    setDimMode("2d");
                    setAutoHeld(true);
                    setAutoSwitched(false);
                  }}
                  title={
                    autoHeld
                      ? "2D map — automatic switch held"
                      : "2D map"
                  }
                >
                  2D
                </button>
                <button
                  type="button"
                  className={dimMode === "3d" ? "on" : ""}
                  onClick={() => {
                    setDimMode("3d");
                    setAutoSwitched(false);
                  }}
                  title="3D layered view"
                >
                  3D
                </button>
              </div>
              <div className="toggle">
                <button
                  type="button"
                  className={mode === "project" ? "on" : ""}
                  onClick={() => setMode("project")}
                  title="The whole project map"
                >
                  Map
                </button>
                <button
                  type="button"
                  className={mode === "provenance" ? "on" : ""}
                  onClick={() => setMode("provenance")}
                  disabled={!selectedId}
                  title={
                    selectedId
                      ? "The provenance branch of the selected entity"
                      : "Select an entity first"
                  }
                >
                  Focus
                </button>
              </div>
              {!showLegend || !showCq ? (
                <div className="toggle ghost">
                  {!showLegend ? (
                    <button type="button" onClick={() => setShowLegend(true)} title="Show the layer legend">
                      Legend
                    </button>
                  ) : null}
                  {!showCq ? (
                    <button type="button" onClick={() => setShowCq(true)} title="Show competency questions">
                      CQ
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="ov-stack">
              {filtered && showLegend ? (
                <LegendOverlay
                  graph={filtered}
                  onClose={() => setShowLegend(false)}
                  activeLayer={activeLayer}
                  onLayerClick={(l) => {
                    setActiveLayer(l);
                    if (l) {
                      setCqSelectedId(null);
                      setCqFocusIds(null);
                    }
                  }}
                />
              ) : null}

              {showCq ? (
                <div className="overlay-card cq-overlay">
                  <button
                    type="button"
                    className="overlay-close floating"
                    onClick={() => setShowCq(false)}
                    title="Hide competency questions"
                  >
                    ✕
                  </button>
                  <CompetencyPanel
                    answers={cqAnswers}
                    loading={cqLoading}
                    error={cqError}
                    selectedId={cqSelectedId}
                    onSelect={(id) => {
                      setCqSelectedId(id);
                      setCqFocusIds(null);
                      if (id) setActiveLayer(null);
                    }}
                    highlightOn={cqHighlight}
                    onHighlightChange={setCqHighlight}
                    graphNodeIds={filtered?.nodes.map((n) => n.id) ?? []}
                    onPickEntities={(ids) => {
                      setCqFocusIds(ids);
                      const first = ids.values().next().value as string | undefined;
                      if (first) {
                        setSelectedId(first);
                        setMode("project");
                      }
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* top-right: which project is on screen */}
          <div className="ov ov-tr">
            <div className="stage-title">
              <strong>{projectName}</strong>
              <span>{activeDemo.description}</span>
            </div>
          </div>

          {/* bottom-left: how to drive the view */}
          <div className="ov ov-bl">
            <p className="stage-hint">{snapNote ?? hint}</p>
          </div>

          {/* bottom-right: framing controls */}
          {dimMode === "2d" ? (
            <div className="ov ov-br">
              <div className="fit-row">
                <button
                  type="button"
                  onClick={() => issueLayoutCommand("untangle")}
                  title="Spread until no sphere and no label overlaps, then frame the result"
                >
                  Untangle
                </button>
                <button type="button" onClick={() => issueLayoutCommand("fill")} title="Reposition nodes to fill the 4:3 view (no zoom)">
                  Fit
                </button>
                <button type="button" onClick={() => issueLayoutCommand("spread-x")} title="Reposition horizontally only (no zoom)">
                  Fit ↔
                </button>
                <button type="button" onClick={() => issueLayoutCommand("spread-y")} title="Reposition vertically only (no zoom)">
                  Fit ↕
                </button>
                <button type="button" onClick={() => issueLayoutCommand("reset")} title="Reset positions, pan and zoom (4:3 frame)">
                  Reset
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── right bar: the clicked object ───────────────────────── */}
        <aside className="rightbar">
          <h2>Entity</h2>
          {selected ? (
            <div className="entity-detail">
              <div className="badge" style={{ background: selected.color }}>
                {selected.layer}
              </div>
              <h3>{selected.label}</h3>
              <p className="entity-role">{LayerDocsShort[selected.layer] || ""}</p>
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
              <div className="entity-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setDocsLayer(selected.layer);
                    setDocsPage("details");
                  }}
                  title="What this layer is, in the ontology"
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === "provenance" ? "project" : "provenance")}
                >
                  {mode === "provenance" ? "Show whole map" : "Focus provenance"}
                </button>
              </div>
              <details className="entity-raw">
                <summary>Raw descriptor</summary>
                <pre>{JSON.stringify(selected.data || {}, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <>
              <p className="hint">
                Click an entity to see what it is, where it sits in the ontology, and the operators that
                produced it. Drag to move it.
              </p>
              <div className="entity-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setDocsLayer(null);
                    setDocsPage("details");
                  }}
                >
                  Details
                </button>
              </div>
              <p className="hint dim">
                Details opens the technical construct: the seven layers, why their boundaries are disjoint,
                and the three roles a DataLink carries.
              </p>
            </>
          )}
        </aside>
      </div>

      <DocsDialog
        pageId={docsPage}
        onPageChange={(id) => setDocsPage(id)}
        onClose={() => setDocsPage(null)}
        focusLayer={docsLayer}
      />

      <GraphicsDrawer
        open={graphicsOpen}
        onClose={() => setGraphicsOpen(false)}
        layoutMode={layoutMode}
        onLayoutMode={setLayoutMode}
        sphereScale={sphereScale}
        onSphereScale={setSphereScale}
        fontScale={fontScale}
        onFontScale={setFontScale}
        autoDimension={autoDimension}
        onAutoDimension={(v) => {
          setAutoDimension(v);
          if (v) setAutoHeld(false);
        }}
        showLayerOpacity={dimMode === "3d"}
        layerLabelSide={layerLabelSide}
        onLayerLabelSide={(v) => {
          // Each side has its own workable starting point; switching sides
          // restarts from it rather than carrying over offsets tuned for the
          // opposite corner.
          setLayerLabelSide(v);
          setLayerLabelOffset(LAYER_LABEL_DEFAULTS[v]);
        }}
        layerLabelOffset={layerLabelOffset}
        onLayerLabelOffset={setLayerLabelOffset}
        layerOpacity={layerOpacity}
        onLayerOpacity={setLayerOpacity}
        avoidOverlap={avoidOverlap}
        onAvoidOverlap={setAvoidOverlap}
        hideMissing={hideMissing}
        onHideMissing={setHideMissing}
        hideIsolated={hideIsolated}
        onHideIsolated={setHideIsolated}
        hideUnknown={hideUnknown}
        onHideUnknown={setHideUnknown}
        backgroundColor={backgroundColor}
        onBackgroundColor={setBackgroundColor}
        showLegend={showLegend}
        onShowLegend={setShowLegend}
        showCq={showCq}
        onShowCq={setShowCq}
      />
    </div>
  );
}
