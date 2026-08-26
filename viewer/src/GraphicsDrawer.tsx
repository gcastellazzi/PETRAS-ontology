import { useEffect } from "react";
import {
  LAYER_LABEL_DEFAULTS,
  type LayerLabelOffset,
  type LayerLabelSide,
} from "./GraphCanvas3D";
import type { LayoutMode } from "./layout";
import { BG_PRESETS } from "./theme";

/*
 * Live rendering settings. A drawer rather than a dialog page: every control
 * here changes what the canvas looks like, so the canvas has to stay visible
 * while they are used.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  layoutMode: LayoutMode;
  onLayoutMode: (m: LayoutMode) => void;
  sphereScale: number;
  onSphereScale: (v: number) => void;
  fontScale: number;
  onFontScale: (v: number) => void;
  autoDimension: boolean;
  onAutoDimension: (v: boolean) => void;
  showLayerOpacity: boolean;
  layerLabelSide: LayerLabelSide;
  onLayerLabelSide: (v: LayerLabelSide) => void;
  layerLabelOffset: LayerLabelOffset;
  onLayerLabelOffset: (v: LayerLabelOffset) => void;
  layerOpacity: number;
  onLayerOpacity: (v: number) => void;
  avoidOverlap: boolean;
  onAvoidOverlap: (v: boolean) => void;
  hideMissing: boolean;
  onHideMissing: (v: boolean) => void;
  hideIsolated: boolean;
  onHideIsolated: (v: boolean) => void;
  hideUnknown: boolean;
  onHideUnknown: (v: boolean) => void;
  hideCitations: boolean;
  onHideCitations: (v: boolean) => void;
  backgroundColor: string;
  onBackgroundColor: (v: string) => void;
  showLegend: boolean;
  onShowLegend: (v: boolean) => void;
  showCq: boolean;
  onShowCq: (v: boolean) => void;
};

export function GraphicsDrawer(p: Props) {
  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  if (!p.open) return null;

  return (
    <>
      <button type="button" className="drawer-scrim" onClick={p.onClose} aria-label="Close settings" />
      <aside className="drawer" aria-label="Graphics settings">
        <header className="drawer-head">
          <h2>Graphics</h2>
          <button type="button" className="docs-close" onClick={p.onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <section className="drawer-section">
          <h3>Overlays</h3>
          <label className="check">
            <input type="checkbox" checked={p.showLegend} onChange={(e) => p.onShowLegend(e.target.checked)} />
            Layer legend
          </label>
          <label className="check">
            <input type="checkbox" checked={p.showCq} onChange={(e) => p.onShowCq(e.target.checked)} />
            Competency questions
          </label>
        </section>

        <section className="drawer-section">
          <h3>Layout</h3>
          <select value={p.layoutMode} onChange={(e) => p.onLayoutMode(e.target.value as LayoutMode)}>
            <option value="flow">Flow (provenance depth)</option>
            <option value="columns">Columns (one per layer)</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={p.avoidOverlap} onChange={(e) => p.onAvoidOverlap(e.target.checked)} />
            Avoid overlap
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.autoDimension}
              onChange={(e) => p.onAutoDimension(e.target.checked)}
            />
            Switch to 3D when labels shrink
          </label>
          <p className="drawer-note">
            Below about 6.5 px a label stops being readable; the layered view spreads the same graph
            over seven planes. Choosing 2D by hand holds the switch until the next project.
          </p>
          {p.showLayerOpacity ? (
            <>
              <h3>Layer names</h3>
              <select
                value={p.layerLabelSide}
                onChange={(e) => p.onLayerLabelSide(e.target.value as LayerLabelSide)}
              >
                <option value="back">At the back of the view</option>
                <option value="front">At the front of the view</option>
              </select>
              <p className="drawer-note">
                Anchored to the left corner of that edge. Front is clear of the graph and reads best
                in an exported figure.
              </p>
              {(
                [
                  ["x", "Along the edge", 0, 9],
                  ["y", "Into the plane", 0, 6],
                  ["z", "Above the plane", 0, 1.5],
                ] as const
              ).map(([axis, label, min, max]) => (
                <label className="slider" key={axis}>
                  <span>
                    {label} ({axis.toUpperCase()})
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={0.05}
                    value={p.layerLabelOffset[axis]}
                    onChange={(e) =>
                      p.onLayerLabelOffset({
                        ...p.layerLabelOffset,
                        [axis]: Number(e.target.value),
                      })
                    }
                  />
                  <span className="slider-val">{p.layerLabelOffset[axis].toFixed(2)}</span>
                </label>
              ))}
              <button
                type="button"
                className="cq-mini"
                onClick={() => p.onLayerLabelOffset(LAYER_LABEL_DEFAULTS[p.layerLabelSide])}
              >
                Reset placement
              </button>
            </>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Size</h3>
          <label className="slider">
            <span>Spheres</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={p.sphereScale}
              onChange={(e) => p.onSphereScale(Number(e.target.value))}
            />
            <span className="slider-val">{p.sphereScale.toFixed(2)}×</span>
          </label>
          <label className="slider">
            <span>Label size</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={p.fontScale}
              onChange={(e) => p.onFontScale(Number(e.target.value))}
            />
            <span className="slider-val">{p.fontScale.toFixed(2)}×</span>
          </label>
          {p.showLayerOpacity ? (
            <label className="slider">
              <span>Layer planes</span>
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.005}
                value={p.layerOpacity}
                onChange={(e) => p.onLayerOpacity(Number(e.target.value))}
              />
              <span className="slider-val">{(p.layerOpacity * 100).toFixed(1)}%</span>
            </label>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Filter</h3>
          <label className="check">
            <input type="checkbox" checked={p.hideMissing} onChange={(e) => p.onHideMissing(e.target.checked)} />
            Hide missing entities
          </label>
          <label className="check">
            <input type="checkbox" checked={p.hideIsolated} onChange={(e) => p.onHideIsolated(e.target.checked)} />
            Hide unconnected entities
          </label>
          <label className="check">
            <input type="checkbox" checked={p.hideUnknown} onChange={(e) => p.onHideUnknown(e.target.checked)} />
            Hide unknown objects
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.hideCitations}
              onChange={(e) => p.onHideCitations(e.target.checked)}
            />
            Hide report citations
          </label>
          <p className="drawer-note">
            A report cites every entity it summarises, so its citations outnumber the DataLinks
            several times over. Hiding them leaves the transformation chain on its own, which is what
            an exported figure usually wants.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Background</h3>
          <div className="bg-control">
            <select
              value={BG_PRESETS.some((b) => b.color === p.backgroundColor) ? p.backgroundColor : "custom"}
              onChange={(e) => {
                if (e.target.value !== "custom") p.onBackgroundColor(e.target.value);
              }}
            >
              {BG_PRESETS.map((b) => (
                <option key={b.id} value={b.color}>
                  {b.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <input
              type="color"
              className="bg-swatch"
              value={p.backgroundColor}
              onChange={(e) => p.onBackgroundColor(e.target.value)}
              title="Pick background colour"
            />
          </div>
          <p className="drawer-note">
            Layer colours are ontology semantics, shared with the figures in the paper, and never follow the
            background.
          </p>
        </section>
      </aside>
    </>
  );
}
