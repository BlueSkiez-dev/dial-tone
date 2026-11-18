/**
 * Receive pipeline: gate, carrier bank, one chunker and decoder per phase offset,
 * sibling merge, decodeFrame, own-echo flag. Pure module: no browser global.
 * Time is the stream frame only.
 */

import type { DecodeErrorCode, Frame } from "../protocol";
import { decodeFrame } from "../protocol";
import { createCarrierBank } from "./carrier";
import { CHUNK_SAMPLES } from "./constants";
import type { Modem, ModemDecoder } from "./modem";
import { createOwnEcho } from "./own-echo";
import { createPhaseChunker, DECODER_OFFSETS } from "./phase-chunker";
import type { ChannelProfile, ProfileId } from "./profiles";
import { PROFILES, RX_LISTEN_SCOPE, rxSet } from "./profiles";
import { createSiblingMerge, SIBLING_MERGE_FRAMES } from "./sibling-merge";

/** Design parameter. Equals the silence padding of the recorded evidence. */
export const TX_TAIL_GUARD_MS = 600;

export interface RxPipelineOptions {
  modem: Modem;
  /** Read only when rxScope is "active" (the CPU fallback). With "all" it plays no part in receiving. */
  profile: ChannelProfile;
  rxScope?: "all" | "active";
  decoderOffsets?: readonly number[];
  /**
   * Accepted for the transport's gate arithmetic (which adds the tail to the range it passes to
   * `gate`). The pipeline does not extend gate ranges itself, so the tail is never counted twice.
   */
  tailGuardMs?: number;
}

export type RxEvent =
  | {
      kind: "frame";
      wire: Uint8Array;
      frame: Frame;
      atFrame: number;
      ownEcho: boolean;
    }
  | {
      kind: "rejected";
      code: DecodeErrorCode;
      byteLength: number;
      atFrame: number;
    }
  | { kind: "carrier"; profile: ProfileId; active: boolean; atFrame: number }
  | { kind: "discontinuity"; atFrame: number; missingFrames: number };

export interface RxStats {
  chunks: number;
  /** Chunks wholly inside a gate range, skipped entirely. */
  gatedChunks: number;
  /** Chunks that overlapped a gate range only in part and were processed with those samples zeroed. */
  partlyGatedChunks: number;
  discontinuities: number;
  frames: number;
  rejected: Readonly<Record<string, number>>;
  decoderHits: readonly number[];
  siblingDuplicates: number;
  /** Chunks dropped because of a wrong length or a bad startFrame. Not counted in `chunks`. */
  invalidChunks: number;
}

export interface RxPipeline {
  push(chunk: { startFrame: number; samples: Float32Array }): RxEvent[];
  /**
   * Silence [fromFrame, untilFrame). Chunks wholly inside are skipped, and decoders and carrier
   * reset at both edges. Chunks overlapping only in part are processed with those samples zeroed.
   */
  gate(fromFrame: number, untilFrame: number): void;
  /** Remember our own transmission for echo detection. */
  noteSent(wire: Uint8Array, atFrame: number): void;
  /** Fallback scope only. With rxScope "all" this is a no-op. */
  setProfile(profile: ChannelProfile): Promise<void>;
  stats(): RxStats;
  dispose(): void;
}

export async function createRxPipeline(
  opts: RxPipelineOptions,
): Promise<RxPipeline> {
  const { modem } = opts;
  const rxScope = opts.rxScope ?? RX_LISTEN_SCOPE;
  const offsets: readonly number[] = opts.decoderOffsets ?? DECODER_OFFSETS;
  let profile = opts.profile;

  const chunkers = offsets.map((o) => createPhaseChunker(o));
  const carrier = createCarrierBank(modem.rxSampleRate, PROFILES);
  const merge = createSiblingMerge(SIBLING_MERGE_FRAMES);
  const echo = createOwnEcho(modem.rxSampleRate);

  // One pipeline setup is one Decoder_Setup.
  let decoders: ModemDecoder[] = await modem.createDecoders(
    rxSet(rxScope, profile),
    offsets.length,
  );

  let gates: { from: number; until: number }[] = [];
  let expectedNext: number | null = null;
  let wasGated = false;
  let disposed = false;
  let generation = 0;

  const counters = {
    chunks: 0,
    gatedChunks: 0,
    partlyGatedChunks: 0,
    discontinuities: 0,
    frames: 0,
    siblingDuplicates: 0,
    invalidChunks: 0,
  };
  const rejected: Record<string, number> = {};
  const decoderHits: number[] = offsets.map(() => 0);

  const resetAll = (): void => {
    for (const d of decoders) d.reset();
    for (const c of chunkers) c.reset();
    carrier.reset();
  };

  return {
    push(chunk) {
      const events: RxEvent[] = [];
      if (disposed) return events;
      const { startFrame, samples } = chunk;
      if (
        !(samples instanceof Float32Array) ||
        samples.length !== CHUNK_SAMPLES ||
        typeof startFrame !== "number" ||
        !Number.isInteger(startFrame) ||
        startFrame < 0
      ) {
        counters.invalidChunks++;
        return events;
      }
      counters.chunks++;

      if (expectedNext !== null && startFrame !== expectedNext) {
        resetAll();
        counters.discontinuities++;
        events.push({
          kind: "discontinuity",
          atFrame: startFrame,
          missingFrames: startFrame - expectedNext,
        });
      }
      expectedNext = startFrame + CHUNK_SAMPLES;
      const endFrame = startFrame + CHUNK_SAMPLES;

      // Drop ranges that ended before this chunk.
      gates = gates.filter((g) => g.until > startFrame);
      // A chunk wholly inside one range is skipped. A chunk that only partly overlaps a range is
      // processed with the overlapped samples zeroed, so a frame starting right after the range
      // is not lost with the rest of the chunk.
      const fullyGated = gates.some(
        (g) => g.from <= startFrame && endFrame <= g.until,
      );
      if (fullyGated) {
        if (!wasGated) resetAll();
        wasGated = true;
        counters.gatedChunks++;
        return events;
      }
      if (wasGated) {
        resetAll();
        wasGated = false;
      }

      let input = samples;
      for (const g of gates) {
        if (!(g.from < endFrame && startFrame < g.until)) continue;
        if (input === samples) input = samples.slice(); // never mutate the caller's buffer
        input.fill(
          0,
          Math.max(g.from, startFrame) - startFrame,
          Math.min(g.until, endFrame) - startFrame,
        );
      }
      if (input !== samples) counters.partlyGatedChunks++;

      for (const change of carrier.update(input, startFrame)) {
        events.push({
          kind: "carrier",
          profile: change.profile,
          active: change.active,
          atFrame: startFrame,
        });
      }

      for (let k = 0; k < decoders.length; k++) {
        const chunker = chunkers[k];
        const decoder = decoders[k];
        if (chunker === undefined || decoder === undefined) continue;
        for (const block of chunker.push(startFrame, input)) {
          const payload = decoder.feed(block);
          if (payload === null) continue;
          decoderHits[k] = (decoderHits[k] ?? 0) + 1;
          if (!merge.offer(k, payload, endFrame)) {
            counters.siblingDuplicates++;
            continue;
          }
          const decoded = decodeFrame(payload);
          if (decoded.ok) {
            counters.frames++;
            events.push({
              kind: "frame",
              wire: payload.slice(),
              frame: decoded.value,
              atFrame: endFrame,
              ownEcho: echo.isEcho(payload, endFrame),
            });
          } else {
            const code = decoded.error.code;
            rejected[code] = (rejected[code] ?? 0) + 1;
            events.push({
              kind: "rejected",
              code,
              byteLength: payload.length,
              atFrame: endFrame,
            });
          }
        }
      }
      return events;
    },

    gate(fromFrame, untilFrame) {
      if (disposed || !(untilFrame > fromFrame)) return;
      gates.push({ from: fromFrame, until: untilFrame });
    },

    noteSent(wire, atFrame) {
      echo.note(wire, atFrame);
    },

    async setProfile(next) {
      if (disposed || rxScope === "all") return;
      profile = next;
      const mine = ++generation;
      const old = decoders;
      decoders = [];
      for (const d of old) d.dispose();
      for (const c of chunkers) c.reset();
      carrier.reset();
      const created = await modem.createDecoders(
        rxSet(rxScope, profile),
        offsets.length,
      );
      if (disposed || mine !== generation) {
        for (const d of created) d.dispose();
        return;
      }
      decoders = created;
      // Drop any partly received frame and the previous stream position.
      for (const c of chunkers) c.reset();
      carrier.reset();
    },

    stats() {
      return {
        ...counters,
        rejected: { ...rejected },
        decoderHits: [...decoderHits],
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const d of decoders) d.dispose();
      decoders = [];
      gates = [];
    },
  };
}
