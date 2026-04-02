import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_BRAND = "#7c5cff";

// ── Colour math helpers (no external deps) ───────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(h, s, Math.max(0, l - amount * 100));
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Apply all CSS custom properties to :root ─────────────────────

export function applyTheme(hex: string): void {
  const root = document.documentElement;
  root.style.setProperty("--brand",          hex);
  root.style.setProperty("--brand-dark",     darken(hex, 0.15));
  root.style.setProperty("--brand-surface",  alpha(hex, 0.06));
  root.style.setProperty("--brand-border",   alpha(hex, 0.20));
  root.style.setProperty("--brand-chip",     alpha(hex, 0.10));
  const { r, g, b } = hexToRgb(hex);
  root.style.setProperty("--shadow-brand",    `0 4px 20px rgba(${r},${g},${b},0.22)`);
  root.style.setProperty("--shadow-brand-lg", `0 8px 40px rgba(${r},${g},${b},0.28)`);
}

// ── Store ─────────────────────────────────────────────────────────

interface ThemeState {
  brandHex: string;
  setBrand: (hex: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      brandHex: DEFAULT_BRAND,
      setBrand: (hex: string) => {
        applyTheme(hex);
        set({ brandHex: hex });
      },
    }),
    { name: "sweaas-theme" },
  ),
);
