import { PROFILES, type ProfileId } from "../../audio/index";

export interface ScopeWindow {
  readonly loHz: number;
  readonly hiHz: number;
  readonly bandHz: readonly [number, number] | null;
}

/**
 * Frequency windows per channel. Room 0 to 8 kHz (Figma State 03), Quiet 12 to 20 kHz (State 10).
 * Call: 0 to 8 kHz (State 09 axis reads 8k, 4k, Hz; confirmed in design QA 7.1).
 */
const WINDOWS: Readonly<Record<ProfileId, readonly [number, number]>> = {
  room: [0, 8000],
  call: [0, 8000],
  quiet: [12000, 20000],
};

export function scopeWindow(channel: ProfileId): ScopeWindow {
  const [loHz, hiHz] = WINDOWS[channel];
  return { loHz, hiHz, bandHz: PROFILES[channel].carrierBandHz };
}

/** FFT bin range for a window. Always inside 0..fftSize/2-1 and lo <= hi. */
export function binRange(
  sampleRate: number,
  fftSize: number,
  loHz: number,
  hiHz: number,
): { lo: number; hi: number } {
  const last = Math.max(0, fftSize / 2 - 1);
  const binHz = sampleRate / fftSize;
  const clamp = (n: number): number =>
    Number.isFinite(n) ? Math.min(last, Math.max(0, n)) : 0;
  const lo = clamp(Math.floor(loHz / binHz));
  const hi = Math.max(lo, clamp(Math.ceil(hiHz / binHz)));
  return { lo, hi };
}

/** The one lit region of the self-test warm-up. Rows are canvas rows, `top` and `bottom` inclusive. */
export interface WarmUpFrame {
  readonly centerRow: number;
  /** Half of the region's height in rows: 0.5 for a single line, `height / 2` when full. */
  readonly halfHeight: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Self-test warm-up geometry (Figma State 02: "warms up from one bright line"). One region,
 * centred, that is one row high at progress 0 and the full `height` at progress 1. Its height never
 * decreases as progress grows. It never describes more than one region, so it cannot draw stripes.
 */
export function warmUpFrame(progress: number, height: number): WarmUpFrame {
  const h = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const eased = 1 - (1 - p) * (1 - p);
  const rows = Math.min(h, Math.max(1, Math.round(eased * h)));
  const top = Math.floor((h - rows) / 2);
  const bottom = top + rows - 1;
  return {
    centerRow: Math.floor((top + bottom) / 2),
    halfHeight: rows / 2,
    top,
    bottom,
  };
}

/** Hz as kHz with at most one decimal and no trailing ".0": 1120 -> "1.1", 8000 -> "8". */
export function formatKHz(hz: number): string {
  return (hz / 1000).toFixed(1).replace(/\.0$/, "");
}

/**
 * Canvas drawing-buffer size for a rendered CSS size and device pixel ratio (requirement 22.8).
 * Whole pixels, the rounded products, never less than 1 x 1. Non-finite or negative input gives 1.
 */
export function canvasBuffer(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number } {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const px = (css: number): number => {
    const n = Math.round((Number.isFinite(css) ? css : 0) * ratio);
    return Math.max(1, n);
  };
  return { width: px(cssWidth), height: px(cssHeight) };
}
