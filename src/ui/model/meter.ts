import { plaintextCapacity } from "../../protocol/index";

export const METER_SEGMENTS = 24;
/** Lit segments 1..METER_OK_SEGMENTS use --meter-ok, the rest --meter-warn. */
export const METER_OK_SEGMENTS = 19;

export type MeterColor = "off" | "ok" | "warn" | "over";

export interface MeterView {
  readonly bytes: number;
  readonly limit: number;
  /** 0..24 */
  readonly lit: number;
  /** bytes > limit */
  readonly over: boolean;
  /** Length 24, index 0 is segment 1. */
  readonly segments: readonly MeterColor[];
}

/** limit is plaintextCapacity for the current mode. Never a literal. */
export function meterView(bytes: number, limit: number): MeterView {
  const over = bytes > limit;
  // Integer ceil(bytes * 24 / limit), exact for integer inputs.
  const raw =
    bytes <= 0 || limit <= 0
      ? 0
      : Math.floor((bytes * METER_SEGMENTS + limit - 1) / limit);
  const lit = Math.min(METER_SEGMENTS, raw);
  const segments: MeterColor[] = [];
  for (let i = 1; i <= METER_SEGMENTS; i++) {
    if (over) segments.push("over");
    else if (i > lit) segments.push("off");
    else segments.push(i <= METER_OK_SEGMENTS ? "ok" : "warn");
  }
  return { bytes, limit, lit, over, segments };
}

/** The open-channel single-frame limit the well uses. */
export function wellLimit(): number {
  return plaintextCapacity({ encrypted: false, multi: false });
}
