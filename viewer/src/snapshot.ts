import { canvasInk } from "./theme";
import type { GraphLayer } from "./types";

/*
 * Figure export.
 *
 * The 2D map is already SVG, so a snapshot of it is genuinely vector: the file
 * is the drawing, not a picture of it. Two things are changed on the way out —
 * the background becomes white and the ink is re-derived for a white
 * background — and one thing is added, the layer legend, drawn beside the graph
 * rather than over it so nothing in the figure is covered.
 *
 * Layer colours are never touched: they are ontology semantics and have to
 * match the other figures in the paper.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export type SnapshotOptions = {
  source: SVGSVGElement;
  layers: GraphLayer[];
  counts: (layerId: string) => number;
  /** Background the graph is currently drawn on, to know which ink to replace. */
  fromBackground: string;
  title?: string;
  subtitle?: string;
};

/** Colour swap table: every ink of the current background → its white-background twin. */
function inkRemap(fromBackground: string): Map<string, string> {
  const from = canvasInk(fromBackground);
  const to = canvasInk("#ffffff");
  const map = new Map<string, string>();
  for (const key of Object.keys(from) as (keyof typeof from)[]) {
    const a = from[key];
    const b = to[key];
    if (typeof a === "string" && typeof b === "string" && a.toLowerCase() !== b.toLowerCase()) {
      map.set(a.toLowerCase(), b);
    }
  }
  return map;
}

function remapColours(root: Element, map: Map<string, string>) {
  const swap = (value: string | null): string | null => {
    if (!value) return null;
    const hit = map.get(value.trim().toLowerCase());
    return hit ?? null;
  };
  const walk = (el: Element) => {
    for (const attr of ["fill", "stroke", "color", "stop-color", "flood-color"]) {
      const next = swap(el.getAttribute(attr));
      if (next) el.setAttribute(attr, next);
    }
    const style = (el as SVGElement).style;
    if (style) {
      for (const prop of ["fill", "stroke", "color"] as const) {
        const next = swap(style.getPropertyValue(prop));
        if (next) style.setProperty(prop, next);
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

function el(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The legend, drawn in the same user units as the graph. */
function buildLegend(
  layers: GraphLayer[],
  counts: (id: string) => number,
  width: number,
  fontSize: number,
): { node: SVGElement; height: number } {
  const g = document.createElementNS(SVG_NS, "g");
  const pad = fontSize * 0.9;
  const rowH = fontSize * 1.7;
  const swatch = fontSize * 0.8;

  const groups: { title: string; rows: GraphLayer[] }[] = [
    { title: "CORE", rows: layers.filter((l) => l.group === "core") },
    { title: "SERVICE", rows: layers.filter((l) => l.group === "service") },
  ].filter((s) => s.rows.length > 0);

  let y = pad + fontSize;
  g.appendChild(
    el(
      "text",
      {
        x: pad,
        y,
        "font-size": fontSize * 0.95,
        "font-weight": 700,
        "letter-spacing": fontSize * 0.08,
        fill: "#2a2f3a",
      },
      "ONTOLOGY LAYERS",
    ),
  );
  y += fontSize * 1.4;

  groups.forEach((section, index) => {
    // A section heading needs a full line of its own: advancing by less put
    // "SERVICE" on top of the last row of "CORE".
    y += fontSize * (index === 0 ? 0.35 : 1.5);
    g.appendChild(
      el(
        "text",
        { x: pad, y, "font-size": fontSize * 0.8, "font-weight": 600, fill: "#6b7280" },
        section.title,
      ),
    );
    y += fontSize * 0.35;

    for (const layer of section.rows) {
      y += rowH;
      g.appendChild(
        el("rect", {
          x: pad,
          y: y - swatch * 0.85,
          width: swatch,
          height: swatch,
          rx: swatch * 0.25,
          fill: layer.color,
        }),
      );
      g.appendChild(
        el(
          "text",
          { x: pad + swatch * 1.7, y, "font-size": fontSize, fill: "#2a2f3a" },
          layer.label,
        ),
      );
      g.appendChild(
        el(
          "text",
          {
            x: width - pad,
            y,
            "font-size": fontSize * 0.92,
            "text-anchor": "end",
            fill: "#6b7280",
          },
          String(counts(layer.id)),
        ),
      );
    }
  });

  const height = y + pad;
  const frame = el("rect", {
    x: 0,
    y: 0,
    width,
    height,
    rx: fontSize * 0.5,
    fill: "#ffffff",
    stroke: "#d3d6dd",
    "stroke-width": Math.max(0.001, fontSize * 0.045),
  });
  g.insertBefore(frame, g.firstChild);
  return { node: g, height };
}

/** Standalone SVG document: white ground, the graph, the legend beside it. */
export function buildSnapshotSvg(opts: SnapshotOptions): string {
  const { source, layers, counts, fromBackground, title, subtitle } = opts;

  // Tight bounds of what is actually drawn, so the figure carries no dead margin.
  let box: { x: number; y: number; width: number; height: number };
  try {
    const bbox = source.getBBox();
    box = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    const vb = (source.getAttribute("viewBox") || "0 0 4 3").split(/\s+/).map(Number);
    box = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
  }
  if (!(box.width > 0) || !(box.height > 0)) box = { x: 0, y: 0, width: 4, height: 3 };

  const margin = box.width * 0.035;
  const fontSize = box.width * 0.017;
  const legendW = box.width * 0.26;
  const gap = box.width * 0.03;

  const graphX = box.x - margin;
  const graphY = box.y - margin;
  const graphH = box.height + margin * 2;
  const totalW = box.width + margin * 2 + gap + legendW;
  const titleH = title ? fontSize * 2.6 : 0;

  const out = document.createElementNS(SVG_NS, "svg");
  out.setAttribute("xmlns", SVG_NS);
  out.setAttribute("viewBox", `${graphX} ${graphY - titleH} ${totalW} ${graphH + titleH}`);
  out.setAttribute("width", "1600");
  out.setAttribute(
    "height",
    String(Math.round((1600 * (graphH + titleH)) / totalW)),
  );

  out.appendChild(
    el("rect", {
      x: graphX,
      y: graphY - titleH,
      width: totalW,
      height: graphH + titleH,
      fill: "#ffffff",
    }),
  );

  if (title) {
    out.appendChild(
      el(
        "text",
        {
          x: graphX + margin,
          y: graphY - titleH + fontSize * 1.3,
          "font-size": fontSize * 1.25,
          "font-weight": 700,
          fill: "#111318",
        },
        title,
      ),
    );
    if (subtitle) {
      out.appendChild(
        el(
          "text",
          {
            x: graphX + margin,
            y: graphY - titleH + fontSize * 2.5,
            "font-size": fontSize * 0.92,
            fill: "#6b7280",
          },
          subtitle,
        ),
      );
    }
  }

  // The drawing itself, with its ink re-derived for white.
  const clone = source.cloneNode(true) as SVGSVGElement;
  remapColours(clone, inkRemap(fromBackground));
  const content = document.createElementNS(SVG_NS, "g");
  for (const child of Array.from(clone.childNodes)) content.appendChild(child);
  out.appendChild(content);

  const legend = buildLegend(layers, counts, legendW, fontSize);
  legend.node.setAttribute(
    "transform",
    `translate(${box.x + box.width + gap} ${box.y})`,
  );
  out.appendChild(legend.node);

  const markup = new XMLSerializer().serializeToString(out);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

/** Hand the file to the browser. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(markup: string, filename: string) {
  downloadBlob(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/**
 * PDF by way of the browser's own print pipeline: it writes vector PDF from
 * vector SVG, which no bundled JavaScript library does as faithfully, and it
 * costs the project no dependency.
 */
export function printSvg(markup: string, title: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Off-screen but with a real viewport: a 0×0 frame can resolve the SVG's
  // width:100% to zero and print a blank page.
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${title}</title><style>` +
      "@page{margin:12mm;size:auto}" +
      "html,body{margin:0;padding:0;background:#fff}" +
      "svg{width:100%;height:auto;display:block}" +
      `</style></head><body>${markup.replace(/^<\?xml[^>]*\?>\s*/, "")}</body></html>`,
  );
  doc.close();

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (frame.contentWindow?.document.readyState === "complete") run();
  else frame.onload = run;
}

/** WebGL has no vector form, so the 3D view snapshots as a raster image. */
export function snapshotCanvasPng(canvas: HTMLCanvasElement, filename: string): boolean {
  try {
    const url = canvas.toDataURL("image/png");
    if (!url || url.length < 16) return false;
    const bin = atob(url.split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    downloadBlob(new Blob([bytes], { type: "image/png" }), filename);
    return true;
  } catch {
    return false;
  }
}

/* ── 3D ───────────────────────────────────────────────────────────────────
 *
 * The 3D view keeps its text outside the WebGL canvas: node labels and layer
 * names are DOM overlays drawn on top of it. Reading the canvas alone
 * therefore returns spheres and edges with every word missing, which is what
 * made the first 3D snapshots look empty in selection mode. The figure has to
 * be composed: the rendered scene, then the labels the reader can actually
 * see, then the legend beside them.
 */

type OverlayLabel = {
  text: string;
  /** Centre of the label, in CSS pixels relative to the WebGL canvas. */
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontWeight: string;
  /** Layer names carry a coloured rule on their left edge. */
  accent: string | null;
};

/**
 * Every piece of text currently overlaying the 3D view, wherever drei chose to
 * put it in the DOM: leaves that carry text, located by their own rectangles
 * rather than by any assumption about the wrapper structure.
 */
function collectOverlayLabels(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  remap: Map<string, string>,
): OverlayLabel[] {
  const base = canvas.getBoundingClientRect();
  const out: OverlayLabel[] = [];

  for (const node of Array.from(container.querySelectorAll<HTMLElement>("div, span"))) {
    const text = (node.textContent || "").trim();
    if (!text) continue;
    // Only leaves: a wrapper repeats the text of everything inside it.
    if (Array.from(node.children).some((c) => (c.textContent || "").trim())) continue;

    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;

    const style = window.getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const opacity = Number(style.opacity || "1");
    if (opacity < 0.05) continue;

    const raw = style.color;
    const accentRaw = style.borderLeftWidth !== "0px" ? style.borderLeftColor : null;

    out.push({
      text,
      x: rect.left - base.left + rect.width / 2,
      y: rect.top - base.top + rect.height / 2,
      color: remapColour(raw, remap),
      fontSize: parseFloat(style.fontSize) || 11,
      fontWeight: style.fontWeight || "400",
      accent: accentRaw,
    });
  }
  return out;
}

/** rgb()/rgba() from getComputedStyle, matched against the hex ink table. */
function remapColour(value: string, remap: Map<string, string>): string {
  const m = /^rgba?\(([^)]+)\)/.exec(value.trim());
  if (!m) return remap.get(value.trim().toLowerCase()) ?? value;
  const [r, g, b] = m[1].split(",").map((n) => parseInt(n, 10));
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return remap.get(hex.toLowerCase()) ?? value;
}

function legendOnCanvas(
  ctx: CanvasRenderingContext2D,
  layers: GraphLayer[],
  counts: (id: string) => number,
  originX: number,
  originY: number,
  width: number,
  fontSize: number,
) {
  const pad = fontSize * 0.9;
  const rowH = fontSize * 1.7;
  const swatch = fontSize * 0.8;
  const sections = [
    { title: "CORE", rows: layers.filter((l) => l.group === "core") },
    { title: "SERVICE", rows: layers.filter((l) => l.group === "service") },
  ].filter((s) => s.rows.length > 0);

  // Measure first: the frame has to be drawn under the text.
  let height = pad + fontSize + fontSize * 1.4;
  sections.forEach((s, i) => {
    height += fontSize * (i === 0 ? 0.35 : 1.5) + fontSize * 0.35 + s.rows.length * rowH;
  });
  height += pad;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d3d6dd";
  ctx.lineWidth = Math.max(1, fontSize * 0.06);
  ctx.beginPath();
  ctx.rect(originX, originY, width, height);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  let y = originY + pad + fontSize;
  ctx.fillStyle = "#2a2f3a";
  ctx.font = `700 ${fontSize * 0.95}px ${LABEL_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText("ONTOLOGY LAYERS", originX + pad, y);
  y += fontSize * 1.4;

  sections.forEach((section, index) => {
    y += fontSize * (index === 0 ? 0.35 : 1.5);
    ctx.fillStyle = "#6b7280";
    ctx.font = `600 ${fontSize * 0.8}px ${LABEL_FONT_STACK}`;
    ctx.fillText(section.title, originX + pad, y);
    y += fontSize * 0.35;

    for (const layer of section.rows) {
      y += rowH;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.rect(originX + pad, y - swatch * 0.85, swatch, swatch);
      ctx.fill();

      ctx.fillStyle = "#2a2f3a";
      ctx.font = `400 ${fontSize}px ${LABEL_FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.fillText(layer.label, originX + pad + swatch * 1.7, y);

      ctx.fillStyle = "#6b7280";
      ctx.font = `400 ${fontSize * 0.92}px ${LABEL_FONT_STACK}`;
      ctx.textAlign = "right";
      ctx.fillText(String(counts(layer.id)), originX + width - pad, y);
      ctx.textAlign = "left";
    }
  });
}

const LABEL_FONT_STACK = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

/** Scene + its overlaid text + legend, composed on white. */
export function buildSnapshotCanvas(opts: {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  layers: GraphLayer[];
  counts: (layerId: string) => number;
  fromBackground: string;
  title?: string;
  subtitle?: string;
  scale?: number;
}): HTMLCanvasElement | null {
  const { container, canvas, layers, counts, fromBackground, title, subtitle } = opts;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const scale = opts.scale ?? 2;
  const fontSize = Math.max(11, rect.width * 0.014);
  const legendW = rect.width * 0.26;
  const gap = rect.width * 0.03;
  const titleH = title ? fontSize * 3 : 0;

  const out = document.createElement("canvas");
  out.width = Math.round((rect.width + gap + legendW) * scale);
  out.height = Math.round((rect.height + titleH) * scale);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width + gap + legendW, rect.height + titleH);

  if (title) {
    ctx.fillStyle = "#111318";
    ctx.font = `700 ${fontSize * 1.25}px ${LABEL_FONT_STACK}`;
    ctx.fillText(title, 0, fontSize * 1.4);
    if (subtitle) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 ${fontSize * 0.92}px ${LABEL_FONT_STACK}`;
      ctx.fillText(subtitle, 0, fontSize * 2.6);
    }
  }

  // The rendered scene. The WebGL canvas is transparent, so it lands on white.
  ctx.drawImage(canvas, 0, titleH, rect.width, rect.height);

  const remap = inkRemap(fromBackground);
  for (const label of collectOverlayLabels(container, canvas, remap)) {
    ctx.font = `${label.fontWeight} ${label.fontSize}px ${LABEL_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (label.accent) {
      const w = ctx.measureText(label.text).width;
      ctx.fillStyle = label.accent;
      ctx.fillRect(label.x - w / 2 - label.fontSize * 0.5, label.y + titleH - label.fontSize * 0.6, Math.max(2, label.fontSize * 0.2), label.fontSize * 1.2);
    }
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, label.x, label.y + titleH);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  legendOnCanvas(ctx, layers, counts, rect.width + gap, titleH, legendW, fontSize);
  return out;
}

/**
 * Whether the WebGL canvas has actually redrawn on a light background.
 *
 * The 3D snapshot switches the scene to white and has to wait for the redraw.
 * Counting animation frames guesses at it; sampling a corner pixel observes
 * it, which holds however many frames the renderer happens to need.
 */
export function cornerIsLight(canvas: HTMLCanvasElement): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(canvas, 2, 2, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return (r + g + b) / 3 > 200;
  } catch {
    return false;
  }
}
