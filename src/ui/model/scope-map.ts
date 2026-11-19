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

/** Hz as kHz with at most one decimal and no trailing ".0": 1120 -> "1.1", 8000 -> "8". */
export function formatKHz(hz: number): string {
  return (hz / 1000).toFixed(1).replace(/\.0$/, "");
}
