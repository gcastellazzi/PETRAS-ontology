/** Relative luminance 0..1 (sRGB). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.1;
  const n = parseInt(m[1], 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function isLightBg(hex: string): boolean {
  return luminance(hex) > 0.55;
}

export type CanvasInk = {
  label: string;
  labelSelected: string;
  edge: string;
  edgeInferred: string;
  edgeLabel: string;
  nodeStroke: string;
  selectedStroke: string;
  glow: string;
  hint: string;
  fogNear: number;
  fogFar: number;
};

export function canvasInk(bg: string): CanvasInk {
  if (isLightBg(bg)) {
    return {
      label: "#2a2f3a",
      labelSelected: "#111318",
      edge: "#6b7280",
      edgeInferred: "#9ca3af",
      edgeLabel: "#4b5563",
      nodeStroke: "#ffffff",
      selectedStroke: "#111318",
      glow: "#111318",
      hint: "#5c6370",
      fogNear: 22,
      fogFar: 55,
    };
  }
  return {
    label: "#d4d7de",
    labelSelected: "#ffffff",
    edge: "#9aa0a6",
    edgeInferred: "#7f848e",
    edgeLabel: "#abb2bf",
    nodeStroke: "#1e2127",
    selectedStroke: "#ffffff",
    glow: "#ffffff",
    hint: "#7f848e",
    fogNear: 18,
    fogFar: 42,
  };
}

export const BG_PRESETS: { id: string; label: string; color: string }[] = [
  { id: "dark", label: "Dark", color: "#0f1115" },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "paper", label: "Paper", color: "#f4f1ea" },
  { id: "slate", label: "Slate", color: "#e8ecf1" },
];
