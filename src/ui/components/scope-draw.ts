// Pure mapping helpers for the Scope canvas. No DOM, no colour literals.
// The component reads two colours from Tokens at mount and builds the palette here.

export type Rgb = readonly [number, number, number];

export const SCOPE_WIDTH = 290;
export const SCOPE_HEIGHT = 184;
/** Self-test warm-up length (Figma State 02, about 0.6 s). */
export const WARMUP_MS = 600;
/** Static is drawn from the dimmest palette entries only. */
export const STATIC_MAX_INDEX = 36;

/** Parses "#rrggbb" or "#rgb" as read from a computed custom property. Null when it is neither. */
export function parseHex(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  const hex = m?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 256 RGBA entries (1024 bytes) running from `dark` at 0 to `bright` at 255. */
export function buildPalette(dark: Rgb, bright: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    for (let c = 0; c < 3; c++) {
      const a = dark[c] ?? 0;
      const b = bright[c] ?? 0;
      out[i * 4 + c] = Math.round(a + (b - a) * t);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** FFT bin shown on a canvas row. Row 0 is the top, so it shows the highest bin. */
export function binForRow(
  row: number,
  height: number,
  range: { lo: number; hi: number },
): number {
  if (height <= 1) return range.lo;
  const r = Math.min(height - 1, Math.max(0, row));
  return (
    range.lo +
    Math.floor(((height - 1 - r) * (range.hi - range.lo)) / (height - 1))
  );
}

/** Position of a frequency in the window as a fraction from the bottom (0) to the top (1). */
export function freqFraction(hz: number, loHz: number, hiHz: number): number {
  if (!(hiHz > loHz)) return 0;
  return Math.min(1, Math.max(0, (hz - loHz) / (hiHz - loHz)));
}

/** Five evenly spaced axis ticks, lowest first. */
export function axisTicks(loHz: number, hiHz: number): number[] {
  const step = (hiHz - loHz) / 4;
  return [0, 1, 2, 3, 4].map((i) => loHz + step * i);
}

/** Warm-up progress 0..1 from elapsed milliseconds. */
export function warmUpProgress(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / WARMUP_MS));
}

/**
 * Half height, in rows, of the lit area during warm-up: a single bright line at 0 that opens
 * out to the full screen at 1.
 */
export function warmUpHalfHeight(progress: number, height: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - p) * (1 - p);
  return Math.round((eased * height) / 2);
}

export type ScopeMode = "static" | "warmup" | "live";

/**
 * Which picture to draw. Power off wins over everything, so the warm-up never runs while
 * the power is off. A missing analyser shows static. Under reduced motion the warm-up is skipped.
 */
export function scopeMode(input: {
  power: "off" | "selftest" | "on";
  hasSource: boolean;
  reducedMotion: boolean;
}): ScopeMode {
  if (input.power === "off") return "static";
  if (input.power === "selftest" && !input.reducedMotion) return "warmup";
  return input.hasSource ? "live" : "static";
}
