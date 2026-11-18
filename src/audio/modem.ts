/**
 * The only view of ggwave that the rest of src/audio has.
 * No ggwave type and no import from vendor/ appears here.
 */

import type { ProtocolId } from "./profiles";

export type ModemErrorCode = "BAD_LENGTH" | "MODULATE_FAILED" | "NO_INSTANCE";

/** Thrown by `modulate` on a defect (not on data). */
export class ModemError extends Error {
  readonly code: ModemErrorCode;

  constructor(code: ModemErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ModemError";
    this.code = code;
  }
}

export interface ModemDecoder {
  /** Feed one block of exactly CHUNK_SAMPLES samples. Returns a copy of the decoded payload, or null. Never an empty array. */
  feed(block: Float32Array): Uint8Array | null;
  /** Drop partial reception state. The decoder's own protocol set stays in force. */
  reset(): void;
  /** The protocols this decoder was created with. Fixed for its life. */
  readonly protocols: readonly ProtocolId[];
  dispose(): void;
}

export interface Modem {
  /** The AudioContext's rate. Used for modulate and for airtime. */
  readonly txSampleRate: number;
  /** Always RX_SAMPLE_RATE (48,000). Used by the pipeline, the carrier bank and own-echo. */
  readonly rxSampleRate: number;
  /** Returns a copy of the waveform. Never a view into WASM memory. Does not mutate `payload`. */
  modulate(
    payload: Uint8Array,
    protocol: ProtocolId,
    volume: number,
  ): Float32Array;
  /**
   * Create `count` decoders that all listen for exactly `protocols`. The enabled set is fixed for
   * the life of each decoder. To change it, dispose the decoders and call this again.
   */
  createDecoders(
    protocols: readonly ProtocolId[],
    count: number,
  ): Promise<ModemDecoder[]>;
  dispose(): void;
}
